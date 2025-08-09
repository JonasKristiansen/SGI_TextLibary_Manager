#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DatabaseClient } from './databaseClient.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function migrateCSVToPostgres() {
  const csvPath = path.join(__dirname, 'library_with_embeddings.csv');
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.log('Please set DATABASE_URL in your .env file or environment');
    process.exit(1);
  }
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  console.log('🚀 Starting CSV to PostgreSQL migration...');
  console.log(`📁 Reading from: ${csvPath}`);
  console.log(`🗄️  Connecting to: ${databaseUrl.replace(/\/\/.*@/, '//***:***@')}`);
  
  const dbClient = new DatabaseClient(databaseUrl);
  
  try {
    // Initialize database schema
    await dbClient.initialize();
    
    // Check if data already exists
    const stats = await dbClient.getStats();
    if (stats.docs > 0) {
      console.log(`⚠️  Database already contains ${stats.docs} texts`);
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('Do you want to continue and add more data? (y/N): ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('Migration cancelled');
        return;
      }
    }
    
    // Read and parse CSV
    console.log('📖 Reading CSV file...');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    
    // Skip header
    const header = lines.shift();
    console.log(`📊 Found ${lines.length} data rows (excluding header)`);
    
    // Prepare data for bulk insert
    const texts = [];
    const embeddings = [];
    const originalIds = [];
    
    console.log('🔍 Parsing CSV data...');
    let validRows = 0;
    let invalidRows = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      try {
        const [id, text, embeddingStr] = parseCSVRow(line);
        
        if (!text || !text.trim()) {
          console.warn(`⚠️  Skipping row ${i + 2}: missing text`);
          invalidRows++;
          continue;
        }
        
        // Parse embedding
        let embedding = null;
        if (embeddingStr && embeddingStr.trim() && embeddingStr !== '""') {
          try {
            embedding = JSON.parse(embeddingStr);
            if (!Array.isArray(embedding) || embedding.length === 0) {
              embedding = null;
            }
          } catch (error) {
            console.warn(`⚠️  Invalid embedding format for row ${i + 2}, will regenerate`);
            embedding = null;
          }
        }
        
        texts.push(text.trim());
        embeddings.push(embedding);
        originalIds.push(id || String(validRows + 1));
        validRows++;
        
        if (validRows % 1000 === 0) {
          console.log(`   Processed ${validRows} rows...`);
        }
        
      } catch (error) {
        console.warn(`⚠️  Failed to parse row ${i + 2}: ${error.message}`);
        invalidRows++;
      }
    }
    
    console.log(`✅ Parsed ${validRows} valid rows, ${invalidRows} invalid rows`);
    
    if (validRows === 0) {
      console.error('❌ No valid data found to migrate');
      return;
    }
    
    // Bulk insert data
    console.log('💾 Inserting data into PostgreSQL...');
    const client = await dbClient.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const batchSize = 1000;
      let inserted = 0;
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batchTexts = texts.slice(i, i + batchSize);
        const batchEmbeddings = embeddings.slice(i, i + batchSize);
        const batchIds = originalIds.slice(i, i + batchSize);
        
        console.log(`   Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}...`);
        
        for (let j = 0; j < batchTexts.length; j++) {
          const embedding = batchEmbeddings[j];
          const embeddingValue = embedding ? JSON.stringify(embedding) : null;
          
          await client.query(`
            INSERT INTO text_library (original_id, text, embedding) 
            VALUES ($1, $2, $3::vector)
          `, [batchIds[j], batchTexts[j], embeddingValue]);
          
          inserted++;
        }
      }
      
      await client.query('COMMIT');
      console.log(`✅ Successfully inserted ${inserted} rows`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    // Generate missing embeddings
    const finalStats = await dbClient.getStats();
    if (finalStats.missing > 0) {
      console.log(`🤖 Generating ${finalStats.missing} missing embeddings...`);
      await dbClient.generateMissingEmbeddings();
    }
    
    // Final statistics
    const endStats = await dbClient.getStats();
    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Final statistics:`);
    console.log(`   Total texts: ${endStats.docs}`);
    console.log(`   With embeddings: ${endStats.embeddings}`);
    console.log(`   Missing embeddings: ${endStats.missing}`);
    console.log(`   Model: ${endStats.model}`);
    console.log(`   Dimensions: ${endStats.dimensions}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await dbClient.close();
  }
}

// Run migration if called directly
if (process.argv[1] === __filename) {
  migrateCSVToPostgres().catch(console.error);
}

export { migrateCSVToPostgres };
