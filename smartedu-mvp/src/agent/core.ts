import { chat } from '../ai/client';
import { toolRegistry } from '../tools/registry';
import { executeTools } from '../tools/executor';
import { Message } from '../ai/types';
import { ToolResult, ToolDefinition } from '../tools/types';
import { config } from '../config';
import { logger } from '../utils/logger';

const agentLog = logger;

// --- Progress ---
export interface AgentProgress {
  iteration: number;
  stage: 'thinking' | 'streaming' | 'tool_call' | 'tool_result' | 'complete' | 'error';
  message: string;
  toolCalls?: { toolName: string; args: Record<string, any> }[];
  toolResults?: ToolResult[];
  /** 发送给 AI 的提示内容摘要 */
  ai_input?: string;
  /** AI 返回的文本内容 */
  ai_output?: string;
}

export type AgentProgressCallback = (progress: AgentProgress) => void;

// --- Result ---
export interface AgentResult {
  success: boolean;
  messages: Message[];
  finalContent: string;
  iterations: number;
  toolResults: ToolResult[];
  error?: string;
}

// --- Config ---
export interface AgentConfig {
  systemPrompt: string;
  tools?: ToolDefinition[];
  maxIterations?: number;
  exitKeywords?: string[];
  onProgress?: AgentProgressCallback;
}

const DEFAULT_EXIT_KEYWORDS = ['[课件完成]', '[DONE]', '[FINISH]', '[任务完成]', '[完成]'];
const MAX_TOOL_RESULT_CHARS = 800;
const COMPRESS_THRESHOLD = 8;

function checkExit(content: string, keywords: string[]): boolean {
  const upper = content.toUpperCase();
  return keywords.some(kw => upper.includes(kw.toUpperCase()));
}

/** 生成发送给 AI 的提示预览文本 */
function buildPromptPreview(messages: Message[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      parts.push(`【系统提示】\n${msg.content}`);
    } else if (msg.role === 'user') {
      parts.push(`【用户】\n${msg.content}`);
    } else if (msg.role === 'assistant') {
      const text = msg.content || '';
      const tools = msg.toolCalls?.map(tc => `调用 ${tc.name}`).join(', ') || '';
      parts.push(`【AI】${text ? '\n' + text : ''}${tools ? '\n工具: ' + tools : ''}`);
    } else if (msg.role === 'tool') {
      parts.push(`【工具结果】${msg.content.substring(0, 200)}`);
    }
  }
  return parts.join('\n\n---\n\n');
}

/** 压缩消息历史 */
function compressMessages(messages: Message[], threshold: number): Message[] {
  if (messages.length <= threshold) return messages;

  const system = messages[0];
  const user = messages[1];
  const keep = 4;
  const tail = messages.slice(-keep);
  const middle = messages.slice(2, -keep);
  const toolCount = middle.filter(m => m.role === 'tool').length;
  const assistantCount = middle.filter(m => m.role === 'assistant').length;

  const summary: Message = {
    role: 'user',
    content: `[上下文摘要] 已执行 ${assistantCount} 轮交互，${toolCount} 次工具调用，均已完成。`,
  };

  agentLog.info(`历史压缩: ${messages.length} → ${3 + tail.length} 条消息`);
  return [system, user, summary, ...tail];
}

/**
 * 核心 Agent 循环：think → call AI → execute tools → repeat
 */
