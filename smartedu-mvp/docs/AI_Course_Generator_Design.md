# AI智能课件生成器 - 设计文档

## 1. 系统概述

### 1.1 核心功能
AI智能课件生成器是一个基于大语言模型(LLM)和工具调用(Tool Calling)的智能教育系统，能够自动生成互动式HTML课件。

### 1.2 系统架构
```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  问题输入   │  │  学科选择   │  │  年级选择          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        API服务层                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Express.js REST API                    │   │
│  │  • POST /api/course/generate  - 生成课程            │   │
│  │  • GET  /api/course/list     - 列出课程             │   │
│  │  • GET  /api/course/:id      - 获取课程             │   │
│  │  • GET  /api/health          - 健康检查             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        业务逻辑层                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ CourseService   │  │CourseToolCall   │  │ ToolManager │ │
│  │ 课程服务        │  │ Agent           │  │ 工具管理器  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        外部服务层                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  通义千问   │  │  百度搜索   │  │  本地文件系统       │ │
│  │  (AI模型)   │  │  (搜索API)  │  │  (课件存储)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心组件伪代码

### 2.1 主控制器 - CourseService

```typescript
/**
 * 课程服务 - 主入口
 * 负责协调课件生成流程
 */
class CourseService {
  private coursesDir: string;
  private courseToolCallAgent: CourseToolCallAgent;
  private courseAgent: CourseAgent;

  constructor() {
    this.coursesDir = path.join(__dirname, '../../courses');
    this.ensureCoursesDirExists();
    this.courseToolCallAgent = new CourseToolCallAgent({ 
      workDir: this.coursesDir 
    });
    this.courseAgent = new CourseAgent();
  }

  /**
   * 生成课件主方法
   * @param options 生成选项
   * @returns 生成的课程对象
   */
  async generateCourse(options: GenerateCourseOptions): Promise<Course> {
    const { topic, subject, gradeLevel, useTools = true, onProgress } = options;
    
    console.log(`[CourseService] 生成课程: ${topic} (${subject}, 年级 ${gradeLevel})`);
    
    try {
      if (useTools) {
        // 使用工具调用模式生成
        return await this.generateCourseWithTools(
          topic, subject, gradeLevel, onProgress
        );
      } else {
        // 使用非工具模式生成
        return await this.generateCourseWithoutTools(
          topic, subject, gradeLevel, onProgress
        );
      }
    } catch (error: any) {
      console.error(`[CourseService] 课程生成失败:`, error);
      
      // 降级到非工具生成模式
      if (useTools) {
        console.log(`[CourseService] 降级到非工具生成模式`);
        return await this.generateCourseWithoutTools(
          topic, subject, gradeLevel, onProgress
        );
      }
      
      throw error;
    }
  }

  /**
   * 使用工具调用模式生成课件
   */
  private async generateCourseWithTools(
    topic: string, 
    subject: string, 
    gradeLevel: number, 
    onProgress?: (progress: any) => void
  ): Promise<Course> {
    console.log(`[CourseService] 使用工具生成课程`);
    
    // 创建新的Agent实例，传递进度回调
    const courseToolCallAgent = new CourseToolCallAgent({
      workDir: this.coursesDir,
      onProgress  // 关键：传递进度回调以支持前端实时展示
    });
    
    const result = await courseToolCallAgent.generate(
      topic, subject, gradeLevel
    );
    
    console.log(`[CourseService] 工具生成结果: 成功=${result.success}`);
    
    if (!result.success) {
      console.warn(`[CourseService] 工具生成失败，降级到非工具生成模式`);
      return await this.generateCourseWithoutTools(
        topic, subject, gradeLevel, onProgress
      );
    }
    
    const course: Course = {
      id: result.courseId,
      topic,
      subject,
      gradeLevel,
      createdAt: new Date().toISOString(),
      html: result.html,
      toolCalls: result.toolCalls,
      sections: this.extractSectionsFromHtml(result.html),
    };
    
    await this.saveCourse(course);
    return course;
  }
}
```

---

### 2.2 AI代理 - CourseToolCallAgent

```typescript
/**
 * 课程工具调用代理
 * 核心AI循环逻辑，负责与AI模型交互和工具调用
 */
class CourseToolCallAgent {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private workDir: string;
  private maxIterations: number;
  private progressCallback?: AgentProgressCallback;
  private toolManager: ToolManager;
  private logger: AgentLogger;

