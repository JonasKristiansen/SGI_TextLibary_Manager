import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { callModel } from './aicoreClient.js';
import { loadLibraryCsv } from './libraryIndex.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const index = loadLibraryCsv(path.join(__dirname, 'library.csv'));

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body || {};
    const data = await callModel(message);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/similar', (req, res) => {
  const { query, limit = 25 } = req.body || {};
  const results = index.search(query, limit);
  res.json(results);
});

app.use('/', express.static(path.join(__dirname, 'static')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Node server listening on http://localhost:${port}`);
});


