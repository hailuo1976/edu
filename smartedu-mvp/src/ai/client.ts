import axios from 'axios';
import { Readable } from 'stream';
import { config } from '../config';
import { Message, AIResponse, ParsedToolCall } from './types';
import { ToolDefinition, toOpenAITools } from '../tools/types';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

/**
 * 统一 AI Client（流式版本）
 * 底层使用 OpenAI 兼容接口，stream: true 避免 504 网关超时。
 */

/** 构建 OpenAI 格式的 messages 数组 */
function buildOpenAIMessages(messages: Message[]): any[] {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content });
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    }
  }

  return result;
}

/** 解析工具调用（兼容流式 {id,name,arguments} 和非流式 {id,function:{name,arguments}}） */
function parseToolCalls(rawToolCalls: any[]): ParsedToolCall[] {
  if (!rawToolCalls || rawToolCalls.length === 0) return [];

  return rawToolCalls.map(tc => {
    const name = tc.name || tc.function?.name || '';
    const argsRaw = tc.arguments ?? tc.function?.arguments ?? '{}';
    let parsedArgs: Record<string, any>;
    try {
      parsedArgs = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : (argsRaw || {});
    } catch {
      parsedArgs = {};
    }
    return {
      id: tc.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      arguments: parsedArgs,
    };
  }).filter(tc => tc.name);
}

// --- SSE 流式解析 ---

interface StreamResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  usage?: any;
}

/**
 * 解析 SSE 流，累积完整响应
 * 流式接收数据 → 网关不会因"久无响应"而 504
 */
