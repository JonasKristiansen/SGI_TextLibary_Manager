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

// Load library CSV and create embeddings index using AI Core
export async function loadLibraryEmbeddings(csvPath) {
  const embedCachePath = csvPath.replace('.csv', '_embeddings.json');
  
  // Load CSV data
  const buf = fs.readFileSync(csvPath, 'utf8');
  const lines = buf.split(/\r?\n/).filter(Boolean);
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
  
  console.log(`Loaded ${docs.length} documents from CSV`);
  
  // Try to load cached embeddings
  let embeddings = null;
  let needsRecompute = true;
  
  if (fs.existsSync(embedCachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(embedCachePath, 'utf8'));
      if (cached.docs && cached.embeddings && cached.docs.length === docs.length) {
        // Check if docs are the same and model version matches
        const sameData = docs.slice(0, 5).every((doc, i) => 
          cached.docs[i] && cached.docs[i].id === doc.id && cached.docs[i].text === doc.text
        );
        
        // Check model version (text-embedding-3-small)
        const correctModel = cached.model === 'text-embedding-3-small';
        
        if (sameData && correctModel) {
          embeddings = cached.embeddings;
          needsRecompute = false;
          console.log('Loaded cached AI Core embeddings');
        } else if (!correctModel) {
          console.log('Cached embeddings use different model, will recompute');
        }
      }
    } catch (error) {
      console.log('Failed to load cached embeddings, will recompute');
    }
  }
  
  // Compute embeddings if needed using AI Core
  if (needsRecompute) {
    console.log('Computing embeddings using SAP AI Core...');
    console.log('This may take a few minutes for large libraries.');
    
    try {
      // Extract all texts for batch processing
      const texts = docs.map(doc => doc.text);
      
      // Generate embeddings in batches
      // Using defaults from aicoreEmbeddingClient.js for proper rate limiting
      embeddings = await generateBatchEmbeddings(texts);
      
      // Verify we got all embeddings
      if (embeddings.length !== docs.length) {
        throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${docs.length}`);
      }
      
      // Cache the embeddings with model info
      try {
        const cacheData = {
          docs: docs,
          embeddings: embeddings,
          model: 'text-embedding-3-small',
          dimensions: embeddings[0]?.length,
          timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(embedCachePath, JSON.stringify(cacheData));
        console.log(`Cached ${embeddings.length} embeddings to disk (${cacheData.dimensions} dimensions)`);
      } catch (error) {
        console.log('Failed to cache embeddings:', error.message);
      }
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
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
        const similarities = embeddings.map((docEmbedding, index) => ({
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
    dimensions: embeddings[0]?.length
  };
}

// Utility function to regenerate embeddings for the entire library
export async function regenerateAllEmbeddings(csvPath) {
  const embedCachePath = csvPath.replace('.csv', '_embeddings.json');
  
  // Remove existing cache to force regeneration
  if (fs.existsSync(embedCachePath)) {
    fs.unlinkSync(embedCachePath);
    console.log('Removed existing embedding cache');
  }
  
  // Regenerate
  return await loadLibraryEmbeddings(csvPath);
}
