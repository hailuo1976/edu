import { initAISystem, promptManager, toolManager, agentFactory } from '../src/core/ai';
import { PromptConfig, ToolConfig, AgentConfig } from '../src/core/ai/types';

// 测试提示词管理系统
describe('PromptManager', () => {
  beforeAll(() => {
    initAISystem();
  });

  test('should register and retrieve prompts', () => {
    // 创建测试提示词
    const testPrompt: PromptConfig = {
      id: 'test-prompt',
      name: '测试提示词',
      version: '1.0.0',
      systemPrompt: '测试系统提示词',
      userPromptTemplate: '测试用户提示词模板 {{test_param}}',
      description: '用于测试的提示词',
      tags: ['测试'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'test'
    };

    // 注册提示词
    promptManager.registerPrompt(testPrompt);

    // 获取提示词
    const retrievedPrompt = promptManager.getPrompt('test-prompt');
    expect(retrievedPrompt).not.toBeNull();
    expect(retrievedPrompt?.id).toBe('test-prompt');
    expect(retrievedPrompt?.name).toBe('测试提示词');
  });

  test('should generate prompt with parameters', () => {
    const params = {
      test_param: '测试参数值'
    };

    const generatedPrompt = promptManager.generatePrompt('test-prompt', params);
    expect(generatedPrompt).toContain('测试参数值');
  });

  test('should handle versioning', () => {
    // 创建新版本提示词
    const updatedPrompt: PromptConfig = {
      id: 'test-prompt',
      name: '测试提示词',
      version: '1.1.0',
      systemPrompt: '更新后的测试系统提示词',
      userPromptTemplate: '更新后的测试用户提示词模板 {{test_param}}',
      description: '用于测试的提示词',
      tags: ['测试'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'test'
    };

    // 注册新版本
    promptManager.registerPrompt(updatedPrompt);

    // 获取最新版本
    const latestPrompt = promptManager.getPrompt('test-prompt');
    expect(latestPrompt?.version).toBe('1.1.0');
    expect(latestPrompt?.systemPrompt).toBe('更新后的测试系统提示词');

    // 获取特定版本
    const v1Prompt = promptManager.getPrompt('test-prompt', '1.0.0');
    expect(v1Prompt?.version).toBe('1.0.0');
    expect(v1Prompt?.systemPrompt).toBe('测试系统提示词');
  });
});

// 测试工具管理系统
describe('ToolManager', () => {
  beforeAll(() => {
    initAISystem();
  });

  test('should register and retrieve tools', () => {
    // 创建测试工具
    const testTool: ToolConfig = {
      id: 'test-tool',
      name: '测试工具',
      version: '1.0.0',
      tool: {
        name: 'test_tool',
        description: '测试工具描述',
        inputSchema: {
          type: 'object',
          properties: {
            test_param: {
              type: 'string',
              description: '测试参数'
            }
          },
          required: ['test_param']
        }
      },
      description: '用于测试的工具',
      tags: ['测试'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'test'
    };

    // 注册工具
    toolManager.registerTool(testTool);

    // 获取工具
    const retrievedTool = toolManager.getTool('test-tool');
    expect(retrievedTool).not.toBeNull();
    expect(retrievedTool?.id).toBe('test-tool');
    expect(retrievedTool?.name).toBe('测试工具');
  });

  test('should register and execute tool handlers', async () => {
    // 注册测试工具处理器
    toolManager.registerToolHandler('test_tool', async (params: any) => {
      return { result: `处理了参数: ${params.test_param}` };
    });

    // 执行工具
    const result = await toolManager.executeTool('test_tool', { test_param: '测试值' });
    expect(result).toEqual({ result: '处理了参数: 测试值' });
  });

  test('should handle tool definitions', () => {
    const toolDefinitions = toolManager.getToolDefinitions(['test-tool']);
    expect(toolDefinitions.length).toBe(1);
    expect(toolDefinitions[0].name).toBe('test_tool');
  });
});

// 测试代理工厂
describe('AgentFactory', () => {
  beforeAll(() => {
    initAISystem();
  });

  test('should register and retrieve agents', () => {
    // 创建测试代理
    const testAgent: AgentConfig = {
      id: 'test-agent',
      name: '测试代理',
      promptId: 'course-generation',
      toolIds: ['generate-svg', 'validate-html'],
      description: '用于测试的代理',
      tags: ['测试'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'test'
    };

    // 注册代理
    agentFactory.registerAgent(testAgent);

    // 获取代理
    const retrievedAgent = agentFactory.getAgent('test-agent');
    expect(retrievedAgent).not.toBeNull();
    expect(retrievedAgent?.id).toBe('test-agent');
    expect(retrievedAgent?.name).toBe('测试代理');
  });

  test('should create agent instances', () => {
    const agent = agentFactory.createAgent('course-generator');
    expect(agent).not.toBeNull();
  });
});

// 测试AI系统初始化
describe('AISystem', () => {
  test('should initialize successfully', () => {
    // 测试初始化是否成功
    expect(() => initAISystem()).not.toThrow();

    // 检查默认提示词是否加载
    const defaultPrompt = promptManager.getDefaultPrompt();
    expect(defaultPrompt).not.toBeNull();

    // 检查默认代理是否加载
    const defaultAgent = agentFactory.getAgent('course-generator');
    expect(defaultAgent).not.toBeNull();
  });

  test('should have default tools registered', () => {
    const tools = toolManager.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});

// 测试架构可扩展性
describe('Architecture Extensibility', () => {
  test('should support adding new prompts without code changes', () => {
    // 模拟从外部配置加载新提示词
    const newPrompt: PromptConfig = {
      id: 'new-subject-prompt',
      name: '新学科提示词',
      version: '1.0.0',
      systemPrompt: '你是资深的物理教师，擅长讲解物理概念',
      userPromptTemplate: '请生成关于{{topic}}的物理课件',
      description: '用于生成物理课件的提示词',
      tags: ['物理', '课件'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'admin'
    };

    // 注册新提示词
    promptManager.registerPrompt(newPrompt);

    // 验证新提示词可用
    const retrievedPrompt = promptManager.getPrompt('new-subject-prompt');
    expect(retrievedPrompt).not.toBeNull();
    expect(retrievedPrompt?.systemPrompt).toContain('物理教师');
  });

  test('should support adding new tools without code changes', () => {
    // 模拟从外部配置加载新工具
    const newTool: ToolConfig = {
      id: 'new-tool',
      name: '新工具',
      version: '1.0.0',
      tool: {
        name: 'new_tool',
        description: '新工具描述',
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: '工具输入'
            }
          },
          required: ['input']
        }
      },
      description: '新工具描述',
      tags: ['新功能'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'admin'
    };

    // 注册新工具
    toolManager.registerTool(newTool);

    // 注册工具处理器
    toolManager.registerToolHandler('new_tool', async (params: any) => {
      return { result: `新工具处理了: ${params.input}` };
    });

    // 验证新工具可用
    const retrievedTool = toolManager.getTool('new-tool');
    expect(retrievedTool).not.toBeNull();
    expect(retrievedTool?.tool.name).toBe('new_tool');
  });

  test('should support creating new agents without code changes', () => {
    // 模拟从外部配置创建新代理
    const newAgent: AgentConfig = {
      id: 'physics-generator',
      name: '物理课件生成代理',
      promptId: 'new-subject-prompt',
      toolIds: ['generate-svg', 'validate-html'],
      description: '用于生成物理课件的代理',
      tags: ['物理', '课件'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'admin'
    };

    // 注册新代理
    agentFactory.registerAgent(newAgent);

    // 验证新代理可用
    const retrievedAgent = agentFactory.getAgent('physics-generator');
    expect(retrievedAgent).not.toBeNull();
    expect(retrievedAgent?.name).toBe('物理课件生成代理');
  });
});
