/**
 * 上下文管理服务
 * 负责智能管理AI对话上下文，避免信息冗余和token浪费
 */

import { ConversationMessage, ContextManagementConfig, HtmlChange, CourseFile } from '../types/adjustment';

/**
 * 默认上下文管理配置
 */
const DEFAULT_CONFIG: ContextManagementConfig = {
  maxMessages: 20,           // 最多保留20条消息
  maxTokens: 8000,           // 最大8000 tokens
  summaryThreshold: 10,      // 超过10条消息时触发摘要
  keepRecentMessages: 4,     // 始终保留最近4条消息
};

/**
 * 估计文本的token数（粗略估计：1 token ≈ 4个字符）
 */
function estimateTokens(text: string | number): number {
  const str = typeof text === 'number' ? text.toString() : text;
  return Math.ceil(str.length / 4);
}

/**
 * 提取HTML的关键结构信息
 */
function extractHtmlStructure(html: string): string {
  const sections: string[] = [];
  
  // 提取标题
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    sections.push(`标题: ${titleMatch[1]}`);
  }
  
  // 提取主要区块
  const sectionMatches = html.match(/<section[^>]*id=["']([^"']+)["'][^>]*>/gi) || [];
  if (sectionMatches.length > 0) {
    sections.push(`包含 ${sectionMatches.length} 个主要区块:`);
    sectionMatches.slice(0, 5).forEach((match, index) => {
      const idMatch = match.match(/id=["']([^"']+)["']/i);
      if (idMatch) {
        sections.push(`  - ${idMatch[1]}`);
      }
    });
    if (sectionMatches.length > 5) {
      sections.push(`  ... 还有 ${sectionMatches.length - 5} 个区块`);
    }
  }
  
  // 提取关键内容统计
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent.length;
  sections.push(`内容长度: ${wordCount} 字符`);
  
  return sections.join('\n');
}

/**
 * 生成对话历史的智能摘要
 */
function generateConversationSummary(messages: ConversationMessage[]): string {
  const summaries: string[] = [];
  
  // 提取用户的主要请求
  const userRequests = messages
    .filter(m => m.role === 'user' && !m.metadata?.isSummary)
    .map(m => m.content);
  
  if (userRequests.length > 0) {
    summaries.push('## 用户的主要修改请求');
    userRequests.slice(-3).forEach((req, index) => {
      const shortReq = req.length > 100 ? req.substring(0, 100) + '...' : req;
      summaries.push(`${index + 1}. ${shortReq}`);
    });
  }
  
  // 提取AI的主要操作
  const aiActions = messages
    .filter(m => m.role === 'assistant' && m.metadata?.toolCalls && m.metadata.toolCalls.length > 0)
    .flatMap(m => m.metadata?.toolCalls || []);
  
  if (aiActions.length > 0) {
    summaries.push('\n## 已执行的操作');
    const toolCounts: Record<string, number> = {};
    aiActions.forEach(action => {
      toolCounts[action.tool] = (toolCounts[action.tool] || 0) + 1;
    });
    Object.entries(toolCounts).forEach(([tool, count]) => {
      summaries.push(`- ${tool}: ${count}次`);
    });
  }
  
  return summaries.join('\n');
}

/**
 * 压缩HTML内容，保留关键信息
 */
function compressHtml(html: string): string {
  // 提取关键部分，移除冗余的样式和脚本
  let compressed = html;
  
  // 保留基本的HTML结构
  const structure = extractHtmlStructure(html);
  
  // 如果HTML太长，只保留结构信息
  if (html.length > 5000) {
    return `<!-- 课件结构摘要 -->\n${structure}\n\n<!-- 完整内容已压缩，当前为最新版本 -->`;
  }
  
  return html;
}

export class ContextManager {
  private config: ContextManagementConfig;

