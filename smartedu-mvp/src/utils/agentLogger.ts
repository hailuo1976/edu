import fs from 'fs';
import path from 'path';

/**
 * Agent日志记录器
 * 用于记录工具调用过程和AI调用上下文的详细日志
 */

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
  agent: string;
  iteration?: number;
  stage: string;
  message: string;
  data?: any;
}

export interface AIContext {
  timestamp: string;
  agent: string;
  iteration: number;
  apiEndpoint: string;
  model: string;
  request: {
    messages: any[];
    tools?: any[];
  };
  response?: {
    content: string;
    toolCalls?: any[];
    usage?: any;
  };
  error?: string;
  duration: number;
}

export class AgentLogger {
  private agentName: string;
  private sessionId: string;
  private logFile: string;
  private contextFile: string;
  private startTime: number;

  constructor(agentName: string) {
    this.agentName = agentName;
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
    
    const dateStr = new Date().toISOString().split('T')[0];
    this.logFile = path.join(LOG_DIR, `${agentName}_${dateStr}.log`);
    this.contextFile = path.join(LOG_DIR, `${agentName}_context_${dateStr}.jsonl`);
    
    this.ensureLogDir();
    this.logSessionStart();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  private logSessionStart(): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      agent: this.agentName,
      stage: 'session_start',
      message: `=== ${this.agentName} 会话开始 [${this.sessionId}] ===`,
    };
    this.writeLog(entry);
  }

  private writeLog(entry: LogEntry): void {
    const logLine = `[${entry.timestamp}] [${entry.level}] [${entry.agent}]` +
      (entry.iteration ? ` [迭代${entry.iteration}]` : '') +
      ` [${entry.stage}] ${entry.message}` +
      (entry.data ? '\n' + JSON.stringify(entry.data, null, 2) : '') + '\n';
    
    try {
      fs.appendFileSync(this.logFile, logLine, 'utf-8');
    } catch (e) {
      console.error('Failed to write log:', e);
    }

    // 同时输出到控制台
    const consoleMsg = entry.iteration 
      ? `[${entry.agent}] [迭代${entry.iteration}] [${entry.stage}] ${entry.message}`
      : `[${entry.agent}] [${entry.stage}] ${entry.message}`;
    
    if (entry.level === 'ERROR') {
      console.error(consoleMsg);
    } else if (entry.level === 'WARN') {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }
  }

  /**
   * 记录普通日志
   */
  log(level: LogEntry['level'], stage: string, message: string, data?: any, iteration?: number): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      agent: this.agentName,
      iteration,
      stage,
      message,
      data,
    };
    this.writeLog(entry);
  }

  info(stage: string, message: string, data?: any, iteration?: number): void {
    this.log('INFO', stage, message, data, iteration);
  }

  debug(stage: string, message: string, data?: any, iteration?: number): void {
    this.log('DEBUG', stage, message, data, iteration);
  }

  warn(stage: string, message: string, data?: any, iteration?: number): void {
    this.log('WARN', stage, message, data, iteration);
  }

  error(stage: string, message: string, data?: any, iteration?: number): void {
    this.log('ERROR', stage, message, data, iteration);
  }

  /**
   * 记录AI调用上下文
   */
  logAIContext(context: Omit<AIContext, 'timestamp' | 'agent'>): void {
    const fullContext: AIContext = {
      timestamp: new Date().toISOString(),
      agent: this.agentName,
      ...context,
    };

    // 写入JSONL文件
    try {
      fs.appendFileSync(this.contextFile, JSON.stringify(fullContext) + '\n', 'utf-8');
    } catch (e) {
      console.error('Failed to write AI context:', e);
    }

    // 同时在普通日志中记录摘要
    const toolCallCount = context.response?.toolCalls?.length || 0;
    const msg = `AI调用完成 - 模型: ${context.model}, 耗时: ${context.duration}ms, 工具调用: ${toolCallCount}个`;
    this.info('ai_call', msg, {
      iteration: context.iteration,
      model: context.model,
      duration: context.duration,
      toolCalls: toolCallCount,
      hasError: !!context.error,
    }, context.iteration);
  }

  /**
   * 记录工具调用
   */
  logToolCall(toolName: string, args: any, result: any, iteration: number): void {
    this.info('tool_execution', `工具执行: ${toolName}`, {
      toolName,
      arguments: args,
      result: result.success ? '成功' : '失败',
      error: result.error,
    }, iteration);
  }

  /**
   * 记录会话结束
   */
  logSessionEnd(success: boolean, iterations: number, totalToolCalls: number): void {
    const duration = Date.now() - this.startTime;
    this.info('session_end', `=== ${this.agentName} 会话结束 ===`, {
      sessionId: this.sessionId,
      success,
      iterations,
      totalToolCalls,
      duration: `${duration}ms`,
    });
  }

  /**
   * 获取当前会话ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// 导出单例实例
export const agentLogger = new AgentLogger('CourseToolCallAgent');
