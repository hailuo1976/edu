import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition } from './types';
import { logger } from '../utils/logger';

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.debug(`工具注册: ${tool.name}`);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 导出为 OpenAI function calling 格式 */
  toOpenAIFormat(): any[] {
    return this.getAll().map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /** 解析工具调用参数（兼容 string/object） */
  parseArgs(args: any): Record<string, any> {
    if (typeof args === 'string') {
      try { return JSON.parse(args); } catch { return {}; }
    }
    return args || {};
  }
}

/** 全局工具注册表 */
export const toolRegistry = new ToolRegistry();
