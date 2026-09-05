import { Router, Request, Response } from 'express';
import { SUPPORTED_MODELS } from '../config.js';
import { ModelListResponse } from '../types/openai.js';

export const modelsRouter = Router();

modelsRouter.get('/models', (req: Request, res: Response) => {
  const customModels = [
    { id: 'gpt-5.6-terra', name: 'GPT 5.6 Terra' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'o1', name: 'o1' },
    { id: 'o3-mini', name: 'o3-mini' }
  ];

  const allModels = [
    ...Object.values(SUPPORTED_MODELS),
    ...customModels.map(m => ({
      id: m.id,
      name: m.name,
      description: 'Codex / Doubao mapped model',
      need_deep_think: 0,
      use_auto_cot: false,
      bot_id: '7338286299411103781'
    }))
  ];

  const modelList: ModelListResponse = {
    object: 'list',
    data: allModels.map(model => ({
      id: model.id,
      object: 'model',
      created: 1700000000,
      owned_by: 'doubao',
      root: model.id,
      parent: null
    }))
  };

  res.json(modelList);
});

modelsRouter.get('/models/:model', (req: Request, res: Response) => {
  const model = String(req.params.model);
  const found = SUPPORTED_MODELS[model] || {
    id: model,
    name: model,
    description: 'Dynamic mapped Doubao model',
    need_deep_think: 0,
    use_auto_cot: false,
    bot_id: '7338286299411103781'
  };

  res.json({
    id: found.id,
    object: 'model',
    created: 1700000000,
    owned_by: 'doubao',
    root: found.id,
    parent: null
  });
});
