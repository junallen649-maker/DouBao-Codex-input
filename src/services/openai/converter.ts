import { v4 as uuidv4 } from 'uuid';
import {
  OpenAIMessage,
  ChatCompletionChunk,
  ChatCompletionResponse
} from '../../types/openai.js';

export class OpenAIConverter {
  /**
   * Format OpenAI messages array into prompt for Doubao
   */
  static messagesToPrompt(messages: OpenAIMessage[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    // If only one user message, return its content directly
    if (messages.length === 1 && messages[0].role === 'user') {
      const content = messages[0].content;
      return typeof content === 'string' ? content : JSON.stringify(content);
    }

    // Multiple messages: format system prompt and dialog history
    const formattedParts: string[] = [];
    let systemPrompt = '';

    for (const msg of messages) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map(c => c.text || '').join('\n')
          : String(msg.content);

      if (msg.role === 'system') {
        systemPrompt = text.trim();
      } else if (msg.role === 'user') {
        formattedParts.push(`User: ${text.trim()}`);
      } else if (msg.role === 'assistant') {
        formattedParts.push(`Assistant: ${text.trim()}`);
      }
    }

    // If there's a system prompt, prepend it
    let finalPrompt = '';
    if (systemPrompt) {
      finalPrompt += `[System Instruction]\n${systemPrompt}\n\n`;
    }

    // If the last message is from User, we format the history and make the last query clear
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user' && formattedParts.length > 1) {
      finalPrompt += `[Conversation History]\n${formattedParts.slice(0, -1).join('\n')}\n\n`;
      const lastText = typeof lastMsg.content === 'string'
        ? lastMsg.content
        : Array.isArray(lastMsg.content)
          ? lastMsg.content.map(c => c.text || '').join('\n')
          : String(lastMsg.content);
      finalPrompt += `Current Question: ${lastText.trim()}`;
    } else {
      finalPrompt += formattedParts.join('\n');
    }

    return finalPrompt.trim();
  }

  /**
   * Create an initial stream chunk with role: assistant
   */
  static createInitialChunk(id: string, model: string): string {
    const chunk: ChatCompletionChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null
        }
      ]
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  /**
   * Format content or reasoning delta as SSE chunk
   */
  static createDeltaChunk(
    id: string,
    model: string,
    delta: { content?: string; reasoning_content?: string },
    conversationId?: string
  ): string {
    const chunk: ChatCompletionChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: null
        }
      ],
      conversation_id: conversationId
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  /**
   * Create completion final chunk
   */
  static createFinalChunk(id: string, model: string, conversationId?: string): string {
    const chunk: ChatCompletionChunk = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }
      ],
      conversation_id: conversationId
    };
    return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
  }

  /**
   * Create non-stream response object
   */
  static createResponse(
    id: string,
    model: string,
    content: string,
    reasoningContent?: string,
    conversationId?: string
  ): ChatCompletionResponse {
    return {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      conversation_id: conversationId
    };
  }
}
