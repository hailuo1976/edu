import axios from 'axios';
import * as path from 'path';
import { AgentProgress, AgentProgressCallback } from '../types/agent';
import { ToolManager, toolManager, ToolCall, ToolResult } from './toolManager';
import { AgentLogger } from '../utils/agentLogger';

export interface CourseToolResult {
  success: boolean;
  html: string;
  courseId: string;
  iterations: number;
  toolCalls: ToolResult[];
  error?: string;
}

export class CourseToolCallAgent {
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
    this.apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.OPENCODE_API_KEY || '';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.model = options.model || process.env.OPENAI_MODEL || 'qwen-plus';
    this.workDir = options.workDir || path.join(__dirname, '../../courses');
    this.maxIterations = options.maxIterations || 15;
    this.progressCallback = options.onProgress;
    this.toolManager = options.toolManager || toolManager;
    this.toolManager.setWorkDir(this.workDir);
    this.logger = new AgentLogger('CourseToolCallAgent');
  }

  async generate(prompt: string, subject: string, gradeLevel: number): Promise<CourseToolResult> {
    const courseId = `course_${Date.now()}`;
    const toolResults: ToolResult[] = [];
    let iterations = 0;
    let currentHtml = '';

    // 记录会话开始
    this.logger.info('generate_start', '开始生成课件', {
      courseId,
      prompt,
      subject,
      gradeLevel,
      maxIterations: this.maxIterations,
      model: this.model,
      baseUrl: this.baseUrl,
    });

    let messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: this.buildSystemPrompt(subject, gradeLevel, courseId) },
      { role: 'user', content: prompt },
    ];

    // 记录初始消息上下文
    this.logger.debug('context_init', '初始化消息上下文', {
      messages: messages.map(m => ({
        role: m.role,
        contentLength: m.content.length,
        contentPreview: m.content.substring(0, 200) + '...',
      })),
    });

    this.reportProgress({
      iteration: 0,
      stage: 'thinking',
      message: '开始使用工具生成课件...',
    });

    while (iterations < this.maxIterations) {
      iterations++;

      try {
            this.reportProgress({
              iteration: iterations,
              stage: 'thinking',
              message: `第 ${iterations} 轮：正在思考和规划...`,
            });

            this.logger.info('iteration_start', `第 ${iterations} 轮开始`, {
              currentHtmlLength: currentHtml.length,
              messageCount: messages.length,
            }, iterations);

            let response;
            try {
              response = await this.callAIWithTools(messages, iterations);
            } catch (error: any) {
              // 检查是否是超时错误
              if (error.message.includes('超时')) {
                this.logger.warn('ai_timeout', 'AI调用超时，尝试使用压缩后的提示词', {}, iterations);
                this.reportProgress({
                  iteration: iterations,
                  stage: 'retry',
                  message: 'AI调用超时，正在使用压缩后的提示词重试...',
                });
                
                // 压缩提示词
                const compressedMessages = this.compressMessages(messages);
                
                // 重新调用AI
                response = await this.callAIWithTools(compressedMessages, iterations);
                
                // 使用压缩后的消息继续
                messages = compressedMessages;
              } else {
                throw error;
              }
            }

            messages.push({ role: 'assistant', content: response.content });

            // 记录AI响应
            this.logger.debug('ai_response', 'AI响应内容', {
              contentLength: response.content.length,
              contentPreview: response.content.substring(0, 300) + '...',
              toolCallCount: response.toolCalls.length,
            }, iterations);

            if (this.checkCompletionCondition(response.content)) {
              if (currentHtml) {
                this.reportProgress({
                  iteration: iterations,
                  stage: 'complete',
                  message: '课件生成完成!',
                });
                this.logger.logSessionEnd(true, iterations, toolResults.length);
                return {
                  success: true,
                  html: currentHtml,
                  courseId,
                  iterations,
                  toolCalls: toolResults,
                };
              }
            }

            if (!response.toolCalls || response.toolCalls.length === 0) {
              this.logger.warn('no_tool_calls', 'AI未返回工具调用', {
                content: response.content.substring(0, 500),
              }, iterations);

              if (iterations >= this.maxIterations) {
                this.logger.logSessionEnd(false, iterations, toolResults.length);
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

        this.reportProgress({
          iteration: iterations,
          stage: 'tool_call',
          message: `执行 ${response.toolCalls.length} 个工具调用`,
          toolCalls: response.toolCalls.map(tc => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
        });

        this.logger.info('tool_calls', `准备执行 ${response.toolCalls.length} 个工具调用`, {
          toolCalls: response.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
        }, iterations);

        for (const toolCall of response.toolCalls) {
          this.logger.info('tool_execute', `执行工具: ${toolCall.name}`, {
            toolId: toolCall.id,
            arguments: toolCall.arguments,
          }, iterations);

          const result = await this.executeTool(toolCall, courseId, currentHtml);
          toolResults.push(result);

          // 记录工具执行结果
          this.logger.logToolCall(toolCall.name, toolCall.arguments, result, iterations);

          // 如果工具执行失败，记录错误
          if (!result.success) {
            this.logger.error('tool_failed', `工具执行失败: ${toolCall.name}`, {
              error: result.error,
              toolId: toolCall.id,
            }, iterations);
          }

          const toolResultContent = result.success
            ? JSON.stringify(result.result, null, 2)
            : `错误: ${result.error}`;

          messages.push({
            role: 'tool',
            content: toolResultContent,
          });

          if (result.toolName === 'save_course_html' && result.success && result.result?.html) {
            currentHtml = result.result.html;
          }
        }

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
            success: false,
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

    return {
      success: currentHtml.length > 0,
      html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
      courseId,
      iterations,
      toolCalls: toolResults,
      error: currentHtml ? undefined : '生成失败',
    };
  }

  private buildSystemPrompt(subject: string, gradeLevel: number, courseId: string): string {
    return `你是小学${gradeLevel}年级${subject}课件生成专家，可以使用工具来生成精美的互动课件。

## 重要提示
本次课程的唯一标识ID是: ${courseId}
在调用 save_course_html 工具时，必须使用这个 course_id: "${courseId}"，不要自行编造其他ID。

## 可用工具
### generate_svg
生成SVG矢量图形，用于可视化数学概念。
参数: shape_type(图形类型), dimensions(图形的尺寸参数), label(标签文字), style(样式描述)

### generate_html_component
生成HTML组件代码，如公式卡片、步骤展示、练习题等。
参数: component_type(组件类型), content(组件内容), style(样式描述)

### validate_html
验证HTML代码的有效性和完整性。
参数: html_code(要验证的HTML代码)

### search_educational_content
使用百度搜索API搜索相关的教育教学内容作为参考，获取最新、最准确的教学资料。
参数: query(搜索关键词), grade_level(年级), subject(学科)
**重要**: 请使用具体的搜索关键词，例如"正方形面积计算公式"、"分数加减法教学方法"等。

### save_course_html
保存生成的课件HTML文件。
参数: filename(文件名), html_content(HTML内容), course_id(课程ID)
**重要**: course_id 必须使用 "${courseId}"，不要自行编造其他ID。

## 课件要求
1. 必须生成完整的HTML页面，包含<!DOCTYPE html>、<html>、<head>、<body>标签
2. 页面必须包含三个主要模块：
   - id="concept": 概念讲解模块（基于搜索结果的最新内容）
   - id="demo": 图形演示模块（使用Canvas或SVG）
   - id="exercise": 练习测试模块（包含基于搜索结果的例题）
3. 使用现代化设计，包含渐变色、阴影、动画效果
4. 所有数学公式和概念用中文清晰解释
5. 图形必须清晰标注尺寸
6. 练习题要有即时反馈
7. 在概念讲解中引用搜索结果的相关内容，确保课件内容的准确性和时效性

## 工作流程
1. **搜索相关教学资料**：使用 search_educational_content 工具搜索最新的教学内容，包括概念解释、教学方法、例题等
2. **分析搜索结果**：基于搜索结果整理出核心概念和教学要点
3. **生成必要的SVG图形**：根据搜索结果生成相关的可视化图形
4. **生成HTML组件**：基于搜索结果生成公式卡片、步骤展示等组件
5. **组装完整课件**：将所有内容整合成完整的HTML页面
6. **验证HTML有效性**：确保生成的HTML代码结构完整
7. **保存课件文件**：将生成的课件保存到指定位置

## 结束条件
当课件生成并保存完成后，必须在回复中包含"完成"或"DONE"。`;
  }

  private async callAIWithTools(messages: Array<{ role: string; content: string }>, iteration: number): Promise<{
    content: string;
    toolCalls: ToolCall[];
  }> {
    if (!this.apiKey) {
      throw new Error('DASHSCOPE_API_KEY or OPENCODE_API_KEY is required');
    }

    const tools = this.toolManager.getTools();
    const apiEndpoint = `${this.baseUrl}/chat/completions`;
    const callStartTime = Date.now();

    console.log(`[CourseToolCallAgent] 调用 OpenAI 兼容接口: ${apiEndpoint}`);
    console.log(`[CourseToolCallAgent] 模型: ${this.model}`);
    console.log(`[CourseToolCallAgent] 消息数量: ${messages.length}`);

    // 记录AI调用开始
    this.logger.info('ai_call_start', `开始AI调用 - 模型: ${this.model}`, {
      apiEndpoint,
      model: this.model,
      messageCount: messages.length,
      toolCount: tools?.length || 0,
    }, iteration);

    const requestBody: any = {
      model: this.model,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    // 记录请求上下文
    const requestContext = {
      messages: messages.map(m => ({
        role: m.role,
        contentLength: m.content.length,
        contentPreview: m.content.substring(0, 500) + (m.content.length > 500 ? '...' : ''),
      })),
      tools: tools?.map(t => ({
        name: t.function?.name,
        description: t.function?.description?.substring(0, 100) + '...',
      })),
    };

    this.logger.debug('ai_request', 'AI请求详情', requestContext, iteration);

    try {
      // 增加超时时间到6分钟，以确保有足够时间检测5分钟超时
      const response = await this.retryWithTimeout(() => axios.post(
        apiEndpoint,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: 360000, // 6分钟超时
        }
      ), 3, 2000, 300000); // 5分钟检测

      const duration = Date.now() - callStartTime;
      const assistantMessage = response.data.choices?.[0]?.message;
      const content = assistantMessage?.content || '';
      const toolCalls: ToolCall[] = [];

      if (assistantMessage?.tool_calls && Array.isArray(assistantMessage.tool_calls)) {
        for (const tc of assistantMessage.tool_calls) {
          toolCalls.push({
            id: tc.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: tc.function?.name || '',
            arguments: this.toolManager.parseToolCallArgs(tc.function?.arguments || {}),
          });
        }
      }

      // 记录完整的AI调用上下文
      this.logger.logAIContext({
        iteration,
        apiEndpoint,
        model: this.model,
        request: requestContext,
        response: {
          content: content.substring(0, 1000) + (content.length > 1000 ? '...' : ''),
          toolCalls: toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          usage: response.data.usage,
        },
        duration,
      });

      console.log(`[CourseToolCallAgent] 响应: 内容长度=${content.length}, 工具调用=${toolCalls.length}`);

      return { content, toolCalls };
    } catch (error: any) {
      const duration = Date.now() - callStartTime;
      
      // 记录失败的AI调用
      this.logger.logAIContext({
        iteration,
        apiEndpoint,
        model: this.model,
        request: requestContext,
        error: error.message,
        duration,
      });

      this.logger.error('ai_call_failed', `AI调用失败: ${error.message}`, {
        error: error.response?.data || error.message,
        status: error.response?.status,
        duration,
      }, iteration);

      throw error;
    }
  }

  /**
   * 带超时检测的重试函数
   * @param fn 要执行的函数
   * @param maxAttempts 最大尝试次数
   * @param delayMs 延迟时间
   * @param timeoutMs 超时检测时间（毫秒）
   */
  private async retryWithTimeout<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number, timeoutMs: number): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 创建一个带超时检测的Promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`AI调用超时（超过 ${timeoutMs/1000/60} 分钟）`));
          }, timeoutMs);
        });

        // 同时执行原函数和超时检测
        const result = await Promise.race([fn(), timeoutPromise]);
        return result as T;
      } catch (error: any) {
        lastError = error;
        console.warn(`[CourseToolCallAgent] 尝试 ${attempt}/${maxAttempts} 失败: ${error.message}`);
        
        // 如果是超时错误，执行提示词压缩
        if (error.message.includes('超时') && attempt < maxAttempts) {
          console.log(`[CourseToolCallAgent] 执行提示词压缩...`);
          // 这里可以添加提示词压缩逻辑
          // 例如：简化系统提示，减少历史消息等
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        } else if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 压缩提示词
   * @param messages 原始消息
   * @returns 压缩后的消息
   */
  private compressMessages(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
    // 保留系统消息和最近的用户/助手消息
    const compressedMessages: Array<{ role: string; content: string }> = [];
    
    // 保留系统消息
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      // 简化系统提示，保留核心指令
      const simplifiedSystemContent = this.simplifySystemPrompt(systemMessage.content);
      compressedMessages.push({ role: 'system', content: simplifiedSystemContent });
    }
    
    // 保留最近的用户和助手消息（最近3轮对话）
    const recentMessages = messages.filter(msg => msg.role !== 'system');
    const messagesToKeep = recentMessages.slice(-6); // 保留最近3轮（用户+助手）
    compressedMessages.push(...messagesToKeep);
    
    console.log(`[CourseToolCallAgent] 提示词压缩完成: ${messages.length} → ${compressedMessages.length} 条消息`);
    return compressedMessages;
  }

  /**
   * 简化系统提示
   * @param systemPrompt 原始系统提示
   * @returns 简化后的系统提示
   */
  private simplifySystemPrompt(systemPrompt: string): string {
    // 提取核心指令，移除详细说明
    const coreInstructions = `你是小学课件生成专家，可以使用工具生成互动课件。

## 重要提示
本次课程的唯一标识ID是: ${this.extractCourseId(systemPrompt)}
在调用 save_course_html 工具时，必须使用正确的 course_id。

## 可用工具
- generate_svg: 生成SVG矢量图形
- generate_html_component: 生成HTML组件
- validate_html: 验证HTML代码
- search_educational_content: 搜索教育内容
- save_course_html: 保存课件文件

## 课件要求
1. 生成完整的HTML页面
2. 包含概念讲解、图形演示、练习测试三个模块
3. 使用现代化设计
4. 清晰解释数学公式和概念
5. 练习题要有即时反馈

## 工作流程
1. 搜索相关教学资料
2. 生成必要的SVG图形
3. 生成HTML组件
4. 组装完整课件
5. 验证HTML有效性
6. 保存课件文件

## 结束条件
当课件生成并保存完成后，必须在回复中包含"完成"或"DONE"。`;
    
    return coreInstructions;
  }

  /**
   * 从系统提示中提取课程ID
   * @param systemPrompt 系统提示
   * @returns 课程ID
   */
  private extractCourseId(systemPrompt: string): string {
    const match = systemPrompt.match(/本次课程的唯一标识ID是: (course_\d+)/);
    return match ? match[1] : `course_${Date.now()}`;
  }

  private async executeTool(toolCall: ToolCall, courseId: string, currentHtml: string): Promise<ToolResult> {
    try {
      // 为 save_course_html 工具强制使用正确的课程ID
      if (toolCall.name === 'save_course_html') {
        const originalCourseId = toolCall.arguments.course_id;
        toolCall.arguments.course_id = courseId;
        
        if (originalCourseId && originalCourseId !== courseId) {
          this.logger.warn('course_id_corrected', `修正了错误的 course_id: "${originalCourseId}" -> "${courseId}"`, {
            toolId: toolCall.id,
            originalCourseId,
            correctedCourseId: courseId,
          });
        }
      }

      // 执行工具
      const result = await this.retry(() => this.toolManager.executeTool(toolCall), 2, 1000);
      return result;
    } catch (error: any) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: error.message,
      };
    }
  }

  private checkCompletionCondition(content: string): boolean {
    const upperContent = content.toUpperCase();
    const completionKeywords = ['完成', 'DONE', 'FINISH', '任务完成', '所有文件已生成'];
    
    for (const keyword of completionKeywords) {
      if (upperContent.includes(keyword.toUpperCase())) {
        return true;
      }
    }
    
    return false;
  }

  private generateFallbackHtml(prompt: string, subject: string, gradeLevel: number): string {
    const topic = prompt.replace(/[？?]/, '');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${gradeLevel}年级 ${subject} - ${topic}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Noto Sans SC", sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 24px 32px; text-align: center; }
    .header h1 { font-size: 2rem; margin-bottom: 8px; }
    .nav-tabs { display: flex; justify-content: center; gap: 8px; padding: 16px; background: white; border-bottom: 1px solid #e2e8f0; }
    .nav-tab { padding: 12px 24px; border: none; background: #f1f5f9; color: #64748b; font-size: 0.95rem; font-weight: 500; border-radius: 8px; cursor: pointer; }
    .nav-tab:hover { background: #dbeafe; color: #3b82f6; }
    .nav-tab.active { background: #3b82f6; color: white; }
    .main-content { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
    .card-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 16px; }
    .formula-box { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 1.2rem; text-align: center; }
    canvas { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .controls { display: flex; gap: 16px; align-items: center; padding: 16px; background: #f1f5f9; border-radius: 12px; margin-bottom: 20px; }
    .controls input { padding: 8px 12px; border: 2px solid #e2e8f0; border-radius: 8px; width: 100px; }
    .btn { padding: 10px 20px; border: none; border-radius: 8px; background: #3b82f6; color: white; cursor: pointer; font-weight: 500; }
    .btn:hover { background: #1d4ed8; }
    .step { display: flex; gap: 12px; margin-bottom: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .step-num { width: 28px; height: 28px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; }
    .exercise-item { background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #e2e8f0; }
    .exercise-item input { padding: 8px 12px; border: 2px solid #e2e8f0; border-radius: 8px; margin-right: 12px; width: 120px; }
    .feedback { padding: 12px 16px; border-radius: 8px; margin-top: 12px; font-weight: 500; display: none; }
    .feedback.correct { background: #dcfce7; color: #10b981; display: block; }
    .feedback.wrong { background: #fee2e2; color: #ef4444; display: block; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📐 ${topic}</h1>
    <p>${gradeLevel}年级 ${subject} - 互动课件</p>
  </div>
  <div class="nav-tabs">
    <button class="nav-tab active" onclick="switchTab('concept')">📚 概念讲解</button>
    <button class="nav-tab" onclick="switchTab('demo')">🎨 图形演示</button>
    <button class="nav-tab" onclick="switchTab('exercise')">✏️ 练习测试</button>
  </div>
  <div class="main-content">
    <div id="concept" class="tab-content active">
      <div class="card">
        <div class="card-title">📖 ${topic}</div>
        <p style="line-height:1.8;">欢迎学习${topic}！</p>
        <div class="formula-box">S = a × a</div>
      </div>
    </div>
    <div id="demo" class="tab-content">
      <div class="card">
        <div class="card-title">🎨 交互式演示</div>
        <div class="controls">
          <input type="number" id="side" value="5" min="1" max="20">
          <button class="btn" onclick="draw()">绘制</button>
        </div>
        <canvas id="canvas" width="400" height="400"></canvas>
      </div>
    </div>
    <div id="exercise" class="tab-content">
      <div class="card">
        <div class="card-title">✏️ 练习题</div>
        <div class="exercise-item">
          <p>边长为6cm的正方形，面积是多少？</p>
          <input type="number" id="a1">
          <button class="btn" onclick="check(1,36)">提交</button>
          <div class="feedback" id="f1"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    function switchTab(id) {
      document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(e => e.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      event.target.classList.add('active');
      if(id==='demo') draw();
    }
    function draw() {
      const c = document.getElementById('canvas');
      const ctx = c.getContext('2d');
      const s = parseInt(document.getElementById('side').value) || 5;
      const size = Math.min(s * 15, 300);
      ctx.clearRect(0,0,400,400);
      ctx.fillStyle = '#dbeafe';
      ctx.fillRect(50,50,size,size);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(50,50,size,size);
    }
    function check(n, ans) {
      const v = document.getElementById('a'+n).value;
      const f = document.getElementById('f'+n);
      f.className = 'feedback ' + (v==ans?'correct':'wrong');
      f.textContent = v==ans?'✓ 正确！':'✗ 错误，正确答案是 '+ans;
    }
    draw();
  </script>
</body>
</html>`;
  }

  private reportProgress(progress: AgentProgress): void {
    console.log(`[CourseToolCallAgent] [${progress.stage}] ${progress.message}`);
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  private async retry<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        console.warn(`[CourseToolCallAgent] 尝试 ${attempt}/${maxAttempts} 失败: ${error.message}`);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  }
}
