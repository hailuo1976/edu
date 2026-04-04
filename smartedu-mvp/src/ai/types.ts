// 统一 AI 类型定义

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;       // role=tool 时必需
  toolCalls?: RawToolCall[]; // role=assistant 时可能有
}

export interface RawToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string，需要 parse
}

export interface AIResponse {
  content: string;
  toolCalls: ParsedToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}
