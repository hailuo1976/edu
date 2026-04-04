// 统一工具类型定义 - 全项目唯一一套

/** JSON Schema 属性 */
export interface ToolParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  default?: any;
  enum?: string[];
  items?: { type: string };
}

/** JSON Schema 格式的参数定义 */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParamSchema>;
  required?: string[];
}

/** 工具定义 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: any, ctx: ToolContext) => Promise<any>;
}

/** 工具调用上下文 */
export interface ToolContext {
  workDir: string;
  [key: string]: any;
}

/** AI 返回的工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

/** 工具执行结果 */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
}

/** 转换为 OpenAI function calling 格式 */
export function toOpenAITools(tools: ToolDefinition[]): any[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
