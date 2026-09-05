import { DoubaoParsedEvent, DoubaoEventType, DoubaoContentType } from '../../types/doubao.js';

export class DoubaoSSEParser {
  private buffer = '';

  /**
   * Feed a raw text chunk into the parser and return any completed parsed events
   */
  public feed(chunk: string): DoubaoParsedEvent[] {
    this.buffer += chunk;
    const events: DoubaoParsedEvent[] = [];

    // Split on double newlines
    const parts = this.buffer.split(/\r?\n\r?\n/);
    // Keep the last incomplete part in the buffer
    this.buffer = parts.pop() || '';

    for (const part of parts) {
      const parsed = this.parseEventBlock(part.trim());
      if (parsed) {
        events.push(parsed);
      }
    }

    return events;
  }

  /**
   * Parse a single SSE block
   */
  private parseEventBlock(block: string): DoubaoParsedEvent | null {
    if (!block) return null;

    let eventName = '';
    let dataStr = '';
    const lines = block.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event:')) {
        eventName = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('data:')) {
        const lineData = trimmed.substring(5).trim();
        if (lineData === '[DONE]') {
          return { is_finish: true };
        }
        dataStr += lineData;
      }
    }

    if (eventName === 'STREAM_FINISH') {
      return { is_finish: true };
    }

    if (!dataStr || dataStr === '{}') return null;

    try {
      const json = JSON.parse(dataStr);
      json._event = eventName;
      return this.extractFromPayload(json);
    } catch {
      return null;
    }
  }

  /**
   * Extract fields from Doubao's event payload
   */
  private extractFromPayload(json: any): DoubaoParsedEvent {
    const eventName = json._event || '';
    const eventType: number = json.event_type ?? json.type;
    const event: DoubaoParsedEvent = {
      event_type: eventType,
      raw: json
    };

    // Extract conversation_id
    if (json.ack_client_meta?.conversation_id) {
      event.conversation_id = json.ack_client_meta.conversation_id;
    } else if (json.meta?.conversation_id) {
      event.conversation_id = json.meta.conversation_id;
    } else if (eventType === DoubaoEventType.ACK || json.conversation_id) {
      event.conversation_id = json.conversation_id || json.data?.conversation_id;
    }

    // FIN event - stream finished
    if (eventName === 'STREAM_FINISH' || eventType === DoubaoEventType.FIN) {
      event.is_finish = true;
      return event;
    }

    // ERR event - error occurred
    if (eventName === 'STREAM_ERROR' || eventType === DoubaoEventType.ERR || (json.error_code && json.error_code !== 0)) {
      event.error = json.error_message || json.message || `Doubao error: ${JSON.stringify(json)}`;
      return event;
    }

    // 1. CHUNK_DELTA format (The primary streaming format in /chat/completion)
    if (eventName === 'CHUNK_DELTA' && json.text) {
      event.content = json.text;
      return event;
    }

    // 2. patch_op format in /chat/completion
    if (Array.isArray(json.patch_op)) {
      for (const op of json.patch_op) {
        const pv = op.patch_value || {};
        const contentBlocks = pv.content_block || [];
        for (const block of contentBlocks) {
          const isThinking = block.block_type === 10040;
          const tb = block.content?.text_block || {};
          if (tb.text) {
            if (isThinking) {
              event.reasoning_content = tb.text;
            } else {
              event.content = tb.text;
            }
          }
        }
      }
    }

    // 3. STREAM_MSG_NOTIFY format
    if (eventName === 'STREAM_MSG_NOTIFY' && json.content) {
      const content = json.content;
      if (Array.isArray(content.content_block)) {
        for (const block of content.content_block) {
          const tb = block.content?.text_block || {};
          if (tb.text) {
            event.content = tb.text;
          }
        }
      }
    }

    // 4. Fallback: Samantha format / message format
    const msg = json.message || json.data?.message;
    if (msg) {
      if (msg.conversation_id && !event.conversation_id) {
        event.conversation_id = msg.conversation_id;
      }

      const contentType: number = msg.content_type;
      const rawContent = msg.content;

      let extractedText = '';
      let isThinking = false;

      if (typeof rawContent === 'string') {
        try {
          const contentObj = JSON.parse(rawContent);
          if (contentObj.text) {
            extractedText = contentObj.text;
          } else if (contentObj.think) {
            extractedText = contentObj.think;
            isThinking = true;
          }
        } catch {
          extractedText = rawContent;
        }
      } else if (rawContent && typeof rawContent === 'object') {
        if (rawContent.text) {
          extractedText = rawContent.text;
        } else if (rawContent.think) {
          extractedText = rawContent.think;
          isThinking = true;
        }
      }

      if (
        contentType === DoubaoContentType.BlockTypeThink ||
        contentType === DoubaoContentType.SamanthaSearchText ||
        isThinking
      ) {
        event.reasoning_content = extractedText;
      } else if (extractedText) {
        event.content = extractedText;
      }
    }

    return event;
  }
}
