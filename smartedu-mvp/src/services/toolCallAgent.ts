import axios from 'axios';
import * as path from 'path';
import {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolCallMessage,
  ToolResultMessage,
  AgentMessage,
  AgentConfig,
  AgentProgress,
  AgentProgressCallback,
  DEFAULT_AGENT_CONFIG,
} from '../types/agent';
import {
  FILE_TOOLS,
  FileToolExecutor,
  fileToolExecutor,
} from './fileTools';

export interface ToolCallAgentOptions {
  config?: Partial<AgentConfig>;
  tools?: ToolDefinition[];
  workDir?: string;
  onProgress?: AgentProgressCallback;
}

export interface AgentExecutionResult {
  success: boolean;
  messages: AgentMessage[];
  finalOutput?: string;
  iterations: number;
  toolCalls: ToolResult[];
  error?: string;
}

export class ToolCallAgent {
  private config: AgentConfig;
  private tools: ToolDefinition[];
  private executor: FileToolExecutor;
  private messages: AgentMessage[] = [];
  private progressCallback?: AgentProgressCallback;
  private apiKey: string;
  private baseUrl: string;

  constructor(options: ToolCallAgentOptions = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
    this.tools = options.tools || FILE_TOOLS;
    this.executor = options.workDir
      ? new FileToolExecutor(options.workDir)
      : fileToolExecutor;
    this.progressCallback = options.onProgress;
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  async execute(initialPrompt: string): Promise<AgentExecutionResult> {
    const toolResults: ToolResult[] = [];
    let iterations = 0;
    const startTime = Date.now();

    this.messages = [
      {
        role: 'system',
        content: this.buildSystemPrompt(),
      },
      {
        role: 'user',
        content: initialPrompt,
      },
    ];

    this.reportProgress({
      iteration: iterations,
      stage: 'thinking',
      message: '开始执行任务...',
    });

    while (iterations < this.config.maxIterations) {
      iterations++;

      try {
        this.reportProgress({
          iteration: iterations,
          stage: 'thinking',
          message: `第 ${iterations} 轮：正在思考...`,
        });

        const response = await this.callAI();

        this.messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        if (this.checkExitCondition(response.content)) {
          this.reportProgress({
            iteration: iterations,
            stage: 'complete',
            message: '检测到结束提示，任务完成',
          });

          return {
            success: true,
            messages: this.messages,
            finalOutput: response.content,
            iterations,
            toolCalls: toolResults,
          };
        }

        if (!response.toolCalls || response.toolCalls.length === 0) {
          if (iterations >= this.config.maxIterations) {
            return {
              success: true,
              messages: this.messages,
              finalOutput: response.content,
              iterations,
              toolCalls: toolResults,
            };
          }

          this.messages.push({
            role: 'user',
            content: '请继续执行任务。如果任务已完成，请明确说明"任务完成"或"完成"。',
          });
          continue;
        }

        this.reportProgress({
          iteration: iterations,
          stage: 'tool_call',
          message: `准备执行 ${response.toolCalls.length} 个工具调用`,
          toolCalls: response.toolCalls.map(tc => ({
            name: tc.name,
            arguments: tc.input,
          })),
        });

        const results = await this.executeTools(response.toolCalls);
        toolResults.push(...results);

        const toolResultMessages: ToolResultMessage[] = results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.toolCallId,
          content: r.success
            ? JSON.stringify(r.result, null, 2)
            : `错误: ${r.error}`,
          is_error: !r.success,
        }));

        this.messages.push({
          role: 'user',
          content: '',
          toolResults: toolResultMessages,
        });

        this.reportProgress({
          iteration: iterations,
          stage: 'tool_result',
          message: `工具执行完成: ${results.filter(r => r.success).length}/${results.length} 成功`,
          toolResults: results,
        });

      } catch (error: any) {
        console.error(`[ToolCallAgent] 第 ${iterations} 轮执行失败:`, error);

        this.reportProgress({
          iteration: iterations,
          stage: 'error',
          message: `执行错误: ${error.message}`,
        });

        return {
          success: false,
          messages: this.messages,
          iterations,
          toolCalls: toolResults,
          error: error.message,
        };
      }
    }

    return {
      success: false,
      messages: this.messages,
      iterations,
      toolCalls: toolResults,
      error: `达到最大迭代次数 (${this.config.maxIterations})`,
    };
  }

  private buildSystemPrompt(): string {
    const toolDescriptions = this.tools.map(tool => {
      const props = Object.entries(tool.inputSchema.properties)
        .map(([name, schema]) => `    - ${name} (${schema.type}): ${schema.description}`)
        .join('\n');

      return `### ${tool.name}
描述: ${tool.description}
参数:
${props}`;
    }).join('\n\n');

    return `你是AI课件生成助手，可以调用工具来完成文件操作任务。

## 可用工具
${toolDescriptions}

## 工具调用规则
1. 当需要创建、写入或读取文件时，使用相应的工具
2. 每个工具调用必须包含 tool_calls 字段
3. 工具参数必须符合参数Schema要求
4. 执行完所有需要的工具后，返回最终结果

## 结束条件
当任务完成后，必须在回复中包含以下任一结束提示：
- "任务完成"
- "完成"
- "所有文件已生成"
- "FINISH"
- "DONE"

## 注意事项
- 文件路径可以是绝对路径或相对路径（相对于当前工作目录）
- 创建文件前可以先检查文件是否存在
- 建议在写入文件前先创建目录
- 工具执行结果会返回给你，你可以根据结果决定下一步操作`;
  }

  private async callAI(): Promise<{ content: string; toolCalls?: ToolCallMessage[] }> {
    if (!this.apiKey) {
      throw new Error('OpenCode API key is required');
    }

    const formattedMessages = this.formatMessagesForAPI();

    const response = await axios.post(
      `${this.baseUrl}/v1/messages`,
      {
        model: 'glm-5',
        messages: formattedMessages,
        max_tokens: 8192,
        tools: this.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        timeout: this.config.timeoutMs,
      }
    );

    let content = '';
    const toolCalls: ToolCallMessage[] = [];

    const contentArray = response.data.content || [];

    for (const item of contentArray) {
      if (item.type === 'text') {
        content += item.text;
      } else if (item.type === 'tool_use') {
        toolCalls.push({
          type: 'tool_call',
          id: item.id,
          name: item.name,
          input: item.input,
        });
      }
    }

    return { content, toolCalls };
  }

  private formatMessagesForAPI(): any[] {
    const result: any[] = [];

    for (const msg of this.messages) {
      if (msg.role === 'system') {
        result.push({
          role: 'system',
          content: msg.content,
        });
      } else if (msg.role === 'user') {
        if (msg.toolResults && msg.toolResults.length > 0) {
          const contentParts: any[] = [];

          for (const tr of msg.toolResults) {
            contentParts.push({
              type: 'tool_result',
              tool_use_id: tr.tool_use_id,
              content: tr.content,
              is_error: tr.is_error,
            });
          }

          result.push({
            role: 'user',
            content: contentParts,
          });
        } else if (msg.content) {
          result.push({
            role: 'user',
            content: msg.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = {
          role: 'assistant',
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.content = msg.content || '';
          assistantMsg.tool_calls = msg.toolCalls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          }));
        } else {
          assistantMsg.content = msg.content;
        }

        result.push(assistantMsg);
      }
    }

    return result;
  }

  private async executeTools(toolCalls: ToolCallMessage[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executor.execute({
        name: toolCall.name,
        arguments: toolCall.input,
      });
      results.push(result);
    }

    return results;
  }

  private checkExitCondition(content: string): boolean {
    const upperContent = content.toUpperCase();

    for (const keyword of this.config.exitKeywords || []) {
      if (upperContent.includes(keyword.toUpperCase())) {
        return true;
      }
    }

    return false;
  }

  private reportProgress(progress: AgentProgress): void {
    console.log(`[ToolCallAgent] [${progress.stage}] ${progress.message}`);

    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  reset(): void {
    this.messages = [];
  }
}

export const toolCallAgent = new ToolCallAgent();