async function parseStreamResponse(
  stream: Readable,
  timeoutMs: number,
  onToken?: (text: string) => void
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    let content = '';
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: any;
    let buffer = '';
    let rawBody = ''; // 保留原始数据，用于 SSE 解析失败时 JSON fallback
    let firstTokenMs = 0;
    const startMs = Date.now();

    // 流级超时：防止连接挂死
    const timer = setTimeout(() => {
      stream.destroy();
      reject(new Error(`流超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    stream.on('data', (chunk: Buffer) => {
      if (!firstTokenMs) firstTokenMs = Date.now();
      const text = chunk.toString();
      buffer += text;
      rawBody += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        // 兼容 "data: {...}" 和 "data:{...}"
        const payload = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
        if (payload === '[DONE]') continue;

        try {
          const event = JSON.parse(payload);

          // 流内错误
          if (event.error) {
            clearTimeout(timer);
            reject(new Error(event.error.message || JSON.stringify(event.error)));
            return;
          }

          const delta = event.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            onToken?.(delta.content);
          }

          // 累积工具调用片段
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id || `tc_${Date.now()}_${idx}`,
                  name: '',
                  arguments: '',
                });
              }
              const entry = toolCallMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.arguments += tc.function.arguments;
            }
          }

          if (event.usage) usage = event.usage;
        } catch {
          // 部分 JSON 或非标准行，跳过
        }
      }
    });

    stream.on('end', () => {
      clearTimeout(timer);
      const duration = Date.now() - startMs;
      const ttft = firstTokenMs ? firstTokenMs - startMs : 0;

      // 路径1：SSE 解析成功
      if (content || toolCallMap.size > 0) {
        logger.info(`SSE 完成: ${content.length} 字符, ${toolCallMap.size} 工具, 首token ${ttft}ms, 总 ${duration}ms`);
        resolve({
          content,
          toolCalls: Array.from(toolCallMap.values()),
          usage,
        });
        return;
      }

      // 路径2：SSE 无数据，尝试作为普通 JSON 解析
      logger.info(`SSE 无有效数据，尝试 JSON fallback (${rawBody.length} 字节)`);
      try {
        const parsed = JSON.parse(rawBody);
        const choice = parsed.choices?.[0]?.message;
        if (choice) {
          const result: StreamResult = {
            content: choice.content || '',
            toolCalls: (choice.tool_calls || []).map((tc: any) => ({
              id: tc.id || `tc_${Date.now()}`,
              name: tc.function?.name || '',
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || {}),
            })),
            usage: parsed.usage,
          };
          logger.info(`JSON fallback: ${result.content.length} 字符, ${result.toolCalls.length} 工具, ${duration}ms`);
          resolve(result);
          return;
        }
      } catch (e) {
        logger.warn(`JSON fallback 失败: ${(e as Error).message}, 原始数据前200字: ${rawBody.substring(0, 200)}`);
      }

      // 路径3：都失败，返回空
      logger.warn(`流响应解析全部失败, ${duration}ms`);
      resolve({ content: '', toolCalls: [], usage: undefined });
    });

    stream.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** 发起一次流式请求 */
async function doStreamRequest(
  baseUrl: string,
  apiKey: string,
  requestBody: any,
  timeoutMs: number,
  onToken?: (text: string) => void
): Promise<StreamResult> {
  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      responseType: 'stream',
      timeout: 60000, // 连接超时 60s（后续轮次 API 响应较慢）
    }
  );
  const result = await parseStreamResponse(response.data, timeoutMs, onToken);

  // 如果流式解析完全为空， fallback 到非流式
  if (!result.content && result.toolCalls.length === 0) {
    logger.info('流式结果为空，fallback 到非流式请求');
    return doRegularRequest(baseUrl, apiKey, { ...requestBody, stream: false }, timeoutMs);
  }

  return result;
}

/** 非流式 fallback */
async function doRegularRequest(
  baseUrl: string,
  apiKey: string,
  requestBody: any,
  timeoutMs: number
): Promise<StreamResult> {
  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: Math.min(timeoutMs, 120000), // 非流式最长等 120s
    }
  );
  const choice = response.data?.choices?.[0]?.message;
  const content = choice?.content || '';
  const rawToolCalls = choice?.tool_calls || [];
  return {
    content,
    toolCalls: rawToolCalls.map((tc: any) => ({
      id: tc.id || `tc_${Date.now()}`,
      name: tc.function?.name || '',
      arguments: typeof tc.function?.arguments === 'string'
        ? tc.function.arguments
        : JSON.stringify(tc.function?.arguments || {}),
    })),
    usage: response.data?.usage,
  };
}

/**
 * 调用 AI（流式版本）
 * 对外接口不变，内部用 stream: true 避免网关超时
 */
export async function chat(
  messages: Message[],
  tools?: ToolDefinition[],
  options?: { temperature?: number; maxTokens?: number; onToken?: (text: string) => void }
): Promise<AIResponse> {
  const { apiKey, baseUrl, model } = config.ai;
  const startTime = Date.now();

  if (!apiKey) {
    throw new Error('AI API Key 未配置');
  }

  // 动态 max_tokens：工具调用轮次也需要足够空间放 HTML 参数
  const defaultMaxTokens = tools && tools.length > 0 ? 4096 : 4096;

  const requestBody: any = {
    model,
    messages: buildOpenAIMessages(messages),
    stream: true,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? defaultMaxTokens,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = toOpenAITools(tools);
    requestBody.tool_choice = 'auto';
  }

  const payloadSize = JSON.stringify(requestBody).length;
  logger.info(`AI 请求(stream): ${messages.length} 消息, ${tools?.length || 0} 工具, max_tokens=${requestBody.max_tokens}, payload=${(payloadSize / 1024).toFixed(1)}KB`);
  logger.debug(`AI 请求消息:\n${messages.map((m, i) => `[${i}] ${m.role}: ${truncate(m.content || JSON.stringify((m as any).toolCalls || ''), 500)}`).join('\n')}`);

  const result = await retry(
    () => doStreamRequest(baseUrl, apiKey, requestBody, config.agent.timeoutMs, options?.onToken),
    {
      maxAttempts: 10,
      delayMs: 500,
      exponentialBackoff: true,
      shouldRetry: (err: any) => {
        const status = err?.response?.status;
        return !status || status === 504 || status === 502 || status === 503 || status === 429;
      },
    }
  );

  const toolCalls = parseToolCalls(result.toolCalls);
  const duration = Date.now() - startTime;
  const usageStr = result.usage ? `, tokens: ${result.usage.total_tokens}` : '';
  logger.info(`AI 响应: ${result.content.length} 字符, ${toolCalls.length} 工具调用, ${duration}ms${usageStr}`);
  logger.debug(`AI 响应内容:\n${truncate(result.content, 2000)}`);
  if (toolCalls.length > 0) {
    logger.debug(`AI 工具调用:\n${toolCalls.map((tc, i) => `[${i}] ${tc.name}(${truncate(JSON.stringify(tc.arguments), 500)})`).join('\n')}`);
  }

  return {
    content: result.content,
    toolCalls,
    usage: result.usage ? {
      promptTokens: result.usage.prompt_tokens || 0,
      completionTokens: result.usage.completion_tokens || 0,
      totalTokens: result.usage.total_tokens || 0,
    } : undefined,
  };
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + `...[${str.length}字符]` : str;
}
