## Text Library Checker (Node)

Minimal Node.js app that:
- Calls a deployed model on SAP AI Launchpad / SAP AI Core for judgments
- Finds similar texts from a small CSV library and asks the model to rank top-3 possible matches

### Configure
Create `.env` from `env.example` and set your SAP AI Core credentials and deployment:
- `AICORE_BASE_URL` (e.g. `https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com`)
- `AICORE_DEPLOYMENT_ID` (your deployment ID)
- `AICORE_AUTH_URL` (UAA token URL: `<uaa.url>/oauth/token`)
- `AICORE_CLIENT_ID` / `AICORE_CLIENT_SECRET`
- `AICORE_RESOURCE_GROUP` (usually `default`)
- `AICORE_INVOCATION_PATH` set to your deployment’s invoke path (e.g. `/v2/inference/deployments/<id>/invoke`)
- `MODEL_FORMAT=anthropic` (for Bedrock Claude deployments)

### Run
```bash
npm install
npm start
# open http://localhost:3000
```

### Endpoints
- `POST /api/similar` → returns library candidates for a query (reads `library.csv`)
- `POST /api/chat` → proxies the judgment to your SAP AI Core deployment

### UI
Static chat UI at `/`:
- Shows top candidates found in the CSV library
- Sends a concise instruction to the model to return a ranked top-3 (or “No exact match.”)

This app relies on your deployed model in SAP AI Launchpad / AI Core; no model weights are hosted here.

