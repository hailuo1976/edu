import { toolManager } from './toolManager';
import { ToolManager as LegacyToolManager } from '../../services/toolManager';

/**
 * 工具适配器类
 * 用于将现有的工具实现集成到新的工具管理系统中
 */
export class ToolAdapter {
  private legacyToolManager: LegacyToolManager;

  constructor(workDir: string = './') {
    this.legacyToolManager = new LegacyToolManager(workDir);
  }

  /**
   * 初始化工具适配器
   * 注册现有工具到新的工具管理系统
   */
  init(): void {
    // 注册核心工具处理器
    this.registerCoreToolHandlers();
    console.log('Tool adapter initialized successfully');
  }

  /**
   * 注册核心工具处理器
   */
  private registerCoreToolHandlers(): void {
    // 生成SVG工具
    toolManager.registerToolHandler('generate_svg', async (params: any) => {
      const toolCall = {
        id: `tool_${Date.now()}`,
        name: 'generate_svg',
        arguments: params
      };
      const result = await this.legacyToolManager.executeTool(toolCall);
      return result.success ? result.result : { error: result.error };
    });

    // 生成HTML组件工具
    toolManager.registerToolHandler('generate_html_component', async (params: any) => {
      const toolCall = {
        id: `tool_${Date.now()}`,
        name: 'generate_html_component',
        arguments: params
      };
      const result = await this.legacyToolManager.executeTool(toolCall);
      return result.success ? result.result : { error: result.error };
    });

    // 验证HTML工具
    toolManager.registerToolHandler('validate_html', async (params: any) => {
      const toolCall = {
        id: `tool_${Date.now()}`,
        name: 'validate_html',
        arguments: params
      };
      const result = await this.legacyToolManager.executeTool(toolCall);
      return result.success ? result.result : { error: result.error };
    });

    // 搜索教育内容工具
    toolManager.registerToolHandler('search_educational_content', async (params: any) => {
      const toolCall = {
        id: `tool_${Date.now()}`,
        name: 'search_educational_content',
        arguments: params
      };
      const result = await this.legacyToolManager.executeTool(toolCall);
      return result.success ? result.result : { error: result.error };
    });

    // 保存课程HTML工具
    toolManager.registerToolHandler('save_course_html', async (params: any) => {
      const toolCall = {
        id: `tool_${Date.now()}`,
        name: 'save_course_html',
        arguments: params
      };
      const result = await this.legacyToolManager.executeTool(toolCall);
      return result.success ? result.result : { error: result.error };
    });

    // 文件操作工具
    this.registerFileToolHandlers();
  }

  /**
   * 注册文件操作工具处理器
   */
  private registerFileToolHandlers(): void {
    const fileTools = [
      'create_file',
      'write_file',
      'read_file',
      'list_files',
      'file_exists',
      'create_directory',
      'delete_file',
      'copy_file',
      'save_file',
      'split_file',
      'merge_files'
    ];

    fileTools.forEach(toolName => {
      toolManager.registerToolHandler(toolName, async (params: any) => {
        const toolCall = {
          id: `tool_${Date.now()}`,
          name: toolName,
          arguments: params
        };
        const result = await this.legacyToolManager.executeTool(toolCall);
        return result.success ? result.result : { error: result.error };
      });
    });
  }

  /**
   * 设置工作目录
   * @param workDir 工作目录
   */
  setWorkDir(workDir: string): void {
    this.legacyToolManager.setWorkDir(workDir);
  }

  /**
   * 获取传统工具管理器
   * @returns 传统工具管理器实例
   */
  getLegacyToolManager(): LegacyToolManager {
    return this.legacyToolManager;
  }
}

// 全局工具适配器实例
export const toolAdapter = new ToolAdapter();
