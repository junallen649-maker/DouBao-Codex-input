import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  need_deep_think: number;
  use_auto_cot: boolean;
  bot_id: string;
}

export const DEFAULT_BOT_ID = '7338286299411103781';

export const SUPPORTED_MODELS: Record<string, ModelConfig> = {
  'doubao': {
    id: 'doubao',
    name: 'Doubao Fast',
    description: '豆包标准快速模型',
    need_deep_think: 0,
    use_auto_cot: false,
    bot_id: DEFAULT_BOT_ID
  },
  'doubao-pro': {
    id: 'doubao-pro',
    name: 'Doubao Pro',
    description: '豆包 Pro 旗舰模型',
    need_deep_think: 0,
    use_auto_cot: false,
    bot_id: DEFAULT_BOT_ID
  },
  'doubao-think': {
    id: 'doubao-think',
    name: 'Doubao Thinking',
    description: '豆包深度思考模型（带思维链）',
    need_deep_think: 1,
    use_auto_cot: false,
    bot_id: DEFAULT_BOT_ID
  },
  'doubao-expert': {
    id: 'doubao-expert',
    name: 'Doubao Expert',
    description: '豆包专家深度推理模型',
    need_deep_think: 3,
    use_auto_cot: true,
    bot_id: DEFAULT_BOT_ID
  }
};

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '0.0.0.0',
  apiKey: process.env.API_KEY || '',
  headless: process.env.HEADLESS !== 'false',
  browserChannel: process.env.BROWSER_CHANNEL || 'chrome',
  userDataDir: path.resolve(process.cwd(), process.env.USER_DATA_DIR || './.doubao_user_data'),
  defaultBotId: DEFAULT_BOT_ID,
  defaultModel: process.env.DEFAULT_MODEL || 'doubao-pro'
};
