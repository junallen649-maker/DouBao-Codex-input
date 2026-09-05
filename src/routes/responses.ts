import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DoubaoBrowserDriver } from '../services/doubao/browser-driver.js';
import { config, SUPPORTED_MODELS } from '../config.js';
import { ComputerControlEngine } from '../services/agent/computer-control.js';

export const responsesRouter = Router();

function extractInputText(input: any): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    // 1. First look for user messages
    const userMessages = input.filter(item => item && (item.role === 'user' || (item.type === 'message' && item.role === 'user')));
    if (userMessages.length > 0) {
      const lastUser = userMessages[userMessages.length - 1];
      if (typeof lastUser.content === 'string') return lastUser.content;
      if (Array.isArray(lastUser.content)) {
        return lastUser.content.map((p: any) => (typeof p === 'string' ? p : p.text || p.input_text || '')).filter(Boolean).join('\n');
      }
      if (lastUser.text) return lastUser.text;
    }

    // 2. Look for non-developer messages
    for (let i = input.length - 1; i >= 0; i--) {
      const item = input[i];
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        if (item.role !== 'developer' && item.role !== 'system') {
          if (typeof item.content === 'string') return item.content;
          if (Array.isArray(item.content)) {
            return item.content.map((p: any) => (typeof p === 'string' ? p : p.text || p.input_text || '')).filter(Boolean).join('\n');
          }
          if (item.text) return item.text;
        }
      }
    }

    // 3. Fallback: take last item's text
    const lastItem = input[input.length - 1];
    if (typeof lastItem === 'string') return lastItem;
    if (lastItem && typeof lastItem.content === 'string') return lastItem.content;
  }
  return String(input);
}

