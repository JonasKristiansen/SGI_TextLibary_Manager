import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { callModel } from './aicoreClient.js';
import { DatabaseClient } from './databaseClient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Initialize the database client (async)
let dbClient = null;
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  console.log('Initializing PostgreSQL database connection...');
  dbClient = new DatabaseClient(databaseUrl);
  
  dbClient.initialize()
    .then(() => dbClient.getStats())
    .then(stats => {
      console.log(`✅ Database ready with ${stats.docs} documents`);
      console.log(`📊 Embeddings: ${stats.embeddings}, Missing: ${stats.missing}`);
      console.log(`🤖 Using model: ${stats.model} (${stats.dimensions} dimensions)`);
      
      // Generate missing embeddings if needed
      if (stats.missing > 0) {
        console.log(`🔄 Generating ${stats.missing} missing embeddings in background...`);
        dbClient.generateMissingEmbeddings().catch(error => {
          console.error('Background embedding generation failed:', error);
        });
      }
    })
    .catch(error => {
      console.error('Failed to initialize database:', error);
      console.warn('Server will continue running without database functionality.');
      console.warn('Please check your DATABASE_URL and database configuration.');
      dbClient = null;
    });
} else {
  console.warn('DATABASE_URL not found. Running without database functionality.');
  console.warn('Set DATABASE_URL environment variable to enable embedding search.');
}

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
    if (!dbClient) {
      return res.status(503).json({ error: 'Database not ready yet. Please wait a moment and try again.' });
    }
    
    const { query, limit = 25 } = req.body || {};
    const results = await dbClient.search(query, limit);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    if (!dbClient) {
      return res.status(503).json({ error: 'Database not ready yet. Please wait a moment and try again.' });
    }
    
    const stats = await dbClient.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats: ' + error.message });
  }
});

app.use('/', express.static(path.join(__dirname, 'static')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Node server listening on http://localhost:${port}`);
});


