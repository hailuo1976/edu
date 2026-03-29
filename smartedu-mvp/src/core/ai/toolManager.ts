import { ToolConfig } from './types';
import { ToolDefinition } from '../../types/agent';

/**
 * 工具管理类
 * 负责工具的注册、管理和执行
 */
export class ToolManager {
  private tools: Map<string, ToolConfig[]> = new Map();
  private toolHandlers: Map<string, (params: any) => Promise<any>> = new Map();

  /**
   * 注册工具
   * @param tool 工具配置
   */
  registerTool(tool: ToolConfig): void {
    if (!this.tools.has(tool.id)) {
      this.tools.set(tool.id, []);
    }
    
    const versions = this.tools.get(tool.id)!;
    const existingIndex = versions.findIndex(v => v.version === tool.version);
    
    if (existingIndex >= 0) {
      versions[existingIndex] = tool;
    } else {
      versions.push(tool);
      // 按版本号排序
      versions.sort((a, b) => this.compareVersions(a.version, b.version));
    }
  }

  /**
   * 注册工具处理器
   * @param toolName 工具名称
   * @param handler 工具处理函数
   */
  registerToolHandler(toolName: string, handler: (params: any) => Promise<any>): void {
    this.toolHandlers.set(toolName, handler);
  }

  /**
   * 获取工具
   * @param id 工具ID
   * @param version 版本号，默认为最新版本
   * @returns 工具配置
   */
  getTool(id: string, version?: string): ToolConfig | null {
    const versions = this.tools.get(id);
    if (!versions || versions.length === 0) {
      return null;
    }

    if (version) {
      return versions.find(v => v.version === version) || null;
    }

    // 返回最新版本
    return versions[versions.length - 1];
  }

  /**
   * 获取所有工具
   * @returns 工具配置列表
   */
  getAllTools(): ToolConfig[] {
    const allTools: ToolConfig[] = [];
    this.tools.forEach(versions => {
      allTools.push(...versions);
    });
    return allTools;
  }

  /**
   * 获取工具定义列表
   * @param toolIds 工具ID列表
   * @returns 工具定义列表
   */
  getToolDefinitions(toolIds: string[]): any[] {
    return toolIds
      .map(id => this.getTool(id))
      .filter((tool): tool is ToolConfig => tool !== null)
      .map(tool => ({
        name: tool.tool.name,
        description: tool.tool.description,
        input_schema: tool.tool.inputSchema
      }));
  }

  /**
   * 执行工具
   * @param toolName 工具名称
   * @param params 工具参数
   * @returns 工具执行结果
   */
  async executeTool(toolName: string, params: any): Promise<any> {
    const handler = this.toolHandlers.get(toolName);
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} not found`);
    }

    try {
      return await handler(params);
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 版本号比较
   * @param v1 版本号1
   * @param v2 版本号2
   * @returns 比较结果
   */
  private compareVersions(v1: string, v2: string): number {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const num1 = v1Parts[i] || 0;
      const num2 = v2Parts[i] || 0;
      
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    
    return 0;
  }

  /**
   * 从文件加载工具
   * @param tools 工具配置列表
   */
  loadTools(tools: ToolConfig[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  /**
   * 导出工具
   * @returns 工具配置列表
   */
  exportTools(): ToolConfig[] {
    return this.getAllTools();
  }

  /**
   * 检查工具是否存在
   * @param toolName 工具名称
   * @returns 是否存在
   */
  hasTool(toolName: string): boolean {
    return this.toolHandlers.has(toolName);
  }

  /**
   * 获取工具处理器
   * @param toolName 工具名称
   * @returns 工具处理函数
   */
  getToolHandler(toolName: string): ((params: any) => Promise<any>) | null {
    return this.toolHandlers.get(toolName) || null;
  }
}

// 全局工具管理器实例
export const toolManager = new ToolManager();
