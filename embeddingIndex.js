import fs from 'fs';
import path from 'path';
import { generateEmbedding, generateBatchEmbeddings } from './aicoreEmbeddingClient.js';

// Compute cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Parse a CSV row with proper quote handling
function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < row.length) {
    const char = row[i];
    const nextChar = row[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i += 2;
      } else {
        // Start or end of quoted field
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  result.push(current);
  return result;
}

// Convert CSV line to proper format for writing
function formatCSVRow(id, text, embedding) {
  // Escape text field
  const escapedText = '"' + text.replace(/"/g, '""') + '"';
  
  // Format embedding
  let embeddingStr = '""'; // Empty by default
  if (embedding && Array.isArray(embedding) && embedding.length > 0) {
    embeddingStr = '"' + JSON.stringify(embedding).replace(/"/g, '""') + '"';
  }
  
  return `${id},${escapedText},${embeddingStr}`;
}

// Load library CSV with embeddings and generate missing ones incrementally
export async function loadLibraryEmbeddings(csvPath) {
  console.log(`Loading library from: ${csvPath}`);
  
  // Check if file exists
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Library file not found: ${csvPath}`);
  }
  
  // Load CSV data
  const buf = fs.readFileSync(csvPath, 'utf8');
  const lines = buf.split(/\r?\n/).filter(Boolean);
  const header = lines.shift(); // Remove header
  
  // Check if this is the new 3-column format
  const hasEmbeddingColumn = header.includes('embedding');
  
  if (!hasEmbeddingColumn) {
    throw new Error('CSV file must have "id,text,embedding" format. Please use the migration script first.');
  }
  
  const docs = [];
  const embeddings = [];
  const textsNeedingEmbeddings = [];
  const indicesNeedingEmbeddings = [];
  
  console.log('Parsing CSV data...');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    try {
      const [id, text, embeddingStr] = parseCSVRow(line);
      
      if (!text) {
        console.warn(`Skipping row ${i + 2}: missing text`);
        continue;
      }
      
      const doc = { 
        id: id || String(docs.length + 1), 
        text: text.trim() 
      };
      docs.push(doc);
      
      // Check if embedding exists and is valid
      let embedding = null;
      if (embeddingStr && embeddingStr.trim() && embeddingStr !== '""') {
        try {
          embedding = JSON.parse(embeddingStr);
          if (!Array.isArray(embedding) || embedding.length === 0) {
            embedding = null;
          }
        } catch (error) {
          console.warn(`Invalid embedding format for row ${i + 2}, will regenerate`);
          embedding = null;
        }
      }
      
      if (embedding) {
        embeddings.push(embedding);
      } else {
        // This text needs an embedding
        textsNeedingEmbeddings.push(doc.text);
        indicesNeedingEmbeddings.push(docs.length - 1);
        embeddings.push(null); // Placeholder
      }
    } catch (error) {
      console.warn(`Failed to parse row ${i + 2}: ${error.message}`);
    }
  }
  
  console.log(`Loaded ${docs.length} documents from CSV`);
  console.log(`Found ${embeddings.filter(e => e !== null).length} existing embeddings`);
  console.log(`Need to generate ${textsNeedingEmbeddings.length} new embeddings`);
  
  // Generate missing embeddings if needed
  if (textsNeedingEmbeddings.length > 0) {
    console.log('Generating missing embeddings using SAP AI Core...');
    console.log('This may take a few minutes for large numbers of missing embeddings.');
    
    try {
      // Generate embeddings for texts that don't have them
      const newEmbeddings = await generateBatchEmbeddings(textsNeedingEmbeddings);
      
      // Verify we got all embeddings
      if (newEmbeddings.length !== textsNeedingEmbeddings.length) {
        throw new Error(`Embedding count mismatch: got ${newEmbeddings.length}, expected ${textsNeedingEmbeddings.length}`);
      }
      
      // Insert new embeddings into the correct positions
      for (let i = 0; i < indicesNeedingEmbeddings.length; i++) {
        const index = indicesNeedingEmbeddings[i];
        embeddings[index] = newEmbeddings[i];
      }
      
      console.log(`Generated ${newEmbeddings.length} new embeddings`);
      
      // Write updated CSV back to file
      console.log('Updating CSV file with new embeddings...');
      
      let csvContent = 'id,text,embedding\n';
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const embedding = embeddings[i];
        csvContent += formatCSVRow(doc.id, doc.text, embedding) + '\n';
      }
      
      // Write to file
      fs.writeFileSync(csvPath, csvContent);
      console.log(`✅ Updated ${csvPath} with new embeddings`);
      
    } catch (error) {
      console.error('Failed to generate missing embeddings:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  } else {
    console.log('✅ All documents already have embeddings');
  }
  
  // Verify all embeddings are present
  const finalEmbeddings = embeddings.filter(e => e !== null);
  if (finalEmbeddings.length !== docs.length) {
    throw new Error(`Missing embeddings: have ${finalEmbeddings.length}, need ${docs.length}`);
  }
  
  // Create search function
  function search(query, limit = 25) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`Searching for: "${query.substring(0, 50)}..."`);
        
        // Get query embedding from AI Core
        const queryEmbedding = await generateEmbedding(query);
        
        // Validate embedding
        if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
          throw new Error('Failed to generate query embedding');
        }
        
        // Compute similarities
        const similarities = finalEmbeddings.map((docEmbedding, index) => ({
          index,
          similarity: cosineSimilarity(queryEmbedding, docEmbedding)
        }));
        
        // Sort by similarity (highest first) and take top results
        similarities.sort((a, b) => b.similarity - a.similarity);
        const topResults = similarities.slice(0, limit);
        
        // Format results
        const results = topResults.map(({ index, similarity }) => ({
          id: docs[index].id,
          text: docs[index].text,
          score: Number(similarity.toFixed(4))
        }));
        
        console.log(`Found ${results.length} results, top score: ${results[0]?.score || 0}`);
        resolve(results);
      } catch (error) {
        console.error('Search error:', error);
        reject(error);
      }
    });
  }
  
  return { 
    search, 
    docs: docs.length,
    model: 'text-embedding-3-small',
    dimensions: finalEmbeddings[0]?.length
  };
}

// Utility function to migrate from old 2-column format to new 3-column format
export async function migrateToNewFormat(oldCsvPath, embeddingsJsonPath, newCsvPath) {
  console.log('Migrating to new 3-column format...');
  
  // Load old CSV
  const csvData = fs.readFileSync(oldCsvPath, 'utf8');
  const lines = csvData.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  
  const docs = [];
  for (const line of lines) {
    const [id, text] = line.split(/,(.*)/s).slice(0, 2);
    if (!text) continue;
    docs.push({ 
      id: id || String(docs.length + 1), 
      text: text.trim() 
    });
  }
  
  // Load embeddings if available
  let embeddings = null;
  if (fs.existsSync(embeddingsJsonPath)) {
    try {
      const embeddingData = JSON.parse(fs.readFileSync(embeddingsJsonPath, 'utf8'));
      embeddings = embeddingData.embeddings;
    } catch (error) {
      console.log('Failed to load embeddings:', error.message);
    }
  }
  
  // Create new CSV content
  let csvContent = 'id,text,embedding\n';
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const embedding = embeddings && embeddings[i] ? embeddings[i] : null;
    csvContent += formatCSVRow(doc.id, doc.text, embedding) + '\n';
  }
  
  // Write new file
  fs.writeFileSync(newCsvPath, csvContent);
  console.log(`✅ Migrated data to ${newCsvPath}`);
  
  return newCsvPath;
}

// Utility function to add new texts to the library
export async function addTextsToLibrary(csvPath, newTexts) {
  console.log(`Adding ${newTexts.length} new texts to library...`);
  
  // Read existing data
  const buf = fs.readFileSync(csvPath, 'utf8');
  const lines = buf.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  
  // Find the highest existing ID
  let maxId = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const [id] = parseCSVRow(line);
    const numId = parseInt(id, 10);
    if (!isNaN(numId) && numId > maxId) {
      maxId = numId;
    }
  }
  
  // Add new texts with empty embeddings
  let csvContent = buf.endsWith('\n') ? buf : buf + '\n';
  
  for (let i = 0; i < newTexts.length; i++) {
    const newId = String(maxId + i + 1).padStart(8, '0');
    const newText = newTexts[i];
    csvContent += formatCSVRow(newId, newText, null) + '\n';
  }
  
  // Write updated file
  fs.writeFileSync(csvPath, csvContent);
  console.log(`✅ Added ${newTexts.length} new texts to ${csvPath}`);
  
  // Now load and generate embeddings for the new texts
  return await loadLibraryEmbeddings(csvPath);
}