import { ToolManager, toolManager, ToolCall } from './toolManager';

describe('ToolManager', () => {
  let testToolManager: ToolManager;

  beforeEach(() => {
    // 创建一个新的工具管理器实例进行测试
    testToolManager = new ToolManager('./test');
  });

  describe('工具注册和获取', () => {
    test('应该能够注册新工具', () => {
      const testTool = {
        name: 'test_tool',
        description: '测试工具',
        parameters: {
          type: 'object',
          properties: {
            test_param: {
              type: 'string',
              description: '测试参数',
              required: true,
            },
          },
          required: ['test_param'],
        },
        execute: async (args: any) => {
          return { result: args.test_param };
        },

      };

      testToolManager.registerTool(testTool);
      const tools = testToolManager.getTools();
      const foundTool = tools.find(t => t.function.name === 'test_tool');
      
      expect(foundTool).toBeDefined();
      expect(foundTool?.function.name).toBe('test_tool');
    });

    test('应该能够获取所有注册的工具', () => {
      const tools = testToolManager.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('工具执行', () => {
    test('应该能够执行 generate_svg 工具', async () => {
      const toolCall: ToolCall = {
        id: 'test_1',
        name: 'generate_svg',
        arguments: {
          shape_type: 'rect',
          dimensions: { width: 100, height: 100 },
          label: '测试矩形',
        },
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(true);
      expect(result.result?.svg).toContain('<svg');
      expect(result.result?.shape_type).toBe('rect');
    });

    test('应该能够执行 generate_html_component 工具', async () => {
      const toolCall: ToolCall = {
        id: 'test_2',
        name: 'generate_html_component',
        arguments: {
          component_type: 'formula',
          content: 'S = a × a',
          style: 'background-color: #f0f9ff;',
        },
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(true);
      expect(result.result?.html).toContain('formula-box');
      expect(result.result?.component_type).toBe('formula');
    });

    test('应该能够执行 validate_html 工具', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>测试</title>
</head>
<body>
  <div id="concept">概念讲解</div>
  <div id="demo">图形演示</div>
  <div id="exercise">练习测试</div>
</body>
</html>`;

      const toolCall: ToolCall = {
        id: 'test_3',
        name: 'validate_html',
        arguments: {
          html_code: html,
        },
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(true);
      expect(result.result?.valid).toBe(true);
      expect(result.result?.errors).toEqual([]);
    });

    test('应该能够执行 search_educational_content 工具', async () => {
      const toolCall: ToolCall = {
        id: 'test_4',
        name: 'search_educational_content',
        arguments: {
          query: '正方形面积',
          grade_level: 3,
          subject: '数学',
        },
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(true);
      expect(result.result?.content).toContain('正方形面积');
      expect(result.result?.query).toBe('正方形面积');
    });

    test('应该能够执行 save_course_html 工具', async () => {
      const html = '<html><body>测试内容</body></html>';

      const toolCall: ToolCall = {
        id: 'test_5',
        name: 'save_course_html',
        arguments: {
          filename: 'test.html',
          html_content: html,
          course_id: 'test_course',
        },
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(true);
      expect(result.result?.file_size).toBe(html.length);
      expect(result.result?.course_id).toBe('test_course');
    });
  });

  describe('错误处理', () => {
    test('执行不存在的工具应该返回错误', async () => {
      const toolCall: ToolCall = {
        id: 'test_6',
        name: 'non_existent_tool',
        arguments: {},
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(false);
      expect(result.error).toContain('工具不存在');
    });

    test('缺少必填参数应该返回错误', async () => {
      const toolCall: ToolCall = {
        id: 'test_7',
        name: 'generate_svg',
        arguments: {
          // 缺少 shape_type 参数
          dimensions: { width: 100, height: 100 },
        },
      };

      const result = await testToolManager.executeTool(toolCall);
      expect(result.success).toBe(false);
      expect(result.error).toContain('缺少必填参数');
    });
  });

  describe('工具统计', () => {
    test('应该能够获取工具执行统计信息', async () => {
      // 执行一个工具
      const toolCall: ToolCall = {
        id: 'test_8',
        name: 'generate_svg',
        arguments: {
          shape_type: 'circle',
          dimensions: { radius: 50 },
        },
      };

      await testToolManager.executeTool(toolCall);
      const stats = testToolManager.getToolStats();
      
      expect(stats.generate_svg).toBeDefined();
      expect(stats.generate_svg.total).toBe(1);
      expect(stats.generate_svg.success).toBe(1);
      expect(stats.generate_svg.failures).toBe(0);
      expect(stats.generate_svg.avgTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('全局工具管理器', () => {
    test('全局工具管理器应该初始化并注册默认工具', () => {
      const tools = toolManager.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // 检查默认工具是否注册
      const expectedTools = ['generate_svg', 'generate_html_component', 'validate_html', 'search_educational_content', 'save_course_html'];
      expectedTools.forEach(toolName => {
        const foundTool = tools.find(t => t.function.name === toolName);
        expect(foundTool).toBeDefined();
      });
    });
  });
});
