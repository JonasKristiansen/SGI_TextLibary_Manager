import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { callModel } from './aicoreClient.js';
import { loadLibraryEmbeddings } from './embeddingIndex.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Initialize the embedding index (async)
let index = null;
console.log('Initializing embedding index...');
loadLibraryEmbeddings(path.join(__dirname, 'library.csv')).then(embeddingIndex => {
  index = embeddingIndex;
  console.log(`Embedding index ready with ${embeddingIndex.docs} documents`);
}).catch(error => {
  console.error('Failed to initialize embedding index:', error);
  process.exit(1);
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body || {};
    const data = await callModel(message);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/similar', async (req, res) => {
  try {
    if (!index) {
      return res.status(503).json({ error: 'Embedding index not ready yet. Please wait a moment and try again.' });
    }
    
    const { query, limit = 25 } = req.body || {};
    const results = await index.search(query, limit);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

app.use('/', express.static(path.join(__dirname, 'static')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Node server listening on http://localhost:${port}`);
});


