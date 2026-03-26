import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface OpenCodeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenCodeResponse {
  content: string;
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

  async generate(messages: OpenCodeMessage[]): Promise<OpenCodeResponse> {
    if (!this.apiKey) {
      throw new Error('OpenCode API key is required');
    }

    const callId = `call_${Date.now()}`;
    const startTime = new Date();

    try {
      console.log(`[OpenCode] 调用API: ${this.baseUrl}/v1/messages`);
      console.log(`[OpenCode] 请求ID: ${callId}`);
      console.log(`[OpenCode] 消息数量: ${messages.length}`);
      
      logApiCall('API_CALL_START', `=== API调用开始 [${callId}] ===`, {
        url: `${this.baseUrl}/v1/messages`,
        messageCount: messages.length,
        messages: messages.map((m, i) => ({
          role: m.role,
          contentLength: m.content.length,
          contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
        }))
      });

      const response = await axios.post(
        `${this.baseUrl}/v1/messages`,
        {
          model: 'glm-5',
          messages: messages,
          max_tokens: 8192,
        },
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
      const contentArray = response.data.content || [];
      
      for (const item of contentArray) {
        if (item.type === 'text') {
          content += item.text;
        }
      }

      if (!content && contentArray.length > 0) {
        content = JSON.stringify(contentArray[0]);
      }

      const duration = Date.now() - startTime.getTime();
      
      logApiCall('API_CALL_SUCCESS', `=== API调用成功 [${callId}] ===`, {
        duration: `${duration}ms`,
        contentLength: content.length,
        contentPreview: content.substring(0, 500) + (content.length > 500 ? '\n...(truncated)...' : ''),
        usage: response.data.usage,
        responseData: response.data
      });

      console.log(`[OpenCode] 收到响应，长度: ${content.length} 字符，耗时: ${duration}ms`);

      return {
        content,
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

  async generateWithPrompt(prompt: string): Promise<string> {
    const callId = `prompt_${Date.now()}`;
    
    console.log(`[OpenCode] 开始生成，问题长度: ${prompt.length} 字符`);
    console.log(`[OpenCode] Prompt ID: ${callId}`);
    
    logApiCall('PROMPT_START', `=== Prompt生成开始 [${callId}] ===`, {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 500) + (prompt.length > 500 ? '\n...(truncated)...' : '')
    });

    const startTime = Date.now();
    
    return this.generate([
      { role: 'user', content: prompt }
    ]).then(res => {
      const duration = Date.now() - startTime;
      
      logApiCall('PROMPT_SUCCESS', `=== Prompt生成成功 [${callId}] ===`, {
        duration: `${duration}ms`,
        resultLength: res.content.length,
        resultPreview: res.content.substring(0, 500) + (res.content.length > 500 ? '\n...(truncated)...' : '')
      });
      
      console.log(`[OpenCode] Prompt生成成功，响应长度: ${res.content.length}，耗时: ${duration}ms`);
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
}

export const openCodeClient = new OpenCodeClient();
