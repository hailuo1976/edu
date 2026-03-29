import { promptManager } from './promptManager';
import { toolManager } from './toolManager';
import { agentFactory } from './agentFactory';
import { toolAdapter } from './toolAdapter';
import { DEFAULT_PROMPTS } from './defaults/prompts';
import { DEFAULT_TOOLS } from './defaults/tools';
import { DEFAULT_AGENTS } from './defaults/agents';

/**
 * 初始化AI交互系统
 * 加载默认的提示词、工具和代理配置
 */
export function initAISystem(): void {
  // 加载默认提示词
  promptManager.loadPrompts(DEFAULT_PROMPTS);
  console.log(`Loaded ${DEFAULT_PROMPTS.length} default prompts`);

  // 加载默认工具
  toolManager.loadTools(DEFAULT_TOOLS);
  console.log(`Loaded ${DEFAULT_TOOLS.length} default tools`);

  // 加载默认代理
  agentFactory.loadAgents(DEFAULT_AGENTS);
  console.log(`Loaded ${DEFAULT_AGENTS.length} default agents`);

  // 初始化工具适配器
  toolAdapter.init();
  
  // 设置默认提示词
  promptManager.setDefaultPrompt('course-generation');
  console.log('AI system initialized successfully');
}

/**
 * 重新加载AI系统配置
 */
export function reloadAISystem(): void {
  // 清除现有配置
  // 注意：这里需要实现清除方法，或者重启应用
  console.log('Reloading AI system...');
  initAISystem();
}
