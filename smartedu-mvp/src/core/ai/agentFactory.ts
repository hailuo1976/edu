import { AgentConfig, AgentOptions, AgentResult, PromptParams } from './types';
import { promptManager } from './promptManager';
import { toolManager } from './toolManager';
import { OpenCodeClient } from '../../services/opencode';

/**
 * 代理工厂类
 * 负责创建和管理AI代理
 */
export class AgentFactory {
  private agents: Map<string, AgentConfig> = new Map();
  private client: OpenCodeClient;

  constructor() {
    this.client = new OpenCodeClient();
  }

  /**
   * 注册代理
   * @param agent 代理配置
   */
  registerAgent(agent: AgentConfig): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * 获取代理
   * @param id 代理ID
   * @returns 代理配置
   */
  getAgent(id: string): AgentConfig | null {
    return this.agents.get(id) || null;
  }

  /**
   * 获取所有代理
   * @returns 代理配置列表
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * 创建代理实例
   * @param id 代理ID
   * @returns 代理实例
   */
  createAgent(id: string): AIAgent | null {
    const agentConfig = this.getAgent(id);
    if (!agentConfig) {
      return null;
    }

    return new AIAgent(agentConfig, this.client);
  }

  /**
   * 从文件加载代理
   * @param agents 代理配置列表
   */
  loadAgents(agents: AgentConfig[]): void {
    agents.forEach(agent => this.registerAgent(agent));
  }

  /**
   * 导出代理
   * @returns 代理配置列表
   */
  exportAgents(): AgentConfig[] {
    return this.getAllAgents();
  }
}

/**
 * AI代理类
 * 负责执行AI交互逻辑
 */
export class AIAgent {
  private config: AgentConfig;
  private client: OpenCodeClient;

  constructor(config: AgentConfig, client: OpenCodeClient) {
    this.config = config;
    this.client = client;
  }

  /**
   * 执行代理
   * @param params 提示词参数
   * @param options 执行选项
   * @returns 执行结果
   */
  async execute(params: PromptParams, options: AgentOptions = {}): Promise<AgentResult> {
    try {
      // 生成提示词
      const prompt = promptManager.generatePrompt(this.config.promptId, params);
      
      // 获取工具定义
      const tools = toolManager.getToolDefinitions(this.config.toolIds);
      
      // 调用AI模型
      const response = await this.client.generateWithPrompt(prompt, tools);

      return {
        success: true,
        output: response,
        metadata: {
          agentId: this.config.id,
          promptId: this.config.promptId,
          toolIds: this.config.toolIds,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message,
        metadata: {
          agentId: this.config.id,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * 获取代理配置
   * @returns 代理配置
   */
  getConfig(): AgentConfig {
    return this.config;
  }
}

// 全局代理工厂实例
export const agentFactory = new AgentFactory();
