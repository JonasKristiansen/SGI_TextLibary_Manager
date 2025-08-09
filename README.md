## SGI Text Library Manager

Modern Node.js application that:
- Uses SAP AI Core for both text embeddings and LLM inference
- Finds similar texts from PostgreSQL database using vector similarity search
- Asks the model to rank top matches with beautiful React UI

### 🚀 Features
- **PostgreSQL + pgvector**: Production-ready vector database
- **React Frontend**: Modern UI with table interface and real-time search
- **SAP AI Core Integration**: Enterprise-grade AI processing
- **Vector Similarity Search**: Efficient semantic search with 4,700+ texts
- **Real-time Results**: Live match scoring and reasoning

### 🔧 Configure
Set environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `AICORE_BASE_URL` (e.g. `https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com`)
- `AICORE_DEPLOYMENT_ID` (your LLM deployment ID)
- `AICORE_EMBEDDING_DEPLOYMENT_ID` (your embedding model deployment ID)
- `AICORE_AUTH_URL` (UAA token URL)
- `AICORE_CLIENT_ID` / `AICORE_CLIENT_SECRET`
- `AICORE_RESOURCE_GROUP` (usually `default`)
- `MODEL_FORMAT` (e.g. `anthropic` for Claude, `openai` for GPT)

### 🏃 Run
```bash
npm install
npm start
# open http://localhost:3000
```

### 📡 Endpoints
- `POST /api/similar` → vector similarity search using PostgreSQL + pgvector
- `POST /api/chat` → proxies to your SAP AI Core LLM deployment

### 🏗️ How It Works
1. **Database**: PostgreSQL with pgvector extension for vector operations
2. **Search**: Real-time vector similarity using cosine distance
3. **AI Processing**: SAP AI Core for embeddings and LLM ranking
4. **UI**: React frontend with table display and live updates

### 🎨 UI Features
- Beautiful table interface showing ID, text, and match reasons
- Real-time search with "Evaluating texts with SAP AI Core" indicator
- Capitalized match reasons for better readability
- Responsive design with modern SAP UI5 components

### 🗄️ Database Migration
Migrate from CSV to PostgreSQL:
```bash
node migrate-to-postgres.js
```

### 🏛️ Architecture
- **Database**: PostgreSQL + pgvector for vector similarity
- **Frontend**: React with SAP UI5 Web Components
- **Backend**: Node.js with Express
- **AI**: SAP AI Core `text-embedding-3-small` + LLM
- **Deployment**: Render-ready with environment configuration

