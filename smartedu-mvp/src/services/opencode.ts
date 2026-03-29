import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface OpenCodeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    default?: any;
  }>;
  required: string[];
}

interface OpenCodeTool {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

interface OpenCodeResponse {
  content: string;
  toolCalls?: ToolUseBlock[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const API_LOG_FILE = path.join(LOG_DIR, `api_calls_${new Date().toISOString().split('T')[0]}.log`);

function logApiCall(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  console.log(message);
  
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(API_LOG_FILE, logEntry, 'utf-8');
  } catch (e) {
    console.error('Failed to write API log:', e);
  }
}

export class OpenCodeClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/apps/anthropic';
  }

  async generate(messages: OpenCodeMessage[], tools?: OpenCodeTool[]): Promise<OpenCodeResponse> {
    if (!this.apiKey) {
      throw new Error('OpenCode API key is required');
    }

    const callId = `call_${Date.now()}`;
    const startTime = new Date();

    try {
      console.log(`[OpenCode] 调用API: ${this.baseUrl}/v1/messages`);
      console.log(`[OpenCode] 请求ID: ${callId}`);
      console.log(`[OpenCode] 消息数量: ${messages.length}`);
      if (tools) {
        console.log(`[OpenCode] 工具数量: ${tools.length}`);
      }
      
      logApiCall('API_CALL_START', `=== API调用开始 [${callId}] ===`, {
        url: `${this.baseUrl}/v1/messages`,
        messageCount: messages.length,
        toolCount: tools?.length || 0,
        messages: messages.map((m, i) => ({
          role: m.role,
          contentLength: typeof m.content === 'string' ? m.content.length : '[complex]',
          contentPreview: typeof m.content === 'string' ? m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '') : '[complex content]'
        }))
      });

      const requestBody: any = {
        model: 'glm-5',
        messages: messages,
        max_tokens: 8192,
      };
      
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
      }

      const response = await axios.post(
        `${this.baseUrl}/v1/messages`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'anthropic-version': '2023-06-01',
          },
          timeout: 300000,
        }
      );

      let content = '';
      const toolCalls: ToolUseBlock[] = [];
      const contentArray = response.data.content || [];
      
      for (const item of contentArray) {
        if (item.type === 'text') {
          content += item.text;
        } else if (item.type === 'tool_use') {
          toolCalls.push({
            type: 'tool_use',
            id: item.id,
            name: item.name,
            input: item.input,
          });
        }
      }

      if (!content && contentArray.length > 0 && contentArray[0].type !== 'tool_use') {
        content = JSON.stringify(contentArray[0]);
      }

      const duration = Date.now() - startTime.getTime();
      
      logApiCall('API_CALL_SUCCESS', `=== API调用成功 [${callId}] ===`, {
        duration: `${duration}ms`,
        contentLength: content.length,
        toolCallCount: toolCalls.length,
        contentPreview: content.substring(0, 500) + (content.length > 500 ? '\n...(truncated)...' : ''),
        usage: response.data.usage,
      });

      console.log(`[OpenCode] 收到响应，长度: ${content.length} 字符，工具调用: ${toolCalls.length}，耗时: ${duration}ms`);

      return {
        content,
        toolCalls,
        usage: response.data.usage,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime.getTime();
      
      logApiCall('API_CALL_ERROR', `=== API调用失败 [${callId}] ===`, {
        duration: `${duration}ms`,
        errorMessage: error.message,
        errorCode: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      });
      
      console.error(`[OpenCode] API错误: ${error.message}`);
      if (error.response) {
        console.error('[OpenCode] 响应状态:', error.response.status);
        console.error('[OpenCode] 响应数据:', JSON.stringify(error.response.data));
      }
      throw new Error(`OpenCode API调用失败: ${error.message}`);
    }
  }

  async generateWithPrompt(prompt: string, tools?: OpenCodeTool[]): Promise<string> {
    const callId = `prompt_${Date.now()}`;
    
    console.log(`[OpenCode] 开始生成，问题长度: ${prompt.length} 字符`);
    console.log(`[OpenCode] Prompt ID: ${callId}`);
    if (tools) {
      console.log(`[OpenCode] 工具数量: ${tools.length}`);
    }
    
    logApiCall('PROMPT_START', `=== Prompt生成开始 [${callId}] ===`, {
      promptLength: prompt.length,
      toolCount: tools?.length || 0,
      promptPreview: prompt.substring(0, 500) + (prompt.length > 500 ? '\n...(truncated)...' : '')
    });

    const startTime = Date.now();
    
    return this.generate([
      { role: 'user', content: prompt }
    ], tools).then(res => {
      const duration = Date.now() - startTime;
      
      logApiCall('PROMPT_SUCCESS', `=== Prompt生成成功 [${callId}] ===`, {
        duration: `${duration}ms`,
        resultLength: res.content.length,
        toolCallCount: res.toolCalls?.length || 0,
        resultPreview: res.content.substring(0, 500) + (res.content.length > 500 ? '\n...(truncated)...' : '')
      });
      
      console.log(`[OpenCode] Prompt生成成功，响应长度: ${res.content.length}，工具调用: ${res.toolCalls?.length || 0}，耗时: ${duration}ms`);
      return res.content;
    }).catch(err => {
      const duration = Date.now() - startTime;
      
      logApiCall('PROMPT_ERROR', `=== Prompt生成失败 [${callId}] ===`, {
        duration: `${duration}ms`,
        error: err.message
      });
      
      throw err;
    });
  }

  async *streamWithTools(
    messages: OpenCodeMessage[],
    tools: OpenCodeTool[],
    onToolCall?: (toolCall: ToolUseBlock) => Promise<string>
  ): AsyncGenerator<{ content: string; toolCalls: ToolUseBlock[] }, void, unknown> {
    const callId = `stream_${Date.now()}`;
    const startTime = new Date();

    try {
      console.log(`[OpenCode] 流式调用API，消息数量: ${messages.length}，工具数量: ${tools.length}`);
      
      const formattedMessages = this.formatMessagesForAPI(messages, tools);
      
      const response = await axios.post(
        `${this.baseUrl}/v1/messages`,
        {
          model: 'glm-5',
          messages: formattedMessages,
          max_tokens: 8192,
          stream: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'anthropic-version': '2023-06-01',
          },
          timeout: 300000,
          responseType: 'stream',
        }
      );

      let accumulatedContent = '';
      const toolCalls: ToolUseBlock[] = [];
      let currentToolCall: ToolUseBlock | null = null;
      let buffer = '';

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            const delta = event.content?.[0];
            
            if (delta?.type === 'text_delta') {
              accumulatedContent += delta.text;
              yield { content: accumulatedContent, toolCalls: [] };
            } else if (delta?.type === 'input_json_delta') {
              if (delta.name && !currentToolCall) {
                currentToolCall = {
                  type: 'tool_use',
                  id: delta.id || `tool_${Date.now()}`,
                  name: delta.name,
                  input: {},
                };
              }
              if (currentToolCall && delta.input_json) {
                try {
                  currentToolCall.input = JSON.parse(delta.input_json);
                } catch {
                }
              }
            }
          } catch (e) {
          }
        }
      }

      if (currentToolCall) {
        toolCalls.push(currentToolCall);
      }

      if (onToolCall && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const result = await onToolCall(toolCall);
          messages.push(
            { role: 'assistant', content: '' },
            { role: 'user', content: result }
          );
        }
        yield* this.streamWithTools(messages, tools, onToolCall);
      }

      console.log(`[OpenCode] 流式调用完成，耗时: ${Date.now() - startTime.getTime()}ms`);
    } catch (error: any) {
      console.error(`[OpenCode] 流式调用错误: ${error.message}`);
      throw error;
    }
  }

  private formatMessagesForAPI(messages: OpenCodeMessage[], tools: OpenCodeTool[]): any[] {
    const result: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        result.push({ role: 'assistant', content: msg.content });
      }
    }

    return result;
  }
}

