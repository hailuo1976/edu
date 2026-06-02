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
import { contextManager } from './contextManager';
import { runAgentLoop, AgentProgress } from '../agent/core';
import { toolRegistry } from '../tools/registry';
import { createAdjustmentTools } from '../tools/definitions/adjustmentTools';

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
    
    // 初始化文件结构（如果课件较大，建议拆分）
    const shouldSplit = html.length > 3000;
    const files: any[] = [];
    
    if (shouldSplit) {
      // 创建主文件
      const mainFile = {
        id: 'main_001',
        name: 'index.html',
        type: 'main',
        html: html,
        description: '主课件文件',
        order: 0,
        size: html.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      files.push(mainFile);
      
      console.log(`[CourseAdjustmentService] 课件较大 (${html.length}字符)，建议拆分为多个文件`);
    } else {
      // 小课件，使用单文件模式
      const singleFile = {
        id: 'single_001',
        name: 'course.html',
        type: 'main',
        html: html,
        description: '课件文件',
        order: 0,
        size: html.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      files.push(singleFile);
    }
    
    const session: AdjustmentSession = {
      sessionId: generateId(),
      courseId,
      courseInfo,
      originalHtml: html,
      currentHtml: html,
      files: files,
      activeFileId: files[0].id,
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
   * 处理调整请求 — 使用统一 Agent 循环
   */
  async processAdjustment(
    request: AdjustmentRequest,
    onProgress?: (progress: AdjustmentProgress) => void,
    onLog?: (log: LogMessage) => void
  ): Promise<AdjustmentResponse> {
    try {
      // 1. 获取或创建 session
      let session: AdjustmentSession | null = null;
      if (request.sessionId) {
        session = await this.getSession(request.sessionId);
        if (!session) {
          throw new Error(`会话不存在: ${request.sessionId}`);
        }
      } else {
        session = await this.createSession(request.courseId);
      }

      if (!session) {
        throw new Error('无法创建或获取会话');
      }

      // 2. 注册回调
      if (onProgress) {
        this.progressCallbacks.set(session.sessionId, onProgress);
      }
      if (onLog) {
        this.logCallbacks.set(session.sessionId, onLog);
      }

      this.reportProgress(session.sessionId, 'analyzing', '正在分析您的修改请求...', 10);

      // 3. 添加用户消息到历史
      const userMessage: ConversationMessage = {
        id: generateId(),
        role: 'user',
        content: request.userRequest,
        timestamp: new Date(),
      };
      session.conversationHistory.push(userMessage);

      this.reportProgress(session.sessionId, 'planning', '正在规划修改方案...', 30);

      // 4. 构建调整专用工具（闭包捕获 session）
      const { tools: adjustmentTools, getCapturedHtml } = createAdjustmentTools(
        session,
        (files) => this.mergeFilesToHtml(files),
        { onProgress, onLog },
      );

      // 通用工具（search 带参数增强）
      const searchTool = toolRegistry.get('search_educational_content');
      const svgTool = toolRegistry.get('generate_svg_diagram');
      const allTools = [
        ...adjustmentTools,
        ...(searchTool ? [searchTool] : []),
        ...(svgTool ? [svgTool] : []),
      ];

      // 5. 构建 systemPrompt（含当前 HTML 和上下文）
      const systemPrompt = this.buildSystemPrompt(session);

      // 6. 构建用户消息（含对话历史摘要）
      const userPrompt = this.buildUserPrompt(session, request.userRequest);

      // 7. 调用 runAgentLoop
      this.reportProgress(session.sessionId, 'executing', '正在执行修改...', 50);

      const agentResult = await runAgentLoop(userPrompt, {
        systemPrompt,
        tools: allTools,
        maxIterations: 10,
        exitKeywords: ['[调整完成]', '[课件完成]', '[DONE]', '[FINISH]', '[任务完成]', '[完成]'],
        onProgress: (progress: AgentProgress) => {
          this.reportProgress(
            session!.sessionId,
            'executing',
            `第 ${progress.iteration} 轮：${progress.stage === 'tool_call' ? '执行工具' : progress.stage === 'thinking' ? '正在思考' : '处理中'}`,
            Math.min(50 + progress.iteration * 5, 90),
          );
        },
      });

      // 8. 获取结果 HTML
      let html = getCapturedHtml();
      if (!html && agentResult.finalContent) {
        const htmlMatch = agentResult.finalContent.match(/```html\n([\s\S]*?)\n```/);
        if (htmlMatch) {
          html = htmlMatch[1];
        }
      }

      this.reportProgress(session.sessionId, 'validating', '正在验证修改结果...', 80);

      // 9. 创建调整记录，更新 session
      const adjustmentRecord = await this.createAdjustmentRecord(
        session,
        request.userRequest,
        agentResult.finalContent,
        html,
      );

      session.adjustmentHistory.push(adjustmentRecord);
      if (html) {
        session.currentHtml = html;
      }
      session.updatedAt = new Date();

      const assistantMessage: ConversationMessage = {
        id: generateId(),
        role: 'assistant',
        content: agentResult.finalContent,
        timestamp: new Date(),
        metadata: {
          processingTime: Date.now(),
        },
      };
      session.conversationHistory.push(assistantMessage);

      await this.saveSession(session);
      this.reportProgress(session.sessionId, 'complete', '修改完成!', 100);

      return {
        success: true,
        sessionId: session.sessionId,
        message: agentResult.finalContent,
        html: html,
        conversationHistory: session.conversationHistory,
        adjustmentRecord,
      };
    } catch (error: any) {
      console.error('[CourseAdjustmentService] 处理调整请求失败:', error);
      return {
        success: false,
        sessionId: request.sessionId || '',
        error: error.message,
      };
    }
  }

  /**
   * 构建用户消息（含对话历史摘要）
   */
  private buildUserPrompt(session: AdjustmentSession, currentUserRequest: string): string {
    const parts: string[] = [];

    // 对话历史摘要
    if (session.conversationHistory.length > 1) {
      const recentHistory = session.conversationHistory.slice(-6, -1);
      if (recentHistory.length > 0) {
        parts.push('## 对话历史');
        for (const msg of recentHistory) {
          const role = msg.role === 'user' ? '用户' : '助手';
          parts.push(`**${role}**: ${msg.content.substring(0, 200)}`);
        }
      }
    }

    // 当前请求
    parts.push(`## 当前请求\n${currentUserRequest}`);

    return parts.join('\n\n');
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
    const fileCount = session.files?.length || 0;
    const activeFile = session.files?.find(f => f.id === session.activeFileId);
    const htmlPreview = session.currentHtml
      ? (session.currentHtml.length > 3000
        ? session.currentHtml.substring(0, 3000) + '\n... [已截断，共 ' + session.currentHtml.length + ' 字符]'
        : session.currentHtml)
      : '(无HTML内容)';

    const fileListInfo = session.files?.length
      ? session.files.map(f => `- ${f.name} (${f.type}, ${f.size}字符, ID: ${f.id})`).join('\n')
      : '(无文件)';

    return `你是一个专业的课件调整助手。你的任务是帮助教师修改和完善HTML课件。

## 当前课件信息
- 主题: ${session.courseInfo.topic}
- 学科: ${session.courseInfo.subject}
- 年级: ${session.courseInfo.gradeLevel}
- 文件数量: ${fileCount}
${activeFile ? `- 当前操作文件: ${activeFile.name} (${activeFile.description || '无描述'})` : ''}

## 当前HTML内容
\`\`\`html
${htmlPreview}
\`\`\`

## 文件列表
${fileListInfo}

## 你的能力
1. 修改课件内容（文字、图片、公式等）
2. 调整课件结构和布局
3. 添加新的教学元素（互动练习、示例等）
4. 优化教学设计和呈现方式
5. 修复HTML结构和样式问题
6. 智能拆分大课件为多个文件

## 工作流程
1. 理解用户的修改需求
2. 分析当前HTML结构
3. 针对特定文件进行修改
4. 使用 save_course_html 保存修改后的完整HTML，或使用 save_file 保存单个文件
5. 向用户说明修改内容

## 重要规则
- 保持课件的教学完整性
- 确保HTML结构正确
- 保留原有的教学重点
- 修改后必须使用 save_course_html 或 save_file 工具保存
- 每次只修改必要的部分，减少token消耗
- 用中文回复用户
- 完成修改后输出 [调整完成] 标记

## 可用工具
- save_course_html: 保存修改后的完整HTML课件内容（推荐）
- save_file: 保存或更新单个文件内容（多文件场景）
- split_file: 将大文件拆分为多个文件
- merge_files: 合并多个文件为一个
- list_session_files: 列出当前课件的所有文件
- search_educational_content: 搜索教育内容
- generate_svg_diagram: 生成SVG图形`;
  }




  /**
   * 将多个文件合并为完整的HTML
   */
  private mergeFilesToHtml(files: any[]): string {
    if (!files || files.length === 0) {
      return '';
    }

    // 按order排序
    const sortedFiles = [...files].sort((a, b) => a.order - b.order);

    // 如果只有一个主文件，直接返回
    if (sortedFiles.length === 1 && sortedFiles[0].type === 'main') {
      return sortedFiles[0].html;
    }

    // 合并多个文件
    let html = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>课件</title>\n';
    
    // 添加样式文件
    const styleFiles = sortedFiles.filter(f => f.type === 'style');
    styleFiles.forEach(file => {
      html += `  <!-- 样式文件: ${file.name} -->\n  <style>\n${file.html}\n  </style>\n`;
    });
    
    html += '</head>\n<body>\n';
    
    // 添加主文件内容（去除html/head/body标签）
    const mainFile = sortedFiles.find(f => f.type === 'main');
    if (mainFile) {
      const mainContent = mainFile.html
        .replace(/<!DOCTYPE html>/i, '')
        .replace(/<html[^>]*>/i, '')
        .replace(/<\/html>/i, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/i, '')
        .replace(/<body[^>]*>/i, '')
        .replace(/<\/body>/i, '')
        .trim();
      html += `  <!-- 主文件: ${mainFile.name} -->\n${mainContent}\n`;
    }
    
    // 添加章节文件
    const sectionFiles = sortedFiles.filter(f => f.type === 'section');
    sectionFiles.forEach(file => {
      html += `  <!-- 章节文件: ${file.name} -->\n${file.html}\n`;
    });
    
    html += '\n';
    
    // 添加脚本文件
    const scriptFiles = sortedFiles.filter(f => f.type === 'script');
    scriptFiles.forEach(file => {
      html += `  <!-- 脚本文件: ${file.name} -->\n  <script>\n${file.html}\n  </script>\n`;
    });
    
    html += '</body>\n</html>';
    
    return html;
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
