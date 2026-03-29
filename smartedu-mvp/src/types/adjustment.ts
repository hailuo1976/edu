/**
 * 课件调整系统类型定义
 * 支持多轮交互式课件修改
 */

export interface CourseInfo {
  id: string;
  topic: string;
  subject: string;
  gradeLevel: number;
  createdAt: string;
  filePath: string;
  preview?: string;
}

export interface AdjustmentSession {
  sessionId: string;
  courseId: string;
  courseInfo: CourseInfo;
  originalHtml: string;
  currentHtml: string;
  conversationHistory: ConversationMessage[];
  adjustmentHistory: AdjustmentRecord[];
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'abandoned';
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    toolCalls?: ToolCallInfo[];
    processingTime?: number;
    tokensUsed?: number;
  };
}

export interface ToolCallInfo {
  tool: string;
  input: any;
  output: any;
  timestamp: Date;
}

export interface AdjustmentRecord {
  id: string;
  timestamp: Date;
  userRequest: string;
  aiResponse: string;
  htmlBefore: string;
  htmlAfter: string;
  changes: HtmlChange[];
  approved: boolean;
}

export interface HtmlChange {
  type: 'add' | 'modify' | 'delete';
  section?: string;
  description: string;
  before?: string;
  after?: string;
}

export interface AdjustmentRequest {
  sessionId?: string;
  courseId: string;
  userRequest: string;
  stream?: boolean;
}

export interface AdjustmentResponse {
  success: boolean;
  sessionId: string;
  message?: string;
  html?: string;
  conversationHistory?: ConversationMessage[];
  adjustmentRecord?: AdjustmentRecord;
  error?: string;
}

export interface ListCoursesResponse {
  success: boolean;
  courses: CourseInfo[];
  total: number;
  error?: string;
}

export interface PreviewAdjustmentRequest {
  sessionId: string;
  adjustmentId: string;
}

export interface PreviewAdjustmentResponse {
  success: boolean;
  htmlBefore: string;
  htmlAfter: string;
  changes: HtmlChange[];
  error?: string;
}

export interface RollbackRequest {
  sessionId: string;
  targetAdjustmentId: string;
}

export interface RollbackResponse {
  success: boolean;
  html: string;
  message: string;
  error?: string;
}

export interface ValidateAdjustmentRequest {
  sessionId: string;
  html: string;
}

export interface ValidateAdjustmentResponse {
  success: boolean;
  isValid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  error?: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'content' | 'structure' | 'accessibility' | 'pedagogy';
  message: string;
  location?: string;
}

export interface AdjustmentProgress {
  sessionId: string;
  stage: 'analyzing' | 'planning' | 'executing' | 'validating' | 'complete';
  message: string;
  progress: number;
  timestamp: Date;
  details?: {
    toolCalls?: ToolCallInfo[];
    currentStep?: string;
    totalSteps?: number;
  };
}

/**
 * 日志消息类型
 */
export type LogLevel = 'info' | 'debug' | 'warn' | 'error';

export type LogCategory = 'system' | 'ai' | 'tool' | 'progress';

export interface LogMessage {
  id: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  timestamp: Date;
  details?: any;
  indentLevel?: number;
}

/**
 * 扩展AdjustmentProgress，支持包含日志信息
 */
export interface AdjustmentProgressWithLog extends AdjustmentProgress {
  type?: 'progress' | 'log';
  log?: LogMessage;
}
