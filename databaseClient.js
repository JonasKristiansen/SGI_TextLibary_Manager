import pg from 'pg';
import { generateEmbedding, generateBatchEmbeddings } from './aicoreEmbeddingClient.js';

const { Pool } = pg;

class DatabaseClient {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Render PostgreSQL requires SSL
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  // Initialize database schema and pgvector extension
  async initialize() {
    const client = await this.pool.connect();
    try {
      console.log('Initializing database schema...');
      
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      
      // Create table with vector column
      await client.query(`
        CREATE TABLE IF NOT EXISTS text_library (
          id SERIAL PRIMARY KEY,
          original_id VARCHAR(255),
          text TEXT NOT NULL,
          embedding vector(1536),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Create index for vector similarity search
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_text_library_embedding 
        ON text_library USING ivfflat (embedding vector_cosine_ops) 
        WITH (lists = 100)
      `);
      
      // Create text search index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_text_library_text 
        ON text_library USING gin(to_tsvector('english', text))
      `);
      
      console.log('✅ Database schema initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Compute cosine similarity between two vectors
  cosineSimilarity(vecA, vecB) {
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

  // Search for similar texts using vector similarity
  async search(query, limit = 25) {
    console.log(`Searching for: "${query.substring(0, 50)}..."`);
    
    const client = await this.pool.connect();
    try {
      // Get query embedding from AI Core
      const queryEmbedding = await generateEmbedding(query);
      
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        throw new Error('Failed to generate query embedding');
      }

      // Search using pgvector cosine similarity
      const result = await client.query(`
        SELECT 
          id,
          original_id,
          text,
          1 - (embedding <=> $1::vector) as similarity
        FROM text_library 
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `, [JSON.stringify(queryEmbedding), limit]);

      const results = result.rows.map(row => ({
        id: row.original_id || row.id,
        text: row.text,
        score: Number(row.similarity.toFixed(4))
      }));

      console.log(`Found ${results.length} results, top score: ${results[0]?.score || 0}`);
      return results;
      
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Add new texts to the library
  async addTexts(texts) {
    console.log(`Adding ${texts.length} new texts to library...`);
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Find the highest existing original_id
      const maxIdResult = await client.query(`
        SELECT COALESCE(MAX(CAST(original_id AS INTEGER)), 0) as max_id 
        FROM text_library 
        WHERE original_id ~ '^[0-9]+$'
      `);
      
      let maxId = maxIdResult.rows[0].max_id || 0;
      
      // Insert new texts
      for (let i = 0; i < texts.length; i++) {
        const newId = String(maxId + i + 1).padStart(8, '0');
        await client.query(`
          INSERT INTO text_library (original_id, text) 
          VALUES ($1, $2)
        `, [newId, texts[i]]);
      }
      
      await client.query('COMMIT');
      console.log(`✅ Added ${texts.length} new texts to library`);
      
      // Generate embeddings for new texts
      await this.generateMissingEmbeddings();
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to add texts:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Generate embeddings for texts that don't have them
  async generateMissingEmbeddings() {
    const client = await this.pool.connect();
    try {
      // Find texts without embeddings
      const result = await client.query(`
        SELECT id, text 
        FROM text_library 
        WHERE embedding IS NULL
        ORDER BY id
      `);

      if (result.rows.length === 0) {
        console.log('✅ All texts already have embeddings');
        return;
      }

      console.log(`Generating embeddings for ${result.rows.length} texts...`);
      
      // Extract texts and IDs for batch processing
      const textsToProcess = result.rows.map(row => row.text);
      const idsToProcess = result.rows.map(row => row.id);
      
      // Use smaller batches to avoid memory issues and timeouts
      const embeddings = await generateBatchEmbeddings(textsToProcess, {
        batchSize: 20,         // Much smaller batch size to prevent server overload
        delayMs: 5000,         // 5 seconds between batches  
        maxRetries: 3,         // Fewer retries to avoid long hangs
        initialWaitMs: 5000    // Shorter initial wait
      });
      
      // Update database with generated embeddings
      console.log('📝 Updating database with generated embeddings...');
      await client.query('BEGIN');
      
      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i];
        const textId = idsToProcess[i];
        
        if (embedding && Array.isArray(embedding)) {
          await client.query(`
            UPDATE text_library 
            SET embedding = $1::vector, updated_at = NOW() 
            WHERE id = $2
          `, [JSON.stringify(embedding), textId]);
        } else {
          console.warn(`Invalid embedding generated for text ID ${textId}`);
        }
      }
      
      await client.query('COMMIT');
      console.log('✅ Successfully updated all embeddings in database');
      console.log('✅ Finished generating embeddings');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to generate embeddings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Get library statistics
  async getStats() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_texts,
          COUNT(embedding) as texts_with_embeddings,
          COUNT(*) - COUNT(embedding) as texts_without_embeddings
        FROM text_library
      `);
      
      return {
        docs: parseInt(result.rows[0].total_texts),
        embeddings: parseInt(result.rows[0].texts_with_embeddings),
        missing: parseInt(result.rows[0].texts_without_embeddings),
        model: 'text-embedding-3-small',
        dimensions: 1536
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Close database connections
  async close() {
    await this.pool.end();
  }
}

export { DatabaseClient };