  constructor(options: {
    workDir?: string;
    maxIterations?: number;
    onProgress?: AgentProgressCallback;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    toolManager?: ToolManager;
  } = {}) {
    this.apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || '';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 
                   'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.model = options.model || process.env.OPENAI_MODEL || 'qwen-plus';
    this.workDir = options.workDir || path.join(__dirname, '../../courses');
    this.maxIterations = options.maxIterations || 15;
    this.progressCallback = options.onProgress;
    this.toolManager = options.toolManager || toolManager;
    this.toolManager.setWorkDir(this.workDir);
    this.logger = new AgentLogger('CourseToolCallAgent');
  }

  /**
   * 主生成方法
   * 核心循环：AI思考 → 工具调用 → 结果处理 → 下一轮
   */
  async generate(
    prompt: string, 
    subject: string, 
    gradeLevel: number
  ): Promise<CourseToolResult> {
    const courseId = `course_${Date.now()}`;
    const toolResults: ToolResult[] = [];
    let iterations = 0;
    let currentHtml = '';

    // 初始化对话历史
    let messages: Array<{ role: string; content: string }> = [
      { 
        role: 'system', 
        content: this.buildSystemPrompt(subject, gradeLevel, courseId) 
      },
      { role: 'user', content: prompt },
    ];

    // 推送初始进度
    this.reportProgress({
      iteration: 0,
      stage: 'thinking',
      message: '开始使用工具生成课件...',
    });

    // 主循环：最多15轮迭代
    while (iterations < this.maxIterations) {
      iterations++;

      try {
        // 推送进度：开始思考
        this.reportProgress({
          iteration: iterations,
          stage: 'thinking',
          message: `第 ${iterations} 轮：正在思考和规划...`,
        });

        // 调用AI（带工具支持）
        const response = await this.callAIWithTools(messages, iterations);

        // 检查完成条件
        if (this.checkCompletionCondition(response.content)) {
          // 如果AI说完成了，但HTML为空，提示AI继续生成
          if (!currentHtml) {
            console.log(`[CourseToolCallAgent] AI说完成了，但HTML还未生成，继续执行...`);
            messages.push({
              role: 'user',
              content: '你说了完成，但我还没有收到生成的HTML内容。请使用save_course_html工具保存生成的课件。',
            });
            continue;
          }
          
          // 真正完成，返回成功结果
          this.reportProgress({
            iteration: iterations,
            stage: 'complete',
            message: '课件生成完成!',
          });
          
          return {
            success: true,
            html: currentHtml,
            courseId,
            iterations,
            toolCalls: toolResults,
          };
        }

        // 如果没有工具调用，提示AI继续使用工具
        if (!response.toolCalls || response.toolCalls.length === 0) {
          if (iterations >= this.maxIterations) {
            return {
              success: false,
              html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
              courseId,
              iterations,
              toolCalls: toolResults,
              error: '达到最大迭代次数',
            };
          }
          
          messages.push({
            role: 'user',
            content: '请继续使用工具完成任务。如果HTML已生成，请明确说明"完成"。',
          });
          continue;
        }

        // 推送进度：开始执行工具调用
        this.reportProgress({
          iteration: iterations,
          stage: 'tool_call',
          message: `执行 ${response.toolCalls.length} 个工具调用`,
          toolCalls: response.toolCalls.map(tc => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
        });

        // 执行所有工具调用
        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(toolCall, courseId, currentHtml);
          toolResults.push(result);

          // 更新当前HTML（如果是保存课件工具）
          if (result.toolName === 'save_course_html' && 
              result.success && 
              result.result?.html) {
            currentHtml = result.result.html;
          }

          // 将工具结果添加到对话历史
          messages.push({
            role: 'tool',
            content: result.success
              ? JSON.stringify(result.result, null, 2)
              : `错误: ${result.error}`,
          });
        }

        // 推送进度：工具执行完成
        this.reportProgress({
          iteration: iterations,
          stage: 'tool_result',
          message: `工具执行完成: ${toolResults.filter(r => r.success).length}/${toolResults.length} 成功`,
          toolResults,
        });

      } catch (error: any) {
        console.error(`[CourseToolCallAgent] 第 ${iterations} 轮执行失败:`, error.message);
        
        if (iterations >= this.maxIterations) {
          return {
            success: currentHtml.length > 0,
            html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
            courseId,
            iterations,
            toolCalls: toolResults,
            error: error.message,
          };
        }
        
        messages.push({
          role: 'user',
          content: `发生错误: ${error.message}，请继续尝试生成课件。`,
        });
      }
    }

    // 循环结束，检查是否成功生成了课件
    const success = currentHtml.length > 0;
    
    return {
      success,
      html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
      courseId,
      iterations,
      toolCalls: toolResults,
      error: success ? undefined : '生成失败',
    };
  }

