export interface DoubaoCompletionOption {
  is_regen?: boolean;
  with_suggest?: boolean;
  need_create_conversation?: boolean;
  launch_stage?: number;
  is_replace?: boolean;
  is_delete?: boolean;
  is_ai_playground?: boolean;
  memory_type?: number;
  message_from?: number;
  use_deep_think?: boolean;
  use_auto_cot?: boolean;
  resend_for_regen?: boolean;
  enable_commerce_credit?: boolean;
}

export interface DoubaoMessageItem {
  content: string; // JSON.stringify({ text: "..." })
  content_type: number; // 2001 (SamanthaText)
  attachments?: any[];
  references?: any[];
}

export interface DoubaoChatCompletionPayload {
  messages: DoubaoMessageItem[];
  completion_option: DoubaoCompletionOption;
  evaluate_option?: {
    web_ab_params?: string;
  };
  local_conversation_id: string;
  local_message_id: string;
  conversation_id?: string;
  bot_id?: string;
}

export enum DoubaoEventType {
  HEARTBEAT = 1,
  CMPL = 2001,
  ACK = 2002,
  FIN = 2003,
  CMD = 2004,
  ERR = 2005,
  VERBOSE = 2010
}

export enum DoubaoContentType {
  SamanthaText = 2001,
  SamanthaSuggest = 2002,
  SamanthaLoading = 2003,
  SamanthaSearchText = 2008,
  SamanthaImageOutput = 2010,
  SamanthaVideoGenerationOutput = 2021,
  SamanthaTextV2 = 10000,
  BlockTypeThink = 10040,
  SearchQueryResultBlock = 10025
}

export interface DoubaoParsedEvent {
  event_type?: number;
  conversation_id?: string;
  message_id?: string;
  content?: string;
  reasoning_content?: string;
  is_finish?: boolean;
  error?: string;
  raw?: any;
}
