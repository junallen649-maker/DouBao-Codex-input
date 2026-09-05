import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatCompletionRequest } from '../types/openai.js';
import { OpenAIConverter } from '../services/openai/converter.js';
import { DoubaoBrowserDriver } from '../services/doubao/browser-driver.js';
import { config, SUPPORTED_MODELS } from '../config.js';

export const chatRouter = Router();

chatRouter.post('/chat/completions', async (req: Request, res: Response) => {
  const body = req.body as ChatCompletionRequest;

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'Missing or empty "messages" field in request body',
        type: 'invalid_request_error',
        param: 'messages',
        code: 'missing_required_parameter'
      }
    });
  }

  const modelId = body.model || config.defaultModel;
  const isStream = Boolean(body.stream);
  const prompt = OpenAIConverter.messagesToPrompt(body.messages);
  const conversationId = body.conversation_id;
  const completionId = `chatcmpl-${uuidv4()}`;

  const driver = DoubaoBrowserDriver.getInstance();

  if (isStream) {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send initial chunk
    res.write(OpenAIConverter.createInitialChunk(completionId, modelId));

    let isFinished = false;

    // Handle client disconnect
    req.on('close', () => {
      isFinished = true;
    });

    try {
      await driver.chatCompletion({
        model: modelId,
        prompt,
        conversationId,
        onChunk: (deltaText, currentConvId) => {
          if (isFinished) return;
          res.write(
            OpenAIConverter.createDeltaChunk(
              completionId,
              modelId,
              { content: deltaText },
              currentConvId
            )
          );
        },
        onReasoning: (reasoningDelta) => {
          if (isFinished) return;
          res.write(
            OpenAIConverter.createDeltaChunk(
              completionId,
              modelId,
              { reasoning_content: reasoningDelta },
              conversationId
            )
          );
        },
        onFinish: (finalConvId) => {
          if (isFinished) return;
          isFinished = true;
          res.write(OpenAIConverter.createFinalChunk(completionId, modelId, finalConvId));
          res.end();
        },
        onError: (err) => {
          if (isFinished) return;
          isFinished = true;
          const errChunk = {
            error: {
              message: err.message || 'Doubao API execution error',
              type: 'api_error',
              param: null,
              code: 'upstream_error'
            }
          };
          res.write(`data: ${JSON.stringify(errChunk)}\n\ndata: [DONE]\n\n`);
          res.end();
        }
      });
    } catch (err: any) {
      if (!isFinished) {
        res.write(
          `data: ${JSON.stringify({
            error: {
              message: err.message || 'Server error',
              type: 'server_error',
              param: null,
              code: 'internal_error'
            }
          })}\n\ndata: [DONE]\n\n`
        );
        res.end();
      }
    }
  } else {
    // Non-streaming JSON response
    let fullContent = '';
    let fullReasoning = '';
    let resultConvId = conversationId;

    try {
      await driver.chatCompletion({
        model: modelId,
        prompt,
        conversationId,
        onChunk: (deltaText, currentConvId) => {
          fullContent += deltaText;
          if (currentConvId) resultConvId = currentConvId;
        },
        onReasoning: (reasoningDelta) => {
          fullReasoning += reasoningDelta;
        },
        onFinish: (finalConvId) => {
          if (finalConvId) resultConvId = finalConvId;
          const response = OpenAIConverter.createResponse(
            completionId,
            modelId,
            fullContent,
            fullReasoning || undefined,
            resultConvId
          );
          res.json(response);
        },
        onError: (err) => {
          res.status(502).json({
            error: {
              message: err.message || 'Doubao upstream error',
              type: 'upstream_error',
              param: null,
              code: 'bad_gateway'
            }
          });
        }
      });
    } catch (err: any) {
      res.status(500).json({
        error: {
          message: err.message || 'Internal server error',
          type: 'server_error',
          param: null,
          code: 'internal_error'
        }
      });
    }
  }
});