  /**
   * 调用AI（带工具支持）
   * 包含超时检测和重试机制
   */
  private async callAIWithTools(
    messages: Array<{ role: string; content: string }>, 
    iteration: number
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const startTime = Date.now();
    
    // 构建请求体
    const requestBody = {
      model: this.model,
      messages,
      tools: this.toolManager.getTools(),
      stream: false,
    };

    // 推送AI输入到前端
    const aiInput = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
    this.reportProgress({
      iteration,
      stage: 'thinking',
      message: '正在调用AI...',
      ai_input: aiInput,  // 关键：推送AI输入到前端
    });

    try {
      // 调用AI API（带5分钟超时检测）
      const response = await this.retryWithTimeout(
        () => axios.post(
          `${this.baseUrl}/chat/completions`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            },
            timeout: 360000, // 6分钟超时
          }
        ),
        3,      // 最多重试3次
        2000,   // 重试间隔2秒
        300000  // 5分钟超时检测
      );

      const assistantMessage = response.data.choices?.[0]?.message;
      const content = assistantMessage?.content || '';
      
      // 解析工具调用
      const toolCalls: ToolCall[] = [];
      if (assistantMessage?.tool_calls) {
        for (const tc of assistantMessage.tool_calls) {
          toolCalls.push({
            id: tc.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: tc.function?.name || '',
            arguments: this.toolManager.parseToolCallArgs(
              tc.function?.arguments || {}
            ),
          });
        }
      }

      // 推送AI输出到前端
      this.reportProgress({
        iteration,
        stage: 'thinking',
        message: 'AI响应已接收',
        ai_output: content.substring(0, 2000) + 
                   (content.length > 2000 ? '...' : ''),  // 关键：推送AI输出到前端
      });

