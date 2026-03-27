import * as fs from 'fs';
import * as path from 'path';

// 工具定义接口
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
    }>;
    required?: string[];
  };
  execute: (args: any, workDir: string) => Promise<any>;
}

// 工具调用接口
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

// 工具执行结果接口
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  retries?: number;
}

export class ToolManager {
  private tools: Map<string, ToolDefinition> = new Map();
  private workDir: string;
  private toolStats: Map<string, {
    total: number;
    success: number;
    failures: number;
    avgTime: number;
  }> = new Map();

  constructor(workDir: string = './') {
    this.workDir = path.resolve(workDir);
    this.registerDefaultTools();
  }

  setWorkDir(workDir: string): void {
    this.workDir = path.resolve(workDir);
    console.log(`[ToolManager] 工作目录已设置: ${this.workDir}`);
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.toolStats.set(tool.name, {
      total: 0,
      success: 0,
      failures: 0,
      avgTime: 0,
    });
    console.log(`[ToolManager] 工具已注册: ${tool.name}`);
  }

  getTools(): Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: {
        type: string;
        properties: Record<string, {
          type: string;
          description: string;
          required?: boolean;
        }>;
        required?: string[];
      };
    };
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  parseToolCallArgs(args: any): Record<string, any> {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch {
        return {};
      }
    }
    return args || {};
  }

  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.tools.get(toolCall.name);
    let retries = 0;

    if (!tool) {
      this.updateToolStats(toolCall.name, false, Date.now() - startTime);
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: `工具不存在: ${toolCall.name}`,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      // 验证参数
      const validationError = this.validateToolParameters(tool, toolCall.arguments);
      if (validationError) {
        this.updateToolStats(toolCall.name, false, Date.now() - startTime);
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          success: false,
          error: validationError,
          executionTime: Date.now() - startTime,
        };
      }

      // 执行工具（带重试）
      const result = await this.retry(() => this.executeToolWithTimeout(tool, toolCall.arguments), 3, 1000);
      
      const executionTime = Date.now() - startTime;
      this.updateToolStats(toolCall.name, true, executionTime);
      
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: true,
        result,
        executionTime,
        retries,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.updateToolStats(toolCall.name, false, executionTime);
      
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: error.message || '工具执行失败',
        executionTime,
        retries,
      };
    }
  }

  private validateToolParameters(tool: ToolDefinition, args: Record<string, any>): string | null {
    const requiredParams = tool.parameters.required || [];
    
    for (const param of requiredParams) {
      if (args[param] === undefined || args[param] === null) {
        return `缺少必填参数: ${param}`;
      }
    }
    
    return null;
  }

  private async executeToolWithTimeout(tool: ToolDefinition, args: Record<string, any>, timeoutMs: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`工具执行超时 (${timeoutMs}ms): ${tool.name}`));
      }, timeoutMs);

      tool.execute(args, this.workDir)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async retry<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        console.warn(`[ToolManager] 尝试 ${attempt}/${maxAttempts} 失败: ${error.message}`);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  }

  private updateToolStats(toolName: string, success: boolean, executionTime: number): void {
    const stats = this.toolStats.get(toolName);
    if (stats) {
      stats.total++;
      if (success) {
        stats.success++;
      } else {
        stats.failures++;
      }
      stats.avgTime = (stats.avgTime * (stats.total - 1) + executionTime) / stats.total;
    }
  }

  getToolStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    this.toolStats.forEach((value, key) => {
      stats[key] = value;
    });
    return stats;
  }

  private registerDefaultTools(): void {
    // 生成SVG工具
    this.registerTool({
      name: 'generate_svg',
      description: '生成SVG矢量图形，用于可视化数学概念',
      parameters: {
        type: 'object',
        properties: {
          shape_type: {
            type: 'string',
            description: '图形类型，如rect、circle、triangle等',
          },
          dimensions: {
            type: 'object',
            description: '图形的尺寸参数',
          },
          label: {
            type: 'string',
            description: '标签文字',
          },
          style: {
            type: 'string',
            description: '样式描述',
          },
        },
        required: ['shape_type', 'dimensions'],
      },
      execute: async (args, workDir) => {
        const { shape_type, dimensions, label, style } = args;
        let svg = '';

        switch (shape_type) {
          case 'rect':
            const width = dimensions.width || 100;
            const height = dimensions.height || 100;
            svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  ${label ? `<text x="${width/2}" y="${height/2}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}
</svg>`;
            break;
          case 'circle':
            const radius = dimensions.radius || 50;
            svg = `<svg width="${radius*2}" height="${radius*2}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${radius}" cy="${radius}" r="${radius-2}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  ${label ? `<text x="${radius}" y="${radius+5}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}
</svg>`;
            break;
          case 'triangle':
            const size = dimensions.size || 100;
            svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <polygon points="${size/2},0 ${size},${size} 0,${size}" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  ${label ? `<text x="${size/2}" y="${size/2}" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}
</svg>`;
            break;
          default:
            svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
  ${label ? `<text x="50" y="50" text-anchor="middle" fill="white" font-size="14">${label}</text>` : ''}
</svg>`;
        }

        return { svg, shape_type, dimensions };
      },
    });

    // 生成HTML组件工具
    this.registerTool({
      name: 'generate_html_component',
      description: '生成HTML组件代码，如公式卡片、步骤展示、练习题等',
      parameters: {
        type: 'object',
        properties: {
          component_type: {
            type: 'string',
            description: '组件类型，如formula、steps、exercise等',
          },
          content: {
            type: 'string',
            description: '组件内容',
          },
          style: {
            type: 'string',
            description: '样式描述',
          },
        },
        required: ['component_type', 'content'],
      },
      execute: async (args, workDir) => {
        const { component_type, content, style } = args;
        let html = '';

        switch (component_type) {
          case 'formula':
            html = `<div class="formula-box" style="${style || ''}">
  ${content}
</div>`;
            break;
          case 'steps':
            const steps = content.split('\n').filter((step: string) => step.trim());
            html = `<div class="steps-container" style="${style || ''}">
  ${steps.map((step: string, index: number) => `
  <div class="step">
    <div class="step-num">${index + 1}</div>
    <div class="step-content">${step}</div>
  </div>`).join('')}
</div>`;
            break;
          case 'exercise':
            html = `<div class="exercise-item" style="${style || ''}">
  <p>${content}</p>
  <input type="text" class="exercise-input">
  <button class="btn-check">检查</button>
  <div class="feedback"></div>
</div>`;
            break;
          default:
            html = `<div class="component" style="${style || ''}">
  ${content}
</div>`;
        }

        return { html, component_type };
      },
    });

    // 验证HTML工具
    this.registerTool({
      name: 'validate_html',
      description: '验证HTML代码的有效性和完整性',
      parameters: {
        type: 'object',
        properties: {
          html_code: {
            type: 'string',
            description: '要验证的HTML代码',
          },
        },
        required: ['html_code'],
      },
      execute: async (args, workDir) => {
        const { html_code } = args;
        const errors: string[] = [];

        // 基本HTML验证
        if (!html_code.includes('<!DOCTYPE html>')) {
          errors.push('缺少DOCTYPE声明');
        }
        if (!html_code.includes('<html')) {
          errors.push('缺少html标签');
        }
        if (!html_code.includes('</html>')) {
          errors.push('缺少html结束标签');
        }
        if (!html_code.includes('<head')) {
          errors.push('缺少head标签');
        }
        if (!html_code.includes('</head>')) {
          errors.push('缺少head结束标签');
        }
        if (!html_code.includes('<body')) {
          errors.push('缺少body标签');
        }
        if (!html_code.includes('</body>')) {
          errors.push('缺少body结束标签');
        }

        // 验证课件必需的模块
        if (!html_code.includes('id="concept"')) {
          errors.push('缺少概念讲解模块 (id="concept")');
        }
        if (!html_code.includes('id="demo"')) {
          errors.push('缺少图形演示模块 (id="demo")');
        }
        if (!html_code.includes('id="exercise"')) {
          errors.push('缺少练习测试模块 (id="exercise")');
        }

        return {
          valid: errors.length === 0,
          errors,
          html_length: html_code.length,
        };
      },
    });

    // 搜索教育内容工具
    this.registerTool({
      name: 'search_educational_content',
      description: '搜索相关的教育教学内容作为参考',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
          grade_level: {
            type: 'number',
            description: '年级',
          },
          subject: {
            type: 'string',
            description: '学科',
          },
        },
        required: ['query', 'grade_level', 'subject'],
      },
      execute: async (args, workDir) => {
        const { query, grade_level, subject } = args;
        
        // 模拟搜索结果
        const mockContent: Record<string, string> = {
          '正方形面积': `
# 正方形面积

## 概念
正方形的面积等于边长的平方，公式为：
S = a²

其中，S表示面积，a表示边长。

## 教学要点
1. 让学生理解面积的概念
2. 掌握正方形面积的计算公式
3. 能够应用公式解决实际问题

## 例题
边长为5cm的正方形，面积是多少？
解：S = 5² = 25 (cm²)
          `,
          '分数加减法': `
# 分数加减法

## 概念
同分母分数相加减，分母不变，分子相加减。
异分母分数相加减，先通分，再按同分母分数相加减的方法计算。

## 教学要点
1. 理解分数的基本概念
2. 掌握同分母分数加减法
3. 掌握异分母分数加减法
4. 能够解决实际问题

## 例题
1/2 + 1/4 = 2/4 + 1/4 = 3/4
          `,
          '圆的周长': `
# 圆的周长

## 概念
圆的周长等于圆周率π乘以直径，公式为：
C = πd 或 C = 2πr

其中，C表示周长，d表示直径，r表示半径，π≈3.14。

## 教学要点
1. 理解圆的基本概念
2. 掌握圆周长的计算公式
3. 能够应用公式解决实际问题

## 例题
半径为5cm的圆，周长是多少？
解：C = 2 × 3.14 × 5 = 31.4 (cm)
          `,
        };

        const content = mockContent[query as string] || `
# ${query}

## 概念
${query}是${subject}学科中的重要概念。

## 教学要点
1. 理解基本概念
2. 掌握计算方法
3. 能够应用解决实际问题

## 例题
请根据具体内容添加例题。
          `;

        return { content, query, grade_level, subject };
      },
    });

    // 保存课程HTML工具
    this.registerTool({
      name: 'save_course_html',
      description: '保存生成的课件HTML文件',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: '文件名',
          },
          html_content: {
            type: 'string',
            description: 'HTML内容',
          },
          course_id: {
            type: 'string',
            description: '课程ID',
          },
        },
        required: ['filename', 'html_content', 'course_id'],
      },
      execute: async (args, workDir) => {
        const { filename, html_content, course_id } = args;
        const courseDir = path.join(workDir, course_id);

        // 确保课程目录存在
        if (!fs.existsSync(courseDir)) {
          fs.mkdirSync(courseDir, { recursive: true });
        }

        const filePath = path.join(courseDir, filename);
        fs.writeFileSync(filePath, html_content);

        return {
          file_path: filePath,
          file_size: html_content.length,
          course_id,
          html: html_content,
        };
      },
    });
  }
}

// 全局工具管理器实例
export const toolManager = new ToolManager();
