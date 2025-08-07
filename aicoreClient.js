import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const cfg = {
  baseUrl: (process.env.AICORE_BASE_URL || '').replace(/\/$/, ''),
  deploymentId: process.env.AICORE_DEPLOYMENT_ID,
  resourceGroup: process.env.AICORE_RESOURCE_GROUP || 'default',
  clientId: process.env.AICORE_CLIENT_ID,
  clientSecret: process.env.AICORE_CLIENT_SECRET,
  authUrl: process.env.AICORE_AUTH_URL,
  invocationPath: process.env.AICORE_INVOCATION_PATH || '',
  modelFormat: (process.env.MODEL_FORMAT || 'openai').toLowerCase(),
};

async function getAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', cfg.clientId);
  params.append('client_secret', cfg.clientSecret);
  const { data } = await axios.post(cfg.authUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data.access_token;
}

export async function callModel(message) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'AI-Resource-Group': cfg.resourceGroup,
    'AI-Model-Format': cfg.modelFormat === 'anthropic' ? 'anthropic' : 'openai',
  };

  // Prefer explicit invoke for Anthropic
  if (cfg.invocationPath && cfg.modelFormat === 'anthropic') {
    const url = `${cfg.baseUrl}${cfg.invocationPath}`;
    const body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2048,
      messages: [{ role: 'user', content: message }],
    };
    const { data } = await axios.post(url, body, { headers, timeout: 60000 });
    return data;
  }

  // Fallback candidates
  const dep = cfg.deploymentId;
  const paths = [
    `/v2/inference/deployments/${dep}/chat/completions`,
    `/v2/inference/deployments/${dep}/completions`,
    `/v2/inference/deployments/${dep}/v1/messages`,
    `/v2/inference/deployments/${dep}/messages`,
    `/v2/inference/deployments/${dep}/invoke`,
    `/v2/inference/deployments/${dep}`,
  ];
  const bodies = cfg.modelFormat === 'anthropic'
    ? [{ anthropic_version: 'bedrock-2023-05-31', max_tokens: 2048, messages: [{ role: 'user', content: message }] }]
    : [
        { messages: [{ role: 'user', content: message }], temperature: 0.2 },
        { input: [{ role: 'user', content: [{ type: 'text', text: message }] }], temperature: 0.2 },
      ];

  for (const p of paths) {
    for (const b of bodies) {
      try {
        const { data, status } = await axios.post(`${cfg.baseUrl}${p}`, b, { headers, timeout: 60000, validateStatus: () => true });
        if (status >= 200 && status < 300) return data;
      } catch {}
    }
  }
  throw new Error('Invocation failed for all candidates');
}