      return { content, toolCalls };

    } catch (error: any) {
      // 超时检测：超过5分钟则压缩提示词后重试
      if (Date.now() - startTime > 300000) {
        console.log('[CourseToolCallAgent] AI调用超时，压缩提示词后重试...');
        const compressedMessages = this.compressMessages(messages);
        return await this.callAIWithTools(compressedMessages, iteration);
      }
      throw error;
    }
  }

  /**
   * 执行单个工具
   */
  private async executeTool(
    toolCall: ToolCall, 
    courseId: string, 
    currentHtml: string
  ): Promise<ToolResult> {
    try {
      // 修正课程ID（防止AI使用错误的ID）
      if (toolCall.name === 'save_course_html') {
        toolCall.arguments.course_id = courseId;
      }

      // 推送工具调用开始信息
      this.reportProgress({
        iteration: 0,
        stage: 'tool_call',
        message: `正在执行工具: ${toolCall.name}`,
        tool_call: {
          name: toolCall.name,
          arguments: toolCall.arguments,
          success: false,
        },
      });

      // 执行工具
      const result = await this.retry(
        () => this.toolManager.executeTool(toolCall), 
        2, 
        1000
      );
      
      // 推送工具调用结果
      this.reportProgress({
        iteration: 0,
        stage: 'tool_result',
        message: `工具执行完成: ${toolCall.name}`,
        tool_call: {
          name: toolCall.name,
          arguments: toolCall.arguments,
          result: result.result,
          success: result.success,
          error: result.error,
        },
      });

      // 推送草稿内容（如果有）
      if (result.result && typeof result.result === 'object') {
        if (result.result.svg_code) {
          this.reportProgress({
            iteration: 0,
            stage: 'tool_result',
            message: '生成了SVG图形草稿',
            draft_content: {
              type: 'svg',
              title: 'SVG图形',
              content: result.result.svg_code,
            },
          });
        }
        
        if (result.result.html_content) {
          this.reportProgress({
            iteration: 0,
            stage: 'tool_result',
            message: '生成了HTML内容草稿',
            draft_content: {
              type: 'html',
              title: 'HTML内容',
              content: result.result.html_content,
            },
          });
        }
      }

      return result;

    } catch (error: any) {
      // 推送工具调用错误
      this.reportProgress({
        iteration: 0,
        stage: 'tool_result',
        message: `工具执行失败: ${toolCall.name}`,
        tool_call: {
          name: toolCall.name,
          arguments: toolCall.arguments,
          error: error.message,
          success: false,
        },
      });

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 检查完成条件
   */
  private checkCompletionCondition(content: string): boolean {
    const upperContent = content.toUpperCase();
    const completionKeywords = [
      '完成', 'DONE', 'FINISH', '任务完成', '所有文件已生成'
    ];
    
    return completionKeywords.some(keyword => 
      upperContent.includes(keyword.toUpperCase())
    );
  }

  /**
   * 压缩提示词（用于超时重试）
   */
  private compressMessages(
    messages: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    const compressedMessages: Array<{ role: string; content: string }> = [];
    
    // 保留系统消息（简化版）
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      compressedMessages.push({
        role: 'system',
        content: this.simplifySystemPrompt(systemMessage.content)
      });
    }
    
    // 保留最近3轮对话（用户+助手）
    const recentMessages = messages.filter(msg => msg.role !== 'system');
    compressedMessages.push(...recentMessages.slice(-6));
    
    return compressedMessages;
  }

  /**
   * 推送进度到前端
   */
  private reportProgress(progress: AgentProgress): void {
    console.log(`[CourseToolCallAgent] [${progress.stage}] ${progress.message}`);
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}
```

---

### 2.3 工具管理器 - ToolManager

```typescript
/**
 * 工具管理器
 * 负责注册、管理和执行所有可用工具
 */
class ToolManager {
  private tools: Map<string, ToolDefinition>;
  private workDir: string;

  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    // 搜索工具
    this.registerTool('search_educational_content', {
      description: '搜索教育内容',
      parameters: {
        query: '搜索关键词',
        grade_level: '年级',
        subject: '学科'
      },
      execute: async (args) => {
        // 调用百度搜索API
        const response = await axios.post(
          'https://qianfan.baidubce.com/v2/ai_search/web_search',
          {
            messages: [{ 
              role: 'user', 
              content: `${args.query} ${args.subject} ${args.grade_level}年级` 
            }]
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.BAIDU_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        return { content: this.formatSearchResults(response.data) };
      }
    });

    // SVG生成工具
    this.registerTool('generate_svg', {
      description: '生成SVG图形',
      parameters: {
        shape_type: '图形类型',
        dimensions: '尺寸参数',
        label: '标签文字',
        style: '样式描述'
      },
      execute: async (args) => {
        const svgCode = this.generateSVG(args);
        return { svg_code: svgCode };
      }
    });

    // HTML组件生成工具
    this.registerTool('generate_html_component', {
      description: '生成HTML组件',
      parameters: {
        component_type: '组件类型',
        content: '组件内容',
        style: '样式描述'
      },
      execute: async (args) => {
        const htmlCode = this.generateHTMLComponent(args);
        return { html_content: htmlCode };
      }
    });

    // HTML验证工具
    this.registerTool('validate_html', {
      description: '验证HTML代码',
      parameters: {
        html_code: 'HTML代码'
      },
      execute: async (args) => {
        const isValid = this.validateHTML(args.html_code);
        return { valid: isValid };
      }
    });

    // 保存课件工具
    this.registerTool('save_course_html', {
      description: '保存课件HTML文件',
      parameters: {
        filename: '文件名',
        html_content: 'HTML内容',
        course_id: '课程ID'
      },
      execute: async (args) => {
        const filePath = path.join(this.workDir, args.course_id, args.filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, args.html_content, 'utf-8');
        return { 
          success: true, 
          file_path: filePath,
          html: args.html_content 
        };
      }
    });

    // 文件操作工具
    this.registerTool('create_file', { /* ... */ });
    this.registerTool('write_file', { /* ... */ });
    this.registerTool('read_file', { /* ... */ });
    this.registerTool('list_files', { /* ... */ });
    this.registerTool('file_exists', { /* ... */ });
    this.registerTool('create_directory', { /* ... */ });
    this.registerTool('delete_file', { /* ... */ });
    this.registerTool('copy_file', { /* ... */ });
  }

  /**
   * 执行工具
   */
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      throw new Error(`未知工具: ${toolCall.name}`);
    }
    
    try {
      const result = await tool.execute(toolCall.arguments);
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: true,
        result
      };
    } catch (error: any) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取工具列表（用于AI调用）
   */
  getTools(): OpenCodeTool[] {
    return Array.from(this.tools.entries()).map(([name, tool]) => ({
      type: 'function',
      function: {
        name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: this.buildParameterSchema(tool.parameters),
          required: Object.keys(tool.parameters)
        }
      }
    }));
  }
}
```

---

### 2.4 前端实时展示

```typescript
/**
 * 前端事件处理
 * 通过SSE接收后端进度更新并展示
 */
