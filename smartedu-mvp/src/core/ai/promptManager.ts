import { PromptConfig, PromptParams } from './types';

/**
 * 提示词管理类
 * 负责提示词的存储、版本控制和管理
 */
export class PromptManager {
  private prompts: Map<string, PromptConfig[]> = new Map();
  private defaultPromptId: string | null = null;

  /**
   * 注册提示词
   * @param prompt 提示词配置
   */
  registerPrompt(prompt: PromptConfig): void {
    if (!this.prompts.has(prompt.id)) {
      this.prompts.set(prompt.id, []);
    }
    
    const versions = this.prompts.get(prompt.id)!;
    const existingIndex = versions.findIndex(v => v.version === prompt.version);
    
    if (existingIndex >= 0) {
      versions[existingIndex] = prompt;
    } else {
      versions.push(prompt);
      // 按版本号排序
      versions.sort((a, b) => this.compareVersions(a.version, b.version));
    }
  }

  /**
   * 获取提示词
   * @param id 提示词ID
   * @param version 版本号，默认为最新版本
   * @returns 提示词配置
   */
  getPrompt(id: string, version?: string): PromptConfig | null {
    const versions = this.prompts.get(id);
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
   * 获取所有提示词
   * @returns 提示词配置列表
   */
  getAllPrompts(): PromptConfig[] {
    const allPrompts: PromptConfig[] = [];
    this.prompts.forEach(versions => {
      allPrompts.push(...versions);
    });
    return allPrompts;
  }

  /**
   * 设置默认提示词
   * @param id 提示词ID
   */
  setDefaultPrompt(id: string): void {
    if (this.prompts.has(id)) {
      this.defaultPromptId = id;
    }
  }

  /**
   * 获取默认提示词
   * @returns 默认提示词配置
   */
  getDefaultPrompt(): PromptConfig | null {
    if (!this.defaultPromptId) {
      return null;
    }
    return this.getPrompt(this.defaultPromptId);
  }

  /**
   * 生成提示词
   * @param id 提示词ID
   * @param params 提示词参数
   * @param version 版本号
   * @returns 生成的提示词
   */
  generatePrompt(id: string, params: PromptParams, version?: string): string {
    const promptConfig = this.getPrompt(id, version);
    if (!promptConfig) {
      throw new Error(`Prompt with id ${id} not found`);
    }

    let userPrompt = promptConfig.userPromptTemplate;
    
    // 替换模板变量
    Object.entries(params).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      userPrompt = userPrompt.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return `${promptConfig.systemPrompt}\n\n${userPrompt}`;
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
   * 从文件加载提示词
   * @param prompts 提示词配置列表
   */
  loadPrompts(prompts: PromptConfig[]): void {
    prompts.forEach(prompt => this.registerPrompt(prompt));
  }

  /**
   * 导出提示词
   * @returns 提示词配置列表
   */
  exportPrompts(): PromptConfig[] {
    return this.getAllPrompts();
  }
}

// 全局提示词管理器实例
export const promptManager = new PromptManager();
