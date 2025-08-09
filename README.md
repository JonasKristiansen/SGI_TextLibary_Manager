## Text Library Checker

Node.js application that:
- Uses SAP AI Core for both text embeddings and LLM inference
- Finds similar texts from a CSV library using semantic search
- Asks the model to rank top-3 possible matches

### Configure
Create `.env` from `env.example` and set your SAP AI Core credentials:
- `AICORE_BASE_URL` (e.g. `https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com`)
- `AICORE_DEPLOYMENT_ID` (your LLM deployment ID)
- `AICORE_EMBEDDING_DEPLOYMENT_ID` (your embedding model deployment ID)
- `AICORE_AUTH_URL` (UAA token URL: `<uaa.url>/oauth/token`)
- `AICORE_CLIENT_ID` / `AICORE_CLIENT_SECRET`
- `AICORE_RESOURCE_GROUP` (usually `default`)
- `AICORE_INVOCATION_PATH` (optional, for specific invoke paths)
- `MODEL_FORMAT` (e.g. `anthropic` for Claude, `openai` for GPT)

### Run
```bash
npm install
npm start
# open http://localhost:3000
```

### Endpoints
- `POST /api/similar` → returns semantically similar texts from library using AI Core embeddings
- `POST /api/chat` → proxies to your SAP AI Core LLM deployment

### How It Works
1. **Initial Setup**: On first run, generates embeddings for all texts in `library.csv` using SAP AI Core
2. **Caching**: Embeddings are cached in `library_embeddings.json` for fast subsequent startups
3. **Search**: Queries are embedded using the same model and compared using cosine similarity
4. **Ranking**: The LLM is asked to rank the top candidates

### UI
Static chat UI at `/`:
- Shows top candidates found via semantic search
- Sends candidates to the LLM for final ranking

### Testing
Test the embedding connection:
```bash
node testEmbedding.js
```

### Architecture
- **Embeddings**: SAP AI Core `text-embedding-3-small` model
- **LLM**: Your deployed model on SAP AI Core
- **No local models**: All AI processing happens in the cloud