function setupEventStream() {
  const eventSource = new EventSource('/api/course/generate?stream=true');
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleProgress(data);
  };
}

function handleProgress(data: AgentProgress) {
  const { 
    stage, 
    message, 
    ai_input, 
    ai_output, 
    tool_call, 
    draft_content 
  } = data;

  // 显示AI交互面板
  if (ai_input || ai_output) {
    aiInteraction.classList.add('show');
    
    if (ai_input) {
      aiInput.innerHTML = `<pre>${escapeHtml(ai_input)}</pre>`;
    }
    
    if (ai_output) {
      aiOutput.innerHTML = `<pre>${escapeHtml(ai_output)}</pre>`;
    }
  }

  // 处理工具调用
  if (tool_call) {
    aiInteraction.classList.add('show');
    displayToolCall(tool_call);
  }

  // 处理草稿内容
  if (draft_content) {
    aiInteraction.classList.add('show');
    displayDraftContent(draft_content);
  }

  // 更新时间线
  updateTimeline(stage, message);
}
```

---

## 3. 数据流图

```
用户输入问题
    │
    ▼
┌─────────────────┐
│ 构建系统提示词  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   AI循环生成    │◀────│   检查完成条件   │
│  (最多15轮)     │     │  (完成关键词)    │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  推送AI输入     │     │  调用AI(带工具)  │
│  到前端展示     │     │  (5分钟超时检测) │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │  AI返回响应  │ │  超时重试   │ │  压缩提示词 │
          │ (内容+工具)  │ │  (最多3次)  │ │  (简化历史) │
          └──────┬──────┘ └─────────────┘ └─────────────┘
                 │
                 ▼
┌─────────────────┐     ┌─────────────────┐
│  推送AI输出     │────▶│  解析工具调用   │
│  到前端展示     │     │                 │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │  搜索工具   │ │  SVG生成    │ │  保存课件   │
          │  (百度搜索) │ │  (图形)     │ │  (HTML文件) │
          └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                 │               │               │
                 ▼               ▼               ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │ 推送工具    │ │ 推送草稿    │ │ 更新当前    │
          │ 调用信息    │ │ 内容(SVG)   │ │ HTML内容    │
          └─────────────┘ └─────────────┘ └─────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    推送工具执行结果      │
                    │    到前端展示           │
                    └─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    更新对话历史          │
                    │    继续下一轮            │
                    └─────────────────────────┘
