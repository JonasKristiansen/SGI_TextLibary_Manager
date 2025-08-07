## Simple caller for SAP AI Launchpad deployment

This is a minimal Python script that obtains an OAuth token and sends a text prompt to a deployed model in SAP AI Launchpad / AI Core.

### Prerequisites
- Python 3.9+
- A service key for your SAP AI Core (or Generative AI Hub) instance with client credentials

### Configure
Create a `.env` file (or export env vars) using `.env.example` as a template.

- `AICORE_BASE_URL`: e.g. `https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com`
- `AICORE_DEPLOYMENT_ID`: e.g. `dd8d0dd3b220f91c`
- `AICORE_AUTH_URL`: OAuth token URL from your service key (often `uaa.url + /oauth/token`)
- `AICORE_CLIENT_ID` / `AICORE_CLIENT_SECRET`: from the service key
- `AICORE_RESOURCE_GROUP`: your AI resource group (often `default`)
- `MODEL_FORMAT`: `openai` (recommended) or `anthropic`

### Install
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run
Send a quick prompt:
```bash
python main.py --prompt "Say hello in one sentence"
```

### Start the web chat UI
```bash
uvicorn server:app --reload --port 8000
# then open http://localhost:8000 in your browser (served by FastAPI's static mount below if you add it)
```


The script will:
- Fetch an access token
- Try several common invocation paths for deployments
- Print the response JSON or a clear error summary

### Notes
- If you know the exact invocation path for your deployment, set `AICORE_INVOCATION_PATH` to override the auto-try logic (e.g. `/v2/inference/deployments/{deploymentId}/invocations`).
- If your setup expects OpenAI-compatible payloads, leave `MODEL_FORMAT=openai` (the script also sends the `AI-Model-Format: openai` header).
- For provider-native payloads (e.g., Anthropic via Bedrock), set `MODEL_FORMAT=anthropic`.


