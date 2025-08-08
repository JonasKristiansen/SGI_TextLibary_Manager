import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

// Global embedding pipeline instance
let embedder = null;

// Initialize the embedding model (loads once, reused for all operations)
async function initEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model (this may take a moment on first run)...');
    try {
      // Using all-MiniLM-L6-v2 - lightweight but effective for semantic similarity
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            console.log(`Downloading model: ${Math.round(progress.progress || 0)}%`);
          }
        }
      });
      console.log('Embedding model loaded successfully');
    } catch (error) {
      console.error('Failed to load embedding model:', error.message);
      throw error;
    }
  }
  return embedder;
}

// Compute embedding for a single text
async function embedText(text) {
  const model = await initEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

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

// Load library CSV and create embeddings index
export async function loadLibraryEmbeddings(csvPath) {
  const embedCachePath = csvPath.replace('.csv', '_embeddings.json');
  
  // Load CSV data
  const buf = fs.readFileSync(csvPath, 'utf8');
  const lines = buf.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  const idxId = header.split(',').indexOf('id');
  const idxText = header.split(',').indexOf('text');
  
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
        // Quick check if docs are the same (compare first few)
        const sameData = docs.slice(0, 5).every((doc, i) => 
          cached.docs[i] && cached.docs[i].id === doc.id && cached.docs[i].text === doc.text
        );
        if (sameData) {
          embeddings = cached.embeddings;
          needsRecompute = false;
          console.log('Loaded cached embeddings');
        }
      }
    } catch (error) {
      console.log('Failed to load cached embeddings, will recompute');
    }
  }
  
  // Compute embeddings if needed
  if (needsRecompute) {
    console.log('Computing embeddings for all documents...');
    embeddings = [];
    
    // Initialize the model once before processing
    const model = await initEmbedder();
    
    // Process in smaller batches sequentially to avoid overwhelming the network
    const batchSize = 10;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      
      // Process batch sequentially to avoid network issues
      for (const doc of batch) {
        const output = await model(doc.text, { pooling: 'mean', normalize: true });
        embeddings.push(Array.from(output.data));
      }
      
      const progress = Math.min(i + batchSize, docs.length);
      console.log(`Computed embeddings: ${progress}/${docs.length}`);
    }
    
    // Cache the embeddings
    try {
      fs.writeFileSync(embedCachePath, JSON.stringify({
        docs: docs,
        embeddings: embeddings,
        timestamp: new Date().toISOString()
      }));
      console.log('Cached embeddings to disk');
    } catch (error) {
      console.log('Failed to cache embeddings:', error.message);
    }
  }
  
  // Create search function
  function search(query, limit = 25) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get query embedding
        const queryEmbedding = await embedText(query);
        
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
        
        resolve(results);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  return { search, docs: docs.length };
}
