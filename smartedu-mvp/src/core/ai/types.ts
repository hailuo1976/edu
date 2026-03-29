import { ToolDefinition } from '../../types/agent';

/**
 * 提示词配置接口
 */
export interface PromptConfig {
  id: string;
  name: string;
  version: string;
  systemPrompt: string;
  userPromptTemplate: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  author?: string;
}

/**
 * 工具配置接口
 */
export interface ToolConfig {
  id: string;
  name: string;
  version: string;
  tool: ToolDefinition;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  author?: string;
}

/**
 * 代理配置接口
 */
export interface AgentConfig {
  id: string;
  name: string;
  promptId: string;
  toolIds: string[];
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  author?: string;
}

/**
 * 提示词参数接口
 */
export interface PromptParams {
  [key: string]: any;
}

/**
 * 代理执行结果接口
 */
export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: {
    [key: string]: any;
  };
}

/**
 * 代理执行选项接口
 */
export interface AgentOptions {
  maxRetries?: number;
  timeoutMs?: number;
  enableValidation?: boolean;
  [key: string]: any;
}
