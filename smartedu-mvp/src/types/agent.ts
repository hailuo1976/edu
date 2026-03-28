export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolPropertySchema>;
    required: string[];
  };
}

export interface ToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  default?: any;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface ToolCallMessage {
  type: 'tool_call';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultMessage {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallMessage[];
  toolResults?: ToolResultMessage[];
}

export interface AgentConfig {
  maxIterations: number;
  timeoutMs: number;
  exitKeywords?: string[];
  defaultWorkDir?: string;
}

export const DEFAULT_EXIT_KEYWORDS = [
  '任务完成',
  '生成完毕',
  '完成',
  'FINISH',
  'DONE',
  'EXIT',
  '已完成所有任务',
  '所有文件已生成',
];

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 20,
  timeoutMs: 300000,
  exitKeywords: DEFAULT_EXIT_KEYWORDS,
  defaultWorkDir: './courses',
};

export interface AgentProgress {
  iteration: number;
  stage: 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error' | 'retry';
  message: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  ai_input?: string;
  ai_output?: string;
  tool_call?: {
    name: string;
    arguments?: any;
    result?: any;
    error?: string;
    success: boolean;
  };
  draft_content?: {
    type?: 'svg' | 'html' | 'search';
    title?: string;
    content: string;
  };
}

export type AgentProgressCallback = (progress: AgentProgress) => void;