export async function runAgentLoop(
  userMessage: string,
  agentConfig: AgentConfig
): Promise<AgentResult> {
  const {
    systemPrompt,
    tools,
    maxIterations = 15,
    exitKeywords = DEFAULT_EXIT_KEYWORDS,
    onProgress,
  } = agentConfig;

  const allTools = tools || toolRegistry.getAll();
  agentLog.info(`=== Agent 启动 === 工具数: ${allTools.length}, 最大轮次: ${maxIterations}`);

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let finalContent = '';
  const allToolResults: ToolResult[] = [];
  const failCounts = new Map<string, number>(); // 工具连续失败计数

  for (let i = 0; i < maxIterations; i++) {
    agentLog.info(`--- 第 ${i + 1}/${maxIterations} 轮 ---`);

    try {
      // 压缩历史
      if (messages.length > COMPRESS_THRESHOLD) {
        const compressed = compressMessages([...messages], COMPRESS_THRESHOLD);
        messages.length = 0;
        messages.push(...compressed);
      }

      // 发送思考事件（含提示词预览）
      const promptPreview = buildPromptPreview(messages);
      onProgress?.({
        iteration: i + 1,
        stage: 'thinking',
        message: `第 ${i + 1} 轮：正在思考...`,
        ai_input: promptPreview,
      });
      agentLog.debug(`第 ${i + 1} 轮 AI 输入 (${messages.length} 条消息):\n${truncate(promptPreview, 2000)}`);

      // 调用 AI（流式 token 回调）
      const response = await chat(messages, allTools, {
        onToken: (text) => {
          onProgress?.({
            iteration: i + 1,
            stage: 'streaming',
            message: text,
          });
        },
      });

      // 发送 AI 输出事件
      const aiOutputText = response.content || '(无文本，发起工具调用)';
      onProgress?.({
        iteration: i + 1,
        stage: 'thinking',
        message: `AI 已响应`,
        ai_output: aiOutputText,
      });
      agentLog.debug(`第 ${i + 1} 轮 AI 输出:\n${truncate(aiOutputText, 2000)}`);
      if (response.toolCalls.length > 0) {
        agentLog.debug(`第 ${i + 1} 轮工具调用:\n${response.toolCalls.map((tc, j) => `  [${j}] ${tc.name}(${truncate(JSON.stringify(tc.arguments), 500)})`).join('\n')}`);
      }

      // 更新消息历史
      if (response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          })),
        });
      } else {
        messages.push({ role: 'assistant', content: response.content });
      }

      finalContent = response.content;

      // 检查退出条件
      if (checkExit(response.content, exitKeywords)) {
        agentLog.info(`命中退出关键词，任务完成。共 ${i + 1} 轮, ${allToolResults.length} 个工具调用`);
        onProgress?.({ iteration: i + 1, stage: 'complete', message: '任务完成' });
        return { success: true, messages, finalContent, iterations: i + 1, toolResults: allToolResults };
      }

      // 无工具调用
      if (response.toolCalls.length === 0) {
        agentLog.info(`AI 无工具调用，响应完成`);
        onProgress?.({ iteration: i + 1, stage: 'complete', message: 'AI 响应完成' });
        return { success: true, messages, finalContent, iterations: i + 1, toolResults: allToolResults };
      }

      // 执行工具
      const toolNames = response.toolCalls.map(tc => tc.name).join(', ');
      agentLog.info(`调用工具: [${toolNames}]`);
      onProgress?.({
        iteration: i + 1,
        stage: 'tool_call',
        message: `执行 ${response.toolCalls.length} 个工具`,
        toolCalls: response.toolCalls.map(tc => ({ toolName: tc.name, args: tc.arguments })),
      });

      const results = await executeTools(
        response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
        { workDir: config.paths.courses }
      );

      allToolResults.push(...results);

      const successCount = results.filter(r => r.success).length;
      agentLog.info(`工具结果: ${successCount}/${results.length} 成功`);

      // 检测同一工具连续失败（防止死循环）
      for (const r of results) {
        if (!r.success) {
          const count = (failCounts.get(r.toolName) || 0) + 1;
          failCounts.set(r.toolName, count);
          if (count >= 3) {
            agentLog.warn(`工具 ${r.toolName} 连续失败 ${count} 次，提前退出循环`);
            onProgress?.({ iteration: i + 1, stage: 'complete', message: `工具 ${r.toolName} 反复失败，结束生成` });
            return { success: allToolResults.some(r2 => r2.success), messages, finalContent, iterations: i + 1, toolResults: allToolResults };
          }
        } else {
          failCounts.delete(r.toolName);
        }
      }

      // 截断过长的工具结果
      for (const r of results) {
        let content: string;
        if (!r.success) {
          content = `错误: ${r.error}`;
        } else {
          const raw = JSON.stringify(r.result);
          if (raw.length > MAX_TOOL_RESULT_CHARS) {
            content = raw.substring(0, MAX_TOOL_RESULT_CHARS) + `...[已截断，原始${raw.length}字符]`;
          } else {
            content = raw;
          }
        }
        messages.push({ role: 'tool', content, toolCallId: r.toolCallId });
      }

      onProgress?.({
        iteration: i + 1,
        stage: 'tool_result',
        message: `${successCount}/${results.length} 成功`,
        toolResults: results,
      });

    } catch (error: any) {
      agentLog.error(`第 ${i + 1} 轮异常: ${error.message}`);
      onProgress?.({ iteration: i + 1, stage: 'error', message: error.message });
      return {
        success: false,
        messages,
        finalContent,
        iterations: i + 1,
        toolResults: allToolResults,
        error: error.message,
      };
    }
  }

  agentLog.warn(`达到最大迭代次数 (${maxIterations})`);
  return {
    success: allToolResults.some(r => r.success),
    messages,
    finalContent,
    iterations: maxIterations,
    toolResults: allToolResults,
    error: `达到最大迭代次数 (${maxIterations})`,
  };
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + `...[${str.length}字符]` : str;
}
