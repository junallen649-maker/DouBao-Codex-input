import fs from 'fs';
import path from 'path';
import os from 'os';

const codexDir = path.join(os.homedir(), '.codex');
const configPath = path.join(codexDir, 'config.toml');

if (!fs.existsSync(codexDir)) {
  fs.mkdirSync(codexDir, { recursive: true });
}

let content = '';
if (fs.existsSync(configPath)) {
  content = fs.readFileSync(configPath, 'utf8');
}

const doubaoProviderBlock = `
model = "gpt-5.6-terra"
model_provider = "doubao"

[model_providers.doubao]
name = "Doubao Proxy"
base_url = "http://127.0.0.1:8000/v1"
env_key = "DOUBAO_API_KEY"
wire_api = "responses"
`;

if (content.includes('[model_providers.doubao]')) {
  console.log('✅ [model_providers.doubao] already configured in:', configPath);
} else {
  content = content.trim() + '\n' + doubaoProviderBlock.trim() + '\n';
  fs.writeFileSync(configPath, content, 'utf8');
  console.log('✅ Successfully configured Doubao provider in:', configPath);
}
