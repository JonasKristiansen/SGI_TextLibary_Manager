import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration with proper environment variable reading
const cfg = {
  baseUrl: process.env.AICORE_BASE_URL || 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com',
  embeddingDeploymentId: process.env.AICORE_EMBEDDING_DEPLOYMENT_ID || 'da8459b6a7af1825',
  resourceGroup: process.env.AICORE_RESOURCE_GROUP || 'default',
  clientId: process.env.AICORE_CLIENT_ID || 'sb-c26950b9-d78a-4dd3-b7fb-c2f822c67e641b4850',
  clientSecret: process.env.AICORE_CLIENT_SECRET || 'c6e2d6d5-40f5-4230-88a8-b2a4da95db8d$V4t',
  authUrl: process.env.AICORE_AUTH_URL || 'https://btp-dev-ioch0ul7.authentication.eu10.hana.ondemand.com/oauth/token',
};

// Cache token with expiry
let tokenCache = {
  token: null,
  expiresAt: 0
};

async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', cfg.clientId);
  params.append('client_secret', cfg.clientSecret);
  
  const { data } = await axios.post(cfg.authUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  
  // Cache token with expiry
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);
  
  return data.access_token;
}

export async function generateEmbedding(textOrTexts) {
  // Handle both single text and array of texts
  const isArray = Array.isArray(textOrTexts);
  const texts = isArray ? textOrTexts : [textOrTexts];
  
  if (!texts.length || texts.some(t => typeof t !== 'string')) {
    throw new Error('Valid text input(s) required for embedding generation');
  }

  const token = await getAccessToken();
  
  const headers = {
    Authorization: `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'AI-Resource-Group': cfg.resourceGroup,
  };

  // Use the working endpoint with api-version parameter
  // Using 2023-05-15 which is confirmed to work with SAP AI Core
  // Newer versions like 2024-06-01 may not be fully supported yet
  const url = `${cfg.baseUrl}/v2/inference/deployments/${cfg.embeddingDeploymentId}/embeddings?api-version=2023-05-15`;
  
  // Azure OpenAI accepts arrays of text for batch processing
  const body = { input: texts };

  try {
    const { data, status } = await axios.post(url, body, { 
      headers, 
      timeout: 60000  // Increased timeout for larger batches
    });

    if (status >= 200 && status < 300) {
      // Extract embeddings from OpenAI response format
      if (data.data && Array.isArray(data.data)) {
        const embeddings = data.data.map(item => item.embedding);
        // Return array for batch, single embedding for single text
        return isArray ? embeddings : embeddings[0];
      }
      
      throw new Error('Unexpected embedding response format');
    }
    
    throw new Error(`Embedding request failed with status ${status}`);
  } catch (error) {
    if (error.response) {
      console.error('AI Core Embedding Error:', error.response.data);
      throw new Error(`Embedding generation failed: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

export async function generateBatchEmbeddings(texts, options = {}) {
  const { 
    batchSize = 100,   // Process 100 texts in a single API call!
    delayMs = 1000,   // 10 second delay between API calls
    maxRetries = 5,    // More retries
    initialWaitMs = 10000  // Wait 60 seconds before starting to let rate limits fully reset
  } = options;
  
  // Initial wait to let any previous rate limits clear
  if (initialWaitMs > 0) {
    console.log(`Waiting ${initialWaitMs/1000} seconds before starting embeddings to let rate limits reset...`);
    await new Promise(resolve => setTimeout(resolve, initialWaitMs));
  }

  const embeddings = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    // Process batch with retry logic
    let retries = 0;
    let batchEmbeddings = null;
    
    while (retries < maxRetries && !batchEmbeddings) {
      try {
        // Send all texts in batch as a single API call
        batchEmbeddings = await generateEmbedding(batch);
        
        // batchEmbeddings should be an array of embeddings
        if (Array.isArray(batchEmbeddings)) {
          embeddings.push(...batchEmbeddings);
        } else {
          throw new Error('Unexpected batch embedding response');
        }
      } catch (error) {
        if (error.message && error.message.includes('TooManyRequest')) {
          retries++;
          const waitTime = retries * 30; // 30s, 60s, 90s, 120s, 150s for retries
          console.log(`Rate limit hit, retry ${retries}/${maxRetries} after ${waitTime} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000)); // Much longer exponential backoff
        } else {
          throw error; // Re-throw non-rate-limit errors
        }
      }
    }
    
    if (!batchEmbeddings) {
      throw new Error('Failed to generate embeddings after max retries due to rate limiting');
    }
    
    // Rate limiting between batches
    if (i + batchSize < texts.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    // Progress logging
    const processed = Math.min(i + batchSize, texts.length);
    console.log(`Generated embeddings: ${processed}/${texts.length}`);
  }
  
  return embeddings;
}