  constructor(config?: Partial<ContextManagementConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 优化消息列表，减少冗余
   * 支持多文件管理，每次只针对特定文件
   */
  optimizeMessages(
    messages: ConversationMessage[],
    currentHtml: string,
    files?: CourseFile[],
    activeFileId?: string
  ): { role: string; content: string }[] {
    console.log(`[ContextManager] 开始优化消息，原始消息数: ${messages.length}, 文件数: ${files?.length || 0}, 活动文件: ${activeFileId || '无'}`);

    // 如果有文件管理，使用文件级别的优化
    if (files && files.length > 0) {
      return this.optimizeMessagesWithFiles(messages, files, activeFileId);
    }

    // 否则使用原有的优化逻辑
    if (messages.length <= this.config.summaryThreshold) {
      return this.compressMessages(messages, currentHtml);
    }

    return this.summarizeAndCompress(messages, currentHtml);
  }

  /**
   * 支持多文件的消息优化
   */
  private optimizeMessagesWithFiles(
    messages: ConversationMessage[],
    files: CourseFile[],
    activeFileId?: string
  ): { role: string; content: string }[] {
    const optimized: { role: string; content: string }[] = [];
    const activeFile = files.find(f => f.id === activeFileId);

    // 添加文件信息到系统提示
    if (activeFile) {
      optimized.push({
        role: 'system',
        content: `当前正在操作的文件: ${activeFile.name}\n文件类型: ${activeFile.type}\n文件描述: ${activeFile.description || '无'}\n文件大小: ${activeFile.size} 字符\n\n请针对此文件进行修改，其他文件保持不变。`
      });
    }

    // 添加当前文件内容
    if (activeFile) {
      optimized.push({
        role: 'system',
        content: `当前文件内容：\n\`\`\`html\n${activeFile.html}\n\`\`\``
      });
    }

    // 添加文件列表信息
    const fileListInfo = files
      .filter(f => f.id !== activeFileId)
      .map(f => `- ${f.name} (${f.type}): ${f.description || '无描述'}, ${f.size}字符`)
      .join('\n');
    
    if (fileListInfo) {
      optimized.push({
        role: 'system',
        content: `其他文件列表（保持不变）：\n${fileListInfo}`
      });
    }

    // 添加最近的对话历史（压缩HTML）
    const recentMessages = messages.slice(-this.config.keepRecentMessages);
    recentMessages.forEach(msg => {
      let content = msg.content;
      // 移除HTML代码块，因为已经单独提供
      content = content.replace(/```html[\s\S]*?```/g, '[课件内容见上文]');
      optimized.push({ role: msg.role, content });
    });

    console.log(`[ContextManager] 多文件优化完成，消息数: ${messages.length} -> ${optimized.length}`);
    return optimized;
  }

  /**
   * 压缩消息中的HTML内容
   */
  private compressMessages(
    messages: ConversationMessage[],
    currentHtml: string
  ): { role: string; content: string }[] {
    const optimized: { role: string; content: string }[] = [];
    let htmlIncluded = false;

    // 逆序遍历，找到最新的HTML内容
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      let content = msg.content;

      // 压缩HTML代码块
      if (content.includes('```html')) {
        if (!htmlIncluded) {
          // 第一条包含HTML的消息，使用当前HTML（最新版本）
          content = `当前课件HTML内容：\n\`\`\`html\n${currentHtml}\n\`\`\``;
          htmlIncluded = true;
        } else {
          // 后续包含HTML的消息，替换为引用
          content = content.replace(
            /```html[\s\S]*?```/g,
            '[课件内容同上，已更新至最新版本]'
          );
        }
      }

      optimized.unshift({ role: msg.role, content });
    }

    // 如果没有包含HTML，在第一条用户消息后添加
    if (!htmlIncluded && optimized.length > 0) {
      const firstUserIndex = optimized.findIndex(m => m.role === 'user');
      if (firstUserIndex >= 0) {
        optimized.splice(firstUserIndex + 1, 0, {
          role: 'system',
          content: `当前课件HTML内容：\n\`\`\`html\n${currentHtml}\n\`\`\``
        });
      }
    }

    return optimized;
  }

  /**
   * 摘要并压缩消息
   */
  private summarizeAndCompress(
    messages: ConversationMessage[],
    currentHtml: string
  ): { role: string; content: string }[] {
    const optimized: { role: string; content: string }[] = [];

    // 1. 保留系统消息（如果有）
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      optimized.push({
        role: 'system',
        content: systemMessages[0].content
      });
    }

    // 2. 生成历史摘要
    const olderMessages = messages.slice(0, -this.config.keepRecentMessages);
    const recentMessages = messages.slice(-this.config.keepRecentMessages);

    if (olderMessages.length > 0) {
      const summary = generateConversationSummary(olderMessages);
      optimized.push({
        role: 'system',
        content: `## 历史对话摘要\n${summary}\n\n以上修改已完成并体现在当前课件中。`
      });
    }

    // 3. 添加当前HTML状态
    optimized.push({
      role: 'system',
      content: `当前课件HTML内容（最新版本）：\n\`\`\`html\n${currentHtml}\n\`\`\``
    });

    // 4. 添加最近的消息（压缩HTML）
    recentMessages.forEach(msg => {
      let content = msg.content;
      // 移除HTML代码块，因为已经单独提供
      content = content.replace(/```html[\s\S]*?```/g, '[课件内容见上文]');
      optimized.push({ role: msg.role, content });
    });

    console.log(`[ContextManager] 优化完成，消息数: ${messages.length} -> ${optimized.length}`);
    return optimized;
  }

  /**
   * 计算消息列表的估计token数
   */
  estimateMessageTokens(messages: { role: string; content: string }[]): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return estimateTokens(totalChars);
  }

  /**
   * 检查是否需要清理上下文
   */
  shouldOptimize(messages: ConversationMessage[]): boolean {
    if (messages.length > this.config.maxMessages) {
      return true;
    }

    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedTokens = estimateTokens(totalChars);

    return estimatedTokens > this.config.maxTokens;
  }

  /**
   * 生成调整记录的摘要
   */
  generateAdjustmentSummary(changes: HtmlChange[]): string {
    if (changes.length === 0) {
      return '无结构性变更';
    }

    const summaries: string[] = [];
    const adds = changes.filter(c => c.type === 'add');
    const modifies = changes.filter(c => c.type === 'modify');
    const deletes = changes.filter(c => c.type === 'delete');

    if (adds.length > 0) {
      summaries.push(`新增 ${adds.length} 个区块`);
    }
    if (modifies.length > 0) {
      summaries.push(`修改 ${modifies.length} 个区块`);
    }
    if (deletes.length > 0) {
      summaries.push(`删除 ${deletes.length} 个区块`);
    }

    return summaries.join('，');
  }
}

// 导出单例实例
export const contextManager = new ContextManager();
