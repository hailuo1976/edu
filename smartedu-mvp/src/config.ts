/** 应用配置 - 从环境变量读取 */

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // AI Provider 配置
  ai: {
    provider: (process.env.AI_PROVIDER || 'dashscope') as 'dashscope' | 'opencode',
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.OPENCODE_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.OPENAI_MODEL || 'qwen-plus',
    // Anthropic 兼容端点（用于 OpenCode）
    anthropicApiKey: process.env.OPENCODE_API_KEY || '',
    anthropicBaseUrl: process.env.OPENCODE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
  },

  // 搜索 API
  search: {
    baiduApiKey: process.env.BAIDU_API_KEY || '',
  },

  // 路径
  paths: {
    courses: process.env.COURSES_DIR || 'courses',
    logs: process.env.LOGS_DIR || 'logs',
  },

  // Agent 配置
  agent: {
    maxIterations: 15,
    timeoutMs: 300000,
    defaultMaxRetries: 3,
  },
} as const;