export interface OllamaToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface OllamaResponse {
  message: {
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  model: string;
  done: boolean;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor(options: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = options.model || process.env.OLLAMA_MODEL || 'llama3.2';
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    tools?: any[]
  ): Promise<OllamaResponse> {
    const callId = `ollama_${Date.now()}`;
    
    console.log(`[Ollama] 调用API: ${this.baseUrl}/api/chat`);
    console.log(`[Ollama] 模型: ${this.model}`);
    console.log(`[Ollama] 消息数量: ${messages.length}`);
    if (tools) {
      console.log(`[Ollama] 工具数量: ${tools.length}`);
    }

    const requestBody: any = {
      model: this.model,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await axios.post(
      `${this.baseUrl}/api/chat`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    );

    console.log(`[Ollama] 响应完成`);
    return response.data;
  }
}

export class OpenAICompatibleClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: { 
    apiKey?: string; 
    baseUrl?: string; 
    model?: string;
  } = {}) {
    this.apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.OPENCODE_API_KEY || '';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.model = options.model || process.env.OPENAI_MODEL || 'qwen-plus';
  }

  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    tools?: any[]
  ): Promise<{
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }> {
    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    const callId = `oai_${Date.now()}`;
    
    console.log(`[OpenAI Compatible] 调用API: ${this.baseUrl}/chat/completions`);
    console.log(`[OpenAI Compatible] 模型: ${this.model}`);
    console.log(`[OpenAI Compatible] 消息数量: ${messages.length}`);
    if (tools) {
      console.log(`[OpenAI Compatible] 工具数量: ${tools.length}`);
    }

    const requestBody: any = {
      model: this.model,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 180000,
      }
    );

    const choice = response.data.choices?.[0]?.message;
    const content = choice?.content || '';
    const toolCalls = choice?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })) || [];

    console.log(`[OpenAI Compatible] 响应完成，内容长度: ${content.length}，工具调用: ${toolCalls.length}`);
    
    return { content, toolCalls };
  }
}

export const ollamaClient = new OllamaClient();
export const openAICompatibleClient = new OpenAICompatibleClient();

export const openCodeClient = new OpenCodeClient();