```

---

## 4. 关键设计决策

### 4.1 为什么使用工具调用模式？

1. **结构化输出**：AI通过工具调用生成结构化内容，比纯文本更可靠
2. **模块化生成**：将课件拆分为多个组件（SVG、HTML组件、搜索内容）分别生成
3. **可验证性**：每个工具的执行结果可以被验证和重试
4. **实时反馈**：工具执行过程可以实时展示给用户

### 4.2 超时处理策略

1. **5分钟检测**：如果AI调用超过5分钟，认为可能超时
2. **提示词压缩**：保留系统消息和最近3轮对话，减少token数量
3. **重试机制**：最多重试3次，每次间隔递增

### 4.3 完成条件判断

1. **关键词检测**：AI回复中包含"完成"、"DONE"等关键词
2. **HTML验证**：确保HTML内容已生成且不为空
3. **双重检查**：即使AI说完成，也要验证HTML是否存在

### 4.4 前端实时展示

1. **SSE流式传输**：使用Server-Sent Events实现实时进度推送
2. **多面板展示**：AI输入、AI输出、工具调用、草稿内容分别展示
3. **可折叠面板**：用户可以展开/收起查看详细信息

---

## 5. 扩展性设计

### 5.1 添加新工具

```typescript
// 在ToolManager中注册新工具
this.registerTool('new_tool_name', {
  description: '工具描述',
  parameters: {
    param1: '参数1描述',
    param2: '参数2描述'
  },
  execute: async (args) => {
    // 工具实现逻辑
    return { result: '工具执行结果' };
  }
});
```

### 5.2 支持新学科

```typescript
// 在系统提示词中添加学科特定指令
const subjectSpecificInstructions = {
  '数学': '重点展示公式推导和图形演示',
  '语文': '重点展示文本分析和阅读理解',
  '英语': '重点展示词汇学习和语法讲解',
  '科学': '重点展示实验演示和科学探究'
};
```

### 5.3 自定义模板

```typescript
// 支持自定义课件模板
interface CourseTemplate {
  name: string;
  layout: 'standard' | 'interactive' | 'gamified';
  colorScheme: string[];
  components: string[];
}
```

---

## 6. 性能优化

### 6.1 缓存策略

1. **搜索结果缓存**：相同关键词的搜索结果缓存30分钟
2. **SVG缓存**：相同参数的SVG图形缓存1小时
3. **HTML组件缓存**：常用组件模板缓存

### 6.2 并发控制

1. **工具调用并发**：多个独立工具可以并发执行
2. **请求限流**：限制同时进行的课件生成请求数量
3. **资源池管理**：管理AI API连接池

### 6.3 降级策略

1. **工具模式失败**：自动降级到非工具模式
2. **搜索API失败**：使用本地知识库内容
3. **AI API失败**：使用预设模板生成基础课件

---

## 7. 安全考虑

### 7.1 API密钥管理

1. **环境变量存储**：所有API密钥存储在.env文件
2. **密钥轮换**：定期更换API密钥
3. **访问控制**：限制API密钥的访问权限

### 7.2 输入验证

1. **参数校验**：使用Zod进行严格的参数校验
2. **内容过滤**：过滤恶意HTML和JavaScript代码
3. **文件路径验证**：防止目录遍历攻击

### 7.3 日志脱敏

1. **密钥脱敏**：日志中不显示完整API密钥
2. **内容截断**：过长的内容在日志中截断显示
3. **敏感信息过滤**：过滤用户隐私信息

---

## 8. 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                      负载均衡器 (Nginx)                      │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   应用服务器1   │ │   应用服务器2   │ │   应用服务器N   │
    │  (Node.js)      │ │  (Node.js)      │ │  (Node.js)      │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             └───────────┬───────┴───────────────────┘
                         ▼
    ┌─────────────────────────────────────────────────────────┐
    │                   共享存储 (NAS)                         │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
    │  │  课件文件   │  │  日志文件   │  │  临时文件       │ │
    │  └─────────────┘  └─────────────┘  └─────────────────┘ │
    └─────────────────────────────────────────────────────────┘
```

---

## 9. 监控与告警

### 9.1 关键指标

1. **生成成功率**：课件生成成功的比例
2. **平均生成时间**：课件生成的平均耗时
3. **AI调用次数**：每节课件平均AI调用次数
4. **工具调用成功率**：各工具的执行成功率

### 9.2 告警规则

1. **生成失败率过高**：连续5次生成失败触发告警
2. **AI响应时间过长**：单次AI调用超过5分钟触发告警
3. **API错误率过高**：API错误率超过10%触发告警
4. **磁盘空间不足**：磁盘空间低于20%触发告警

---

## 10. 未来扩展

### 10.1 多模态支持

1. **图片生成**：集成DALL-E或Stable Diffusion生成教学插图
2. **语音合成**：将课件内容转换为语音讲解
3. **视频生成**：自动生成教学视频

### 10.2 个性化推荐

1. **学习路径推荐**：根据学生水平推荐课件
2. **难度自适应**：根据学生反馈调整课件难度
3. **知识点关联**：自动关联相关知识点

### 10.3 协作功能

1. **教师协作**：多位教师共同编辑课件
2. **学生反馈**：收集学生对课件的反馈
3. **版本管理**：课件版本历史和回滚

---

**文档版本**: 1.0  
**最后更新**: 2026-03-28  
**作者**: AI Assistant