function sseEvent(event: string, data: any): string {
  const payload = { type: event, ...data };
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

responsesRouter.all('/responses', (req: Request, res: Response, next) => {
  if (req.method === 'HEAD' || req.method === 'GET' || req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

responsesRouter.post('/responses', async (req: Request, res: Response) => {
  const body = req.body || {};
  try {
    const fs = await import('fs');
    fs.writeFileSync('d:/反向代理(doubao)/last_request_full.json', JSON.stringify(body, null, 2));
  } catch (e) {
    console.error('Failed to dump request body:', e);
  }
  const modelId = body.model || config.defaultModel;
  const isStream = body.stream !== false; // Default to streaming for responses API
  const rawPrompt = extractInputText(body.input) || extractInputText(body.messages) || '你好';
  const plan = ComputerControlEngine.analyzeIntent(rawPrompt);
  const prompt = plan.isOperational ? plan.enhancedPrompt : rawPrompt;
  console.log('[Responses API] Processed prompt with operational plan:', {
    isOperational: plan.isOperational,
    type: plan.type,
    targetPath: plan.targetPath,
    promptPreview: rawPrompt.substring(0, 60)
  });

  const conversationId = body.conversation_id;

  const responseId = `resp_${uuidv4()}`;
  const itemId = `msg_${uuidv4()}`;
  const now = Math.floor(Date.now() / 1000);

  const driver = DoubaoBrowserDriver.getInstance();

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let fullContent = '';
    let isFinished = false;

    res.on('close', () => {
      if (!res.writableEnded) {
        console.log('[Responses API] Client disconnected prematurely');
        isFinished = true;
      }
    });

    // 1. Initial lifecycle events
    res.write(sseEvent('response.created', {
      response: {
        id: responseId,
        object: 'response',
        created_at: now,
        status: 'in_progress',
        model: modelId,
        output: []
      }
    }));

    res.write(sseEvent('response.output_item.added', {
      response_id: responseId,
      output_index: 0,
      item: {
        id: itemId,
        type: 'message',
        status: 'in_progress',
        role: 'assistant',
        content: []
      }
    }));

    res.write(sseEvent('response.content_part.added', {
      response_id: responseId,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: ''
      }
    }));

    const safeWrite = (data: string) => {
      if (res.writableEnded || res.destroyed) return false;
      try {
        return res.write(data);
      } catch {
        return false;
      }
    };

    const finishStream = (textToSend: string) => {
      if (isFinished) return;
      console.log('[Responses API] Sending completion events for text of length:', textToSend.length);

      // 1. output_text.done
      safeWrite(sseEvent('response.output_text.done', {
        response_id: responseId,
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        text: textToSend
      }));

      // 2. content_part.done
      safeWrite(sseEvent('response.content_part.done', {
        response_id: responseId,
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        part: {
          type: 'output_text',
          text: textToSend
        }
      }));

      // 3. output_item.done
      safeWrite(sseEvent('response.output_item.done', {
        response_id: responseId,
        output_index: 0,
        item: {
          id: itemId,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: textToSend
          }]
        }
      }));

      // 4. response.completed
      safeWrite(sseEvent('response.completed', {
        response: {
          id: responseId,
          object: 'response',
          created_at: now,
          status: 'completed',
          model: modelId,
          output: [{
            id: itemId,
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{
              type: 'output_text',
              text: textToSend
            }]
          }],
          usage: {
            total_tokens: textToSend.length + rawPrompt.length,
            input_tokens: rawPrompt.length,
            output_tokens: textToSend.length
          }
        }
      }));

      isFinished = true;
      res.end();
    };

    try {
      console.log('[Responses API] Starting chatCompletion for model:', modelId, 'prompt length:', prompt.length);
      await driver.chatCompletion({
        model: modelId,
        prompt,
        conversationId,
        onChunk: (deltaText) => {
          if (isFinished) return;
          fullContent += deltaText;
          safeWrite(sseEvent('response.output_text.delta', {
            response_id: responseId,
            item_id: itemId,
            output_index: 0,
            content_index: 0,
            delta: deltaText
          }));
        },
        onReasoning: (reasoningDelta) => {
          if (isFinished) return;
        },
        onFinish: async () => {
          console.log('[Responses API] onFinish called, fullContent length:', fullContent.length);
          let finalText = fullContent || '你好！我是豆包，有什么我可以帮你的吗？';

          if (plan.isOperational) {
            try {
              if (plan.type === 'word_document' && plan.targetPath) {
                console.log('[Responses API] Creating Word document at:', plan.targetPath);
                const docResult = await ComputerControlEngine.createWordDocument(plan.targetPath, finalText);
                if (docResult.success) {
                  const notify = `\n\n---\n✅ **【自动化系统执行报告】**\n文件已成功在您的电脑桌面创建完毕！\n- **文件路径**：\`${docResult.filePath}\`\n- **文件类型**：Microsoft Word 文档 (.docx)\n- **排版状态**：已应用标题居中与正文首行缩进排版。`;
                  safeWrite(sseEvent('response.output_text.delta', {
                    response_id: responseId,
                    item_id: itemId,
                    output_index: 0,
                    content_index: 0,
                    delta: notify
                  }));
                  finalText += notify;
                } else {
                  const errNotify = `\n\n---\n⚠️ **【自动化系统执行提示】**\n本地 Word 文档写入失败: ${docResult.error}`;
                  safeWrite(sseEvent('response.output_text.delta', {
                    response_id: responseId,
                    item_id: itemId,
                    output_index: 0,
                    content_index: 0,
                    delta: errNotify
                  }));
                  finalText += errNotify;
                }
              } else if (plan.type === 'file_creation' && plan.targetPath) {
                console.log('[Responses API] Creating generic file at:', plan.targetPath);
                const fileResult = await ComputerControlEngine.createGenericFile(plan.targetPath, finalText);
                if (fileResult.success) {
                  const notify = `\n\n---\n✅ **【自动化系统执行报告】**\n已成功在本地创建文件：\`${fileResult.filePath}\``;
                  safeWrite(sseEvent('response.output_text.delta', {
                    response_id: responseId,
                    item_id: itemId,
                    output_index: 0,
                    content_index: 0,
                    delta: notify
                  }));
                  finalText += notify;
                } else {
                  const errNotify = `\n\n---\n⚠️ **【自动化系统执行提示】**\n本地文件写入失败: ${fileResult.error}`;
                  safeWrite(sseEvent('response.output_text.delta', {
                    response_id: responseId,
                    item_id: itemId,
                    output_index: 0,
                    content_index: 0,
                    delta: errNotify
                  }));
                  finalText += errNotify;
                }
              } else if (plan.type === 'command_execution') {
                const match = finalText.match(/```(?:powershell|cmd|sh|bash)?\s*([\s\S]*?)```/);
                if (match) {
                  const cmd = match[1].trim();
                  console.log('[Responses API] Executing PowerShell command:', cmd);
                  const execRes = await ComputerControlEngine.executePowerShell(cmd);
                  const outText = execRes.stdout || execRes.stderr || '命令执行完成（无终端输出）';
                  const notify = `\n\n---\n⚡ **【本地终端命令执行结果】**\n\`\`\`powershell\n${outText}\n\`\`\``;
                  safeWrite(sseEvent('response.output_text.delta', {
                    response_id: responseId,
                    item_id: itemId,
                    output_index: 0,
                    content_index: 0,
                    delta: notify
                  }));
                  finalText += notify;
                }
              }
            } catch (actionErr: any) {
              console.error('[Responses API] Error executing operational plan:', actionErr);
            }
          }

          finishStream(finalText);
        },
        onError: (err) => {
          console.warn('[Responses API] Upstream error handled gracefully:', err.message);
          const fallbackMsg = fullContent || `[豆包代理提示]: ${err.message}`;
          finishStream(fallbackMsg);
        }
      });
    } catch (err: any) {
      console.error('[Responses API] Outer error caught:', err.message);
      if (!isFinished) {
        finishStream(fullContent || `[豆包代理错误]: ${err.message}`);
      }
    }
  } else {
    // Non-streaming JSON response
    let fullContent = '';
    try {
      await driver.chatCompletion({
        model: modelId,
        prompt,
        conversationId,
        onChunk: (deltaText) => {
          fullContent += deltaText;
        },
        onReasoning: () => {},
        onFinish: async () => {
          let finalText = fullContent || '你好！我是豆包。';
          if (plan.isOperational) {
            try {
              if (plan.type === 'word_document' && plan.targetPath) {
                const docResult = await ComputerControlEngine.createWordDocument(plan.targetPath, finalText);
                if (docResult.success) {
                  finalText += `\n\n---\n✅ **【自动化系统执行报告】**\n文件已成功在您的电脑桌面创建完毕！\n- **文件路径**：\`${docResult.filePath}\`\n- **文件类型**：Microsoft Word 文档 (.docx)\n- **排版状态**：已应用标题居中与正文首行缩进排版。`;
                }
              } else if (plan.type === 'file_creation' && plan.targetPath) {
                const fileResult = await ComputerControlEngine.createGenericFile(plan.targetPath, finalText);
                if (fileResult.success) {
                  finalText += `\n\n---\n✅ **【自动化系统执行报告】**\n已成功在本地创建文件：\`${fileResult.filePath}\``;
                }
              } else if (plan.type === 'command_execution') {
                const match = finalText.match(/```(?:powershell|cmd|sh|bash)?\s*([\s\S]*?)```/);
                if (match) {
                  const cmd = match[1].trim();
                  const execRes = await ComputerControlEngine.executePowerShell(cmd);
                  const outText = execRes.stdout || execRes.stderr || '命令执行完成';
                  finalText += `\n\n---\n⚡ **【本地终端命令执行结果】**\n\`\`\`powershell\n${outText}\n\`\`\``;
                }
              }
            } catch (e) {
              console.error('[Responses API Non-Stream] Error:', e);
            }
          }

          res.json({
            id: responseId,
            object: 'response',
            created_at: now,
            status: 'completed',
            model: modelId,
            output: [{
              id: itemId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{
                type: 'text',
                text: finalText
              }]
            }],
            usage: {
              total_tokens: finalText.length + rawPrompt.length,
              input_tokens: rawPrompt.length,
              output_tokens: finalText.length
            }
          });
        },
        onError: (err) => {
          res.json({
            id: responseId,
            object: 'response',
            created_at: now,
            status: 'completed',
            model: modelId,
            output: [{
              id: itemId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{
                type: 'text',
                text: `[豆包代理提示]: ${err.message}`
              }]
            }]
          });
        }
      });
    } catch (err: any) {
      res.status(500).json({
        error: {
          message: err.message,
          type: 'server_error'
        }
      });
    }
  }
});
