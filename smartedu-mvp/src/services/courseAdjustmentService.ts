import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  CourseInfo,
  AdjustmentSession,
  AdjustmentRequest,
  AdjustmentResponse,
  ConversationMessage,
  AdjustmentRecord,
  HtmlChange,
  AdjustmentProgress,
  ListCoursesResponse,
  RollbackResponse,
  ValidateAdjustmentResponse,
  ValidationIssue,
  LogMessage,
  LogLevel,
  LogCategory,
} from '../types/adjustment';
import { toolManager } from './toolManager';

function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export class CourseAdjustmentService {
  private coursesDir: string;
  private sessionsDir: string;
  private sessions: Map<string, AdjustmentSession> = new Map();
  private progressCallbacks: Map<string, (progress: AdjustmentProgress) => void> = new Map();
  private logCallbacks: Map<string, (log: LogMessage) => void> = new Map();

  constructor() {
    this.coursesDir = path.join(__dirname, '../../courses');
    this.sessionsDir = path.join(__dirname, '../../adjustment-sessions');
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.coursesDir)) {
      fs.mkdirSync(this.coursesDir, { recursive: true });
    }
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * 列出所有可用的课件
   */
  async listCourses(): Promise<ListCoursesResponse> {
    try {
      const courses: CourseInfo[] = [];
      const entries = fs.readdirSync(this.coursesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const courseInfo = await this.getCourseInfoFromDir(entry.name);
          if (courseInfo) {
            courses.push(courseInfo);
          }
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          const courseInfo = await this.getCourseInfoFromFile(entry.name);
          if (courseInfo) {
            courses.push(courseInfo);
          }
        }
      }

      courses.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        success: true,
        courses,
        total: courses.length,
      };
    } catch (error: any) {
      console.error('[CourseAdjustmentService] 列出课件失败:', error);
      return {
        success: false,
        courses: [],
        total: 0,
        error: error.message,
      };
    }
  }

  private async getCourseInfoFromDir(dirName: string): Promise<CourseInfo | null> {
    try {
      const dirPath = path.join(this.coursesDir, dirName);
      const files = fs.readdirSync(dirPath);
      const htmlFile = files.find(f => f.endsWith('.html'));
      
      if (!htmlFile) return null;

      const filePath = path.join(dirPath, htmlFile);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const metadata = this.extractMetadataFromHtml(content);
      
      return {
        id: dirName,
        topic: metadata.topic || dirName,
        subject: metadata.subject || '未知学科',
        gradeLevel: metadata.gradeLevel || 0,
        createdAt: stats.birthtime.toISOString(),
        filePath,
        preview: this.generatePreview(content),
      };
    } catch (error) {
      console.error(`[CourseAdjustmentService] 读取目录 ${dirName} 失败:`, error);
      return null;
    }
  }

  private async getCourseInfoFromFile(fileName: string): Promise<CourseInfo | null> {
    try {
      const filePath = path.join(this.coursesDir, fileName);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const metadata = this.extractMetadataFromHtml(content);
      const id = fileName.replace('.html', '');
      
      return {
        id,
        topic: metadata.topic || id,
        subject: metadata.subject || '未知学科',
        gradeLevel: metadata.gradeLevel || 0,
        createdAt: stats.birthtime.toISOString(),
        filePath,
        preview: this.generatePreview(content),
      };
    } catch (error) {
      console.error(`[CourseAdjustmentService] 读取文件 ${fileName} 失败:`, error);
      return null;
    }
  }

  private extractMetadataFromHtml(html: string): { topic?: string; subject?: string; gradeLevel?: number } {
    const metadata: { topic?: string; subject?: string; gradeLevel?: number } = {};
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.topic = titleMatch[1].trim();
    }
    
    const subjectMatch = html.match(/data-subject=["']([^"']+)["']/i);
    if (subjectMatch) {
      metadata.subject = subjectMatch[1];
    }
    
    const gradeMatch = html.match(/data-grade=["'](\d+)["']/i);
    if (gradeMatch) {
      metadata.gradeLevel = parseInt(gradeMatch[1], 10);
    }
    
    return metadata;
  }

  private generatePreview(html: string): string {
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');
  }

  /**
   * 创建或获取调整会话
   */
  async createSession(courseId: string): Promise<AdjustmentSession> {
    const courseInfo = await this.getCourseInfo(courseId);
    if (!courseInfo) {
      throw new Error(`课件不存在: ${courseId}`);
    }

    const html = fs.readFileSync(courseInfo.filePath, 'utf-8');
    
    const session: AdjustmentSession = {
      sessionId: generateId(),
      courseId,
      courseInfo,
      originalHtml: html,
      currentHtml: html,
      conversationHistory: [],
      adjustmentHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    };

    this.sessions.set(session.sessionId, session);
    await this.saveSession(session);

    return session;
  }

  private async getCourseInfo(courseId: string): Promise<CourseInfo | null> {
    const dirPath = path.join(this.coursesDir, courseId);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      return this.getCourseInfoFromDir(courseId);
    }
    
    const filePath = path.join(this.coursesDir, `${courseId}.html`);
    if (fs.existsSync(filePath)) {
      return this.getCourseInfoFromFile(`${courseId}.html`);
    }
    
    return null;
  }

  /**
   * 报告日志信息
   */
  private reportLog(
    sessionId: string,
    level: LogLevel,
    category: LogCategory,
    message: string,
    details?: any,
    indentLevel?: number
  ): void {
    const callback = this.logCallbacks.get(sessionId);
    if (callback) {
      callback({
        id: generateId(),
        level,
        category,
        message,
        timestamp: new Date(),
        details,
        indentLevel,
      });
    }
  }

  /**
   * 处理调整请求
   */
  async processAdjustment(
    request: AdjustmentRequest,
    onProgress?: (progress: AdjustmentProgress) => void,
    onLog?: (log: LogMessage) => void
  ): Promise<AdjustmentResponse> {
    try {
      console.log('========================================');
      console.log('[CourseAdjustmentService] 开始处理课件调整请求');
      console.log(`[CourseAdjustmentService] 会话ID: ${request.sessionId || '新会话'}`);
      console.log(`[CourseAdjustmentService] 课件ID: ${request.courseId}`);
      console.log(`[CourseAdjustmentService] 用户请求: ${request.userRequest}`);
      console.log('========================================');

      let session: AdjustmentSession | null = null;

      if (request.sessionId) {
        console.log('[CourseAdjustmentService] 正在获取现有会话...');
        session = await this.getSession(request.sessionId);
        if (!session) {
          throw new Error(`会话不存在: ${request.sessionId}`);
        }
        console.log('[CourseAdjustmentService] 会话获取成功');
      } else {
        console.log('[CourseAdjustmentService] 正在创建新会话...');
        session = await this.createSession(request.courseId);
        console.log('[CourseAdjustmentService] 新会话创建成功');
      }

      if (!session) {
        throw new Error('无法创建或获取会话');
      }

      console.log(`[CourseAdjustmentService] 课件信息: 主题=${session.courseInfo.topic}, 学科=${session.courseInfo.subject}, 年级=${session.courseInfo.gradeLevel}`);

      if (onProgress) {
        this.progressCallbacks.set(session.sessionId, onProgress);
      }
      if (onLog) {
        this.logCallbacks.set(session.sessionId, onLog);
        this.reportLog(session.sessionId, 'info', 'system', '开始处理课件调整请求', {
          sessionId: session.sessionId,
          courseId: request.courseId,
          userRequest: request.userRequest,
        }, 0);
      }

      console.log('[CourseAdjustmentService] 阶段: 分析用户请求');
      this.reportProgress(session.sessionId, 'analyzing', '正在分析您的修改请求...', 10);

      const userMessage: ConversationMessage = {
        id: generateId(),
        role: 'user',
        content: request.userRequest,
        timestamp: new Date(),
      };
      session.conversationHistory.push(userMessage);

      console.log('[CourseAdjustmentService] 阶段: 规划修改方案');
      this.reportProgress(session.sessionId, 'planning', '正在规划修改方案...', 30);

      console.log('[CourseAdjustmentService] 构建系统提示词和消息...');
      const systemPrompt = this.buildSystemPrompt(session);
      const messages = this.buildMessages(session, systemPrompt);
      console.log(`[CourseAdjustmentService] 消息数量: ${messages.length}`);

      console.log('[CourseAdjustmentService] 阶段: 执行AI调用');
      this.reportProgress(session.sessionId, 'executing', '正在执行修改...', 50);

      console.log('[CourseAdjustmentService] 开始调用AI...');
      const aiResponse = await this.callAI(messages, session, onLog);
      console.log(`[CourseAdjustmentService] AI调用完成，处理时间: ${aiResponse.processingTime}ms`);
      console.log(`[CourseAdjustmentService] 工具调用次数: ${aiResponse.toolCalls.length}`);

      console.log('[CourseAdjustmentService] 阶段: 验证修改结果');
      this.reportProgress(session.sessionId, 'validating', '正在验证修改结果...', 80);

      const adjustmentRecord = await this.createAdjustmentRecord(
        session,
        request.userRequest,
        aiResponse.content,
        aiResponse.html
      );

      session.adjustmentHistory.push(adjustmentRecord);
      session.currentHtml = aiResponse.html;
      session.updatedAt = new Date();

      const assistantMessage: ConversationMessage = {
        id: generateId(),
        role: 'assistant',
        content: aiResponse.content,
        timestamp: new Date(),
        metadata: {
          toolCalls: aiResponse.toolCalls,
          processingTime: aiResponse.processingTime,
        },
      };
      session.conversationHistory.push(assistantMessage);

      console.log('[CourseAdjustmentService] 保存会话...');
      await this.saveSession(session);

      console.log('[CourseAdjustmentService] 阶段: 完成');
      this.reportProgress(session.sessionId, 'complete', '修改完成!', 100);

      console.log('========================================');
      console.log('[CourseAdjustmentService] 课件调整请求处理完成');
      console.log(`[CourseAdjustmentService] 会话ID: ${session.sessionId}`);
      console.log(`[CourseAdjustmentService] AI回复长度: ${aiResponse.content?.length || 0} 字符`);
      console.log(`[CourseAdjustmentService] HTML长度: ${aiResponse.html?.length || 0} 字符`);
      console.log('========================================');

      return {
        success: true,
        sessionId: session.sessionId,
        message: aiResponse.content,
        html: aiResponse.html,
        conversationHistory: session.conversationHistory,
        adjustmentRecord,
      };
    } catch (error: any) {
      console.error('========================================');
      console.error('[CourseAdjustmentService] 处理调整请求失败:', error);
      console.error('========================================');
      return {
        success: false,
        sessionId: request.sessionId || '',
        error: error.message,
      };
    }
  }

  private reportProgress(
    sessionId: string,
    stage: AdjustmentProgress['stage'],
    message: string,
    progress: number,
    details?: AdjustmentProgress['details']
  ): void {
    const callback = this.progressCallbacks.get(sessionId);
    if (callback) {
      callback({
        sessionId,
        stage,
        message,
        progress,
        timestamp: new Date(),
        details,
      });
    }
  }

  private buildSystemPrompt(session: AdjustmentSession): string {
    return `你是一个专业的课件调整助手。你的任务是帮助教师修改和完善HTML课件。

## 当前课件信息
- 主题: ${session.courseInfo.topic}
- 学科: ${session.courseInfo.subject}
- 年级: ${session.courseInfo.gradeLevel}

## 你的能力
1. 修改课件内容（文字、图片、公式等）
2. 调整课件结构和布局
3. 添加新的教学元素（互动练习、示例等）
4. 优化教学设计和呈现方式
5. 修复HTML结构和样式问题

## 工作流程
1. 理解用户的修改需求
2. 分析当前HTML结构
3. 规划修改方案
4. 使用save_course_html工具保存修改后的HTML
5. 向用户说明修改内容

## 重要规则
- 保持课件的教学完整性
- 确保HTML结构正确
- 保留原有的教学重点
- 修改后必须使用save_course_html工具保存
- 用中文回复用户

## 可用工具
- save_course_html: 保存修改后的HTML内容
- search_educational_content: 搜索教育内容
- generate_svg_diagram: 生成SVG图形`;
  }

  private buildMessages(session: AdjustmentSession, systemPrompt: string): any[] {
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (session.conversationHistory.length === 0) {
      messages.push({
        role: 'user',
        content: `这是当前的课件HTML内容，请先分析一下这个课件的结构和内容：\n\n\`\`\`html\n${session.currentHtml}\n\`\`\``,
      });
    } else {
      for (const msg of session.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return messages;
  }

  private async callAI(
    messages: any[],
    session: AdjustmentSession,
    onLog?: (log: LogMessage) => void
  ): Promise<{ content: string; html: string; toolCalls: any[]; processingTime: number }> {
    console.log('  [callAI] 开始AI调用流程');
    if (onLog) {
      this.reportLog(session.sessionId, 'info', 'ai', '开始AI调用流程', null, 1);
    }
    const startTime = Date.now();
    const toolCalls: any[] = [];
    let currentHtml = '';
    let lastContent = '';

    const apiKey = process.env.OPENAI_API_KEY || process.env.DASHSCOPE_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = process.env.OPENAI_MODEL || 'qwen-plus';

    console.log(`  [callAI] API配置: baseUrl=${baseUrl}, model=${model}`);
    if (onLog) {
      this.reportLog(session.sessionId, 'info', 'ai', 'API配置', {
        baseUrl,
        model,
      }, 1);
    }

    if (!apiKey) {
      console.error('  [callAI] 错误: 未配置API密钥');
      throw new Error('未配置API密钥');
    }

    const tools = [
      {
        type: 'function',
        function: {
          name: 'save_course_html',
          description: '保存修改后的HTML课件内容',
          parameters: {
            type: 'object',
            properties: {
              html_content: {
                type: 'string',
                description: '完整的HTML课件内容',
              },
              changes_summary: {
                type: 'string',
                description: '修改内容摘要',
              },
            },
            required: ['html_content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_educational_content',
          description: '搜索教育相关内容',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generate_svg_diagram',
          description: '生成SVG图形',
          parameters: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: '图形描述',
              },
              diagram_type: {
                type: 'string',
                description: '图形类型',
              },
            },
            required: ['description'],
          },
        },
      },
    ];

    const maxIterations = 10;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;
      console.log(`  [callAI] 开始第 ${iterations}/${maxIterations} 轮迭代`);
      if (onLog) {
        this.reportLog(session.sessionId, 'info', 'ai', `开始第 ${iterations}/${maxIterations} 轮迭代`, null, 1);
      }

      this.reportProgress(session.sessionId, 'executing', `正在处理 (第${iterations}轮)...`, 50 + iterations * 3);

      console.log(`  [callAI] 发送请求到AI API...`);
      if (onLog) {
        this.reportLog(session.sessionId, 'info', 'ai', '发送请求到AI API', null, 2);
      }
      const apiStartTime = Date.now();
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 16000,
        }),
      });

      const apiDuration = Date.now() - apiStartTime;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  [callAI] AI API调用失败: ${response.status} - ${errorText}`);
        if (onLog) {
          this.reportLog(session.sessionId, 'error', 'ai', `AI API调用失败`, {
            status: response.status,
            error: errorText,
          }, 2);
        }
        throw new Error(`AI调用失败: ${response.status} - ${errorText}`);
      }

      console.log(`  [callAI] AI API响应成功，耗时: ${apiDuration}ms`);
      if (onLog) {
        this.reportLog(session.sessionId, 'info', 'ai', `AI API响应成功，耗时: ${apiDuration}ms`, null, 2);
      }

      const data = await response.json() as any;
      const choice = data.choices[0];
      const message = choice.message;

      if (message.content) {
        console.log(`  [callAI] 收到AI回复，长度: ${message.content.length} 字符`);
        if (onLog) {
          this.reportLog(session.sessionId, 'info', 'ai', `收到AI回复，长度: ${message.content.length} 字符`, {
            contentLength: message.content.length,
          }, 2);
        }
        lastContent = message.content;
        messages.push({
          role: 'assistant',
          content: message.content,
        });
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`  [callAI] AI请求调用 ${message.tool_calls.length} 个工具`);
        if (onLog) {
          this.reportLog(session.sessionId, 'info', 'tool', `AI请求调用 ${message.tool_calls.length} 个工具`, null, 2);
        }
        messages.push(message);

        for (let i = 0; i < message.tool_calls.length; i++) {
          const tc = message.tool_calls[i];
          const functionName = tc.function.name;
          const functionArgs = JSON.parse(tc.function.arguments);

          console.log(`  [callAI] 工具调用 ${i + 1}/${message.tool_calls.length}: ${functionName}`);
          console.log(`  [callAI]   参数: ${JSON.stringify(functionArgs, null, 2).split('\n').join('\n  [callAI]   ')}`);
          if (onLog) {
            this.reportLog(session.sessionId, 'info', 'tool', `开始执行工具: ${functionName}`, {
              toolIndex: i + 1,
              totalTools: message.tool_calls.length,
              parameters: functionArgs,
            }, 3);
          }

          let functionResult: any;

          console.log(`  [callAI] 执行工具: ${functionName}...`);
          const toolStartTime = Date.now();

          if (functionName === 'save_course_html') {
            console.log(`  [callAI]   保存HTML内容，长度: ${functionArgs.html_content?.length || 0} 字符`);
            currentHtml = functionArgs.html_content;
            functionResult = {
              success: true,
              message: 'HTML内容已保存',
              content_length: functionArgs.html_content.length,
            };
          } else if (functionName === 'search_educational_content') {
            // 自动补充grade_level和subject参数
            const enhancedArgs = {
              ...functionArgs,
              grade_level: functionArgs.grade_level ?? session.courseInfo.gradeLevel,
              subject: functionArgs.subject ?? session.courseInfo.subject,
            };
            console.log(`  [callAI]   增强参数: grade_level=${enhancedArgs.grade_level}, subject=${enhancedArgs.subject}`);
            const toolCallObj: { id: string; name: string; arguments: Record<string, any> } = {
              id: tc.id,
              name: functionName,
              arguments: enhancedArgs,
            };
            const searchResult = await toolManager.executeTool(toolCallObj);
            functionResult = searchResult;
          } else if (functionName === 'generate_svg_diagram') {
            console.log(`  [callAI]   生成SVG图表: ${functionArgs.description}`);
            const toolCallObj2: { id: string; name: string; arguments: Record<string, any> } = {
              id: tc.id,
              name: functionName,
              arguments: functionArgs,
            };
            const svgResult = await toolManager.executeTool(toolCallObj2);
            functionResult = svgResult;
          } else {
            console.warn(`  [callAI]   未知工具: ${functionName}`);
            functionResult = { error: '未知工具' };
          }

          const toolDuration = Date.now() - toolStartTime;
          console.log(`  [callAI] 工具执行完成，耗时: ${toolDuration}ms`);
          console.log(`  [callAI]   结果: ${JSON.stringify(functionResult).substring(0, 200)}${JSON.stringify(functionResult).length > 200 ? '...' : ''}`);
          if (onLog) {
            this.reportLog(session.sessionId, 'info', 'tool', `工具执行完成: ${functionName}`, {
              duration: toolDuration,
              result: functionResult,
            }, 3);
          }

          toolCalls.push({
            tool: functionName,
            input: functionArgs,
            output: functionResult,
            timestamp: new Date(),
          });

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(functionResult),
          });
        }
      } else {
        console.log('  [callAI] 没有工具调用，结束迭代');
        break;
      }
    }

    if (!currentHtml) {
      console.log('  [callAI] 未保存HTML，尝试从内容中提取...');
      currentHtml = this.extractHtmlFromContent(lastContent);
      if (currentHtml) {
        console.log(`  [callAI] 成功提取HTML，长度: ${currentHtml.length} 字符`);
      } else {
        console.warn('  [callAI] 未能提取到HTML');
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`  [callAI] AI调用流程结束，总耗时: ${totalDuration}ms`);
    if (onLog) {
      this.reportLog(session.sessionId, 'info', 'ai', `AI调用流程结束，总耗时: ${totalDuration}ms`, {
        toolCallsCount: toolCalls.length,
        htmlLength: currentHtml.length,
      }, 1);
    }

    return {
      content: lastContent,
      html: currentHtml,
      toolCalls,
      processingTime: totalDuration,
    };
  }

  private extractHtmlFromContent(content: string): string {
    const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/);
    if (htmlMatch) {
      return htmlMatch[1];
    }
    return '';
  }

  private async createAdjustmentRecord(
    session: AdjustmentSession,
    userRequest: string,
    aiResponse: string,
    newHtml: string
  ): Promise<AdjustmentRecord> {
    const changes = this.detectChanges(session.currentHtml, newHtml);

    return {
      id: generateId(),
      timestamp: new Date(),
      userRequest,
      aiResponse,
      htmlBefore: session.currentHtml,
      htmlAfter: newHtml,
      changes,
      approved: false,
    };
  }

  private detectChanges(oldHtml: string, newHtml: string): HtmlChange[] {
    const changes: HtmlChange[] = [];

    const oldSectionMatches = oldHtml.match(/<section[^>]*id=["']([^"']+)["'][^>]*>/g) || [];
    const newSectionMatches = newHtml.match(/<section[^>]*id=["']([^"']+)["'][^>]*>/g) || [];

    const oldSections = new Set(oldSectionMatches.map(m => m.match(/id=["']([^"']+)["']/)?.[1]).filter(Boolean));
    const newSections = new Set(newSectionMatches.map(m => m.match(/id=["']([^"']+)["']/)?.[1]).filter(Boolean));

    for (const section of newSections) {
      if (!oldSections.has(section)) {
        changes.push({
          type: 'add',
          section: section as string,
          description: `新增区块: ${section}`,
        });
      }
    }

    for (const section of oldSections) {
      if (!newSections.has(section)) {
        changes.push({
          type: 'delete',
          section: section as string,
          description: `删除区块: ${section}`,
        });
      }
    }

    if (oldHtml !== newHtml && changes.length === 0) {
      changes.push({
        type: 'modify',
        description: '内容已修改',
      });
    }

    return changes;
  }

  /**
   * 获取会话
   */
  async getSession(sessionId: string): Promise<AdjustmentSession | null> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (fs.existsSync(sessionPath)) {
      try {
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const session = JSON.parse(data);
        this.sessions.set(sessionId, session);
        return session;
      } catch (error) {
        console.error(`[CourseAdjustmentService] 加载会话 ${sessionId} 失败:`, error);
        return null;
      }
    }

    return null;
  }

  /**
   * 保存会话
   */
  private async saveSession(session: AdjustmentSession): Promise<void> {
    const sessionPath = path.join(this.sessionsDir, `${session.sessionId}.json`);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    this.sessions.set(session.sessionId, session);
  }

  /**
   * 回滚到指定调整
   */
  async rollback(sessionId: string, adjustmentId: string): Promise<RollbackResponse> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      const adjustmentIndex = session.adjustmentHistory.findIndex(a => a.id === adjustmentId);
      if (adjustmentIndex === -1) {
        throw new Error(`调整记录不存在: ${adjustmentId}`);
      }

      const targetAdjustment = session.adjustmentHistory[adjustmentIndex];
      session.currentHtml = targetAdjustment.htmlBefore;
      session.adjustmentHistory = session.adjustmentHistory.slice(0, adjustmentIndex);
      session.updatedAt = new Date();

      await this.saveSession(session);

      return {
        success: true,
        html: session.currentHtml,
        message: `已回滚到调整前的状态`,
      };
    } catch (error: any) {
      return {
        success: false,
        html: '',
        message: '',
        error: error.message,
      };
    }
  }

  /**
   * 验证调整结果
   */
  async validateHtml(html: string): Promise<ValidateAdjustmentResponse> {
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    if (!html.includes('<!DOCTYPE html>')) {
      issues.push({
        severity: 'warning',
        category: 'structure',
        message: '缺少DOCTYPE声明',
      });
    }

    if (!html.includes('<title>') || !html.includes('</title>')) {
      issues.push({
        severity: 'warning',
        category: 'structure',
        message: '缺少标题标签',
      });
    }

    const openTags = html.match(/<([a-z]+)[^>]*>/gi) || [];
    const closeTags = html.match(/<\/([a-z]+)>/gi) || [];
    
    const openCount: Record<string, number> = {};
    const closeCount: Record<string, number> = {};
    
    for (const tag of openTags) {
      const tagName = tag.match(/<([a-z]+)/i)?.[1]?.toLowerCase();
      if (tagName && !['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName)) {
        openCount[tagName] = (openCount[tagName] || 0) + 1;
      }
    }
    
    for (const tag of closeTags) {
      const tagName = tag.match(/<\/([a-z]+)/i)?.[1]?.toLowerCase();
      if (tagName) {
        closeCount[tagName] = (closeCount[tagName] || 0) + 1;
      }
    }
    
    for (const tag in openCount) {
      if (openCount[tag] !== closeCount[tag]) {
        issues.push({
          severity: 'error',
          category: 'structure',
          message: `标签 <${tag}> 未正确闭合`,
        });
      }
    }

    if (!html.includes('互动') && !html.includes('练习') && !html.includes('活动')) {
      suggestions.push('建议添加互动练习环节以提高学生参与度');
    }

    if (!html.includes('总结') && !html.includes('小结')) {
      suggestions.push('建议添加课程总结部分');
    }

    if (!html.includes('alt=')) {
      issues.push({
        severity: 'warning',
        category: 'accessibility',
        message: '图片缺少alt属性',
      });
    }

    return {
      success: true,
      isValid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * 保存最终课件
   */
  async saveFinalCourse(sessionId: string): Promise<{ success: boolean; filePath: string; error?: string }> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      const timestamp = Date.now();
      const fileName = `adjusted_${session.courseId}_${timestamp}.html`;
      const filePath = path.join(this.coursesDir, fileName);

      fs.writeFileSync(filePath, session.currentHtml, 'utf-8');

      session.status = 'completed';
      await this.saveSession(session);

      return {
        success: true,
        filePath,
      };
    } catch (error: any) {
      return {
        success: false,
        filePath: '',
        error: error.message,
      };
    }
  }
}
