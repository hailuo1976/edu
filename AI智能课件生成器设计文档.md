# AI智能课件生成器 设计文档

**文档版本**: V1.0  
**编制日期**: 2026-03-29  
**项目名称**: SmartEdu MVP  
**代码工程路径**: `D:\oc\edu\smartedu-mvp`

---

## 1. 系统概述

### 1.1 功能定位

基于OpenCode/Claude API的AI智能课件生成系统，接收用户的自然语言问题，自动生成包含概念讲解、图形演示、练习测试的HTML互动课件，并支持多轮调优和课件调整。

### 1.2 核心能力

| 能力项 | 说明 |
|-------|------|
| 课程生成 | AI生成小学HTML互动课件 |
| 工具调用Agent | 多轮对话式工具调用执行 |
| 多轮调优 | 生成-审查-修复质量闭环 |
| 课件调整 | 交互式课件修改服务 |
| HTML验证 | 结构完整性和安全性检查 |

### 1.3 技术架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户访问层                                  │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│    │  Web界面   │  │  API接口   │  │ CLI/测试   │             │
│    │ (HTML/CSS) │  │ (REST)    │  │ (ts-node) │             │
│    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└───────────┼────────────────┼────────────────┼──────────────────────┘
            │                │                │
┌───────────▼────────────────▼────────────────▼──────────────────────┐
│                         API网关层 (Express)                         │
│    ┌─────────────────────────────────────────────────────────────┐ │
│    │ courseRoutes (POST /generate, GET /list, GET /:id)          │ │
│    │ adjustmentRoutes (POST /adjust, POST /rollback, GET /courses)│ │
│    └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
            │                │
┌───────────▼────────────────▼──────────────────────────────────────┐
│                         服务层 (src/services/)                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │ CourseService  │  │CourseAgent    │  │CourseToolCall │        │
│  │ 课程生成编排   │  │ 单轮生成+调优 │  │ Agent         │        │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘        │
│          └───────────────────┼───────────────────┘                │
│                    ┌─────────▼─────────┐                          │
│                    │   ToolManager    │                           │
│                    │   工具注册与执行  │                           │
│                    └─────────┬─────────┘                          │
└──────────────────────────────┼────────────────────────────────────┘
                               │
┌───────────────────────────────▼────────────────────────────────────┐
│                         AI服务层 (src/services/)                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │ OpenCodeClient│  │OllamaClient   │  │OpenAICompat   │        │
│  │ DashScope API │  │ 本地模型     │  │ Client        │        │
│  └───────────────┘  └───────────────┘  └───────────────┘        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
smartedu-mvp/
├── src/
│   ├── index.ts                    # Express服务器入口
│   ├── api/
│   │   ├── course.ts              # 课程生成API路由
│   │   └── adjustment.ts          # 课件调整API路由
│   ├── services/
│   │   ├── courseService.ts       # 课程服务编排层
│   │   ├── courseAgent.ts         # 单轮生成+多轮调优Agent
│   │   ├── courseToolCallAgent.ts  # 工具调用Agent
│   │   ├── courseReviewer.ts       # 质量审查器
│   │   ├── courseAdjustmentService.ts # 课件调整服务
│   │   ├── toolManager.ts         # 工具管理器
│   │   ├── opencode.ts            # OpenCode/DashScope客户端
│   │   ├── localSearch.ts         # 本地知识搜索
│   │   └── webSearch.ts           # 网络搜索
│   ├── skills/
│   │   ├── coursePrompt.ts        # Prompt模板定义
│   │   └── courseTools.ts         # 工具定义
│   ├── types/
│   │   ├── course.ts              # 课程相关类型
│   │   ├── agent.ts               # Agent相关类型
│   │   ├── generation.ts          # 生成相关类型
│   │   ├── adjustment.ts          # 调整相关类型
│   │   └── refinement.ts           # 调优相关类型
│   └── utils/
│       ├── parser.ts              # JSON解析器
│       ├── htmlValidator.ts       # HTML验证器
│       ├── codeValidator.ts       # 代码验证器
│       └── agentLogger.ts         # Agent日志
├── web/                           # 前端界面
├── courses/                       # 生成的课程存储
├── adjustment-sessions/           # 调整会话存储
└── logs/                         # 日志文件
```

---

## 3. 核心类型定义

### 3.1 课程类型 (`src/types/course.ts`)

```typescript
// ============================================
// 课程元信息
// ============================================
interface CourseMetadata {
  subject: string;              // 学科: 数学、语文、英语、科学
  grade: number;               // 年级: 1-6
  topic: string;               // 主题
  estimated_minutes: number;    // 预计时长
  difficulty: 'easy' | 'medium' | 'hard';
}

// ============================================
// 课程章节
// ============================================
interface CourseSection {
  id?: string;
  // 章节类型: intro|concept|formula|example|calculator|exercise|summary|demo
  type: 'intro' | 'concept' | 'formula' | 'example' | 'calculator' | 'exercise' | 'summary' | 'demo';
  title: string;
  content: string;              // Markdown或HTML内容
}

// ============================================
// 完整课程
// ============================================
interface Course {
  id: string;
  topic: string;
  subject: string;
  gradeLevel: number;
  createdAt: string;
  html: string;                 // 生成的HTML内容
  toolCalls: any[];             // 工具调用记录
  sections: CourseSection[];
}

// ============================================
// 课程内容(结构化)
// ============================================
interface CourseContent {
  course_id: string;
  metadata: CourseMetadata;
  sections: CourseSection[];
  knowledge_tags: string[];
}

// ============================================
// API请求/响应
// ============================================
interface GenerateCourseRequest {
  user_question: string;        // 用户问题
  subject: string;              // 学科
  grade_level: number;          // 年级
}

interface GenerateCourseResponse {
  success: boolean;
  course_id?: string;
  course?: CourseContent;
  html_content?: string;        // HTML课件
  error?: string;
  error_type?: string;
  validation_errors?: string[];
  generation_attempts?: number;
  generation_duration?: number;
}
```

### 3.2 Agent类型 (`src/types/agent.ts`)

```typescript
// ============================================
// 工具定义
// ============================================
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolPropertySchema>;
    required: string[];
  };
}

interface ToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  default?: any;
}

// ============================================
// 工具调用
// ============================================
interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

interface ToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
}

// ============================================
// Agent进度
// ============================================
interface AgentProgress {
  iteration: number;
  stage: 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error' | 'retry';
  message: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  ai_input?: string;
  ai_output?: string;
  tool_call?: {
    name: string;
    arguments?: any;
    result?: any;
    error?: string;
    success: boolean;
  };
  draft_content?: {
    type?: 'svg' | 'html' | 'search';
    title?: string;
    content: string;
  };
}

type AgentProgressCallback = (progress: AgentProgress) => void;

// ============================================
// Agent配置
// ============================================
interface AgentConfig {
  maxIterations: number;        // 最大迭代次数，默认20
  timeoutMs: number;           // 超时时间，默认300000ms
  exitKeywords?: string[];      // 退出关键词
  defaultWorkDir?: string;      // 默认工作目录
}

const DEFAULT_EXIT_KEYWORDS = [
  '任务完成', '生成完毕', '完成', 'FINISH', 'DONE', 'EXIT',
  '已完成所有任务', '所有文件已生成',
];

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 20,
  timeoutMs: 300000,
  exitKeywords: DEFAULT_EXIT_KEYWORDS,
  defaultWorkDir: './courses',
};
```

### 3.3 生成类型 (`src/types/generation.ts`)

```typescript
// ============================================
// 生成错误类型
// ============================================
enum GenerationErrorType {
  PARSE_ERROR = 'PARSE_ERROR',           // JSON解析错误
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 验证错误
  API_ERROR = 'API_ERROR',               // API调用错误
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',       // 超时错误
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',   // 重试耗尽
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',         // 未知错误
}

class GenerationError extends Error {
  constructor(
    message: string,
    public type: GenerationErrorType,
    public originalError?: Error,
    public retryable: boolean = false      // 是否可重试
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

// ============================================
// 验证结果
// ============================================
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

interface ValidationError {
  code: string;
  message: string;
  position?: { line: number; column: number };
}

// ============================================
// 生成进度
// ============================================
interface GenerationProgress {
  stage: 'prompt' | 'search' | 'api_call' | 'parse' | 'validate' | 
         'complete' | 'error' | 'retry' | 'refine' | 'review';
  message: string;
  timestamp: number;
  retryCount?: number;
  qualityScore?: {
    overall: number;
    passed: boolean;
    dimensions?: {
      pedagogy: number;      // 教学设计
      content: number;       // 内容质量
      interaction: number;    // 交互设计
      safety: number;        // 安全合规
      format: number;        // 格式规范
    };
  };
  promptPreview?: string;
  issues?: {
    severity: string;
    category: string;
    message: string;
    suggestion?: string;
  }[];
  totalDuration?: number;
}

type ProgressCallback = (progress: GenerationProgress) => void;

// ============================================
// 生成选项
// ============================================
interface GenerationOptions {
  maxRetries: number;                 // 最大重试次数，默认3
  retryDelayMs: number;               // 重试延迟，默认1000ms
  timeoutMs: number;                  // 超时时间，默认300000ms
  enableValidation: boolean;          // 启用验证
  enableFallback: boolean;            // 启用降级
  enableWebSearch: boolean;           // 启用网络搜索
  enableLocalSearch: boolean;         // 启用本地搜索
  enableCodeValidation: boolean;     // 启用代码验证
  searchResultCount: number;          // 搜索结果数量
  enableQualityRefinement: boolean;   // 启用质量调优
  qualityThreshold?: QualityThreshold;
  maxRefinementAttempts: number;      // 最大调优次数
}
```

### 3.4 调优类型 (`src/types/refinement.ts`)

```typescript
// ============================================
// 质量评分
// ============================================
interface QualityScore {
  overall: number;                    // 总分
  dimensions: {
    pedagogy: number;      // 教学设计 (25%)
    content: number;       // 内容质量 (25%)
    interaction: number;   // 交互设计 (20%)
    safety: number;       // 安全合规 (20%)
    format: number;       // 格式规范 (10%)
  };
  issues: QualityIssue[];
  passed: boolean;                  // 是否通过
}

// ============================================
// 质量问题
// ============================================
interface QualityIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'pedagogy' | 'content' | 'interaction' | 'safety' | 'format';
  message: string;
  location?: string;
  suggestion?: string;
}

// ============================================
// 质量阈值
// ============================================
interface QualityThreshold {
  overall: number;          // >= 75
  pedagogy: number;        // >= 70
  content: number;         // >= 70
  interaction: number;     // >= 60
  safety: number;          // = 100 (必须100%)
  format: number;          // >= 60
}

const DEFAULT_QUALITY_THRESHOLD: QualityThreshold = {
  overall: 75,
  pedagogy: 70,
  content: 70,
  interaction: 60,
  safety: 100,
  format: 80,
};

// ============================================
// 调优状态
// ============================================
enum RefinementStatus {
  IDLE = 'idle',
  GENERATING = 'generating',
  REVIEWING = 'reviewing',
  FIXING = 'fixing',
  PASSED = 'passed',
  FAILED = 'failed',
}

interface RefinementProgress {
  status: RefinementStatus;
  currentAttempt: number;
  maxAttempts: number;
  currentScore?: QualityScore;
  previousScore?: QualityScore;
  message: string;
  issues: QualityIssue[];
}
```

### 3.5 调整类型 (`src/types/adjustment.ts`)

```typescript
// ============================================
// 课件信息
// ============================================
interface CourseInfo {
  id: string;
  topic: string;
  subject: string;
  gradeLevel: number;
  createdAt: string;
  filePath: string;
  preview?: string;                  // 内容预览
}

// ============================================
// 调整会话
// ============================================
interface AdjustmentSession {
  sessionId: string;
  courseId: string;
  courseInfo: CourseInfo;
  originalHtml: string;              // 原始HTML
  currentHtml: string;               // 当前HTML
  conversationHistory: ConversationMessage[];
  adjustmentHistory: AdjustmentRecord[];
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'abandoned';
}

// ============================================
// 对话消息
// ============================================
interface ConversationMessage {
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

// ============================================
// 调整记录
// ============================================
interface AdjustmentRecord {
  id: string;
  timestamp: Date;
  userRequest: string;
  aiResponse: string;
  htmlBefore: string;
  htmlAfter: string;
  changes: HtmlChange[];
  approved: boolean;
}

// ============================================
// HTML变更
// ============================================
interface HtmlChange {
  type: 'add' | 'modify' | 'delete';
  section?: string;
  description: string;
  before?: string;
  after?: string;
}

// ============================================
// 调整请求/响应
// ============================================
interface AdjustmentRequest {
  sessionId?: string;
  courseId: string;
  userRequest: string;
  stream?: boolean;
}

interface AdjustmentResponse {
  success: boolean;
  sessionId: string;
  message?: string;
  html?: string;
  conversationHistory?: ConversationMessage[];
  adjustmentRecord?: AdjustmentRecord;
  error?: string;
}

// ============================================
// 调整进度
// ============================================
interface AdjustmentProgress {
  sessionId: string;
  stage: 'analyzing' | 'planning' | 'executing' | 'validating' | 'complete';
  message: string;
  progress: number;                   // 0-100
  timestamp: Date;
  details?: {
    toolCalls?: ToolCallInfo[];
    currentStep?: string;
    totalSteps?: number;
  };
}
```

---

## 4. 核心服务伪代码

### 4.1 工具管理器 (`src/services/toolManager.ts`)

**功能**: 管理系统工具注册、执行和统计。

```typescript
// ============================================
// 工具管理器 - ToolManager
// ============================================

class ToolManager {
  // 工具注册表: Map<工具名, 工具定义>
  private tools: Map<string, ToolDefinition> = new Map();
  
  // 工具统计: Map<工具名, 统计数据>
  private toolStats: Map<string, {
    total: number;           // 总调用次数
    success: number;         // 成功次数
    failures: number;        // 失败次数
    avgTime: number;         // 平均执行时间
  }>;
  
  // 工作目录
  private workDir: string;
  
  // 日志器
  private static logger: AgentLogger;
  
  constructor(workDir: string = './') {
    this.workDir = path.resolve(workDir);
    // 注册默认工具
    this.registerDefaultTools();
  }
  
  /**
   * 注册工具
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.toolStats.set(tool.name, {
      total: 0, success: 0, failures: 0, avgTime: 0
    });
  }
  
  /**
   * 获取工具列表(用于AI函数调用)
   */
  getTools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {...};
    };
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
  
  /**
   * 执行工具
   */
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.tools.get(toolCall.name);
    
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: `工具不存在: ${toolCall.name}`,
        executionTime: Date.now() - startTime,
      };
    }
    
    // 参数验证
    const validationError = this.validateToolParameters(tool, toolCall.arguments);
    if (validationError) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: validationError,
        executionTime: Date.now() - startTime,
      };
    }
    
    try {
      // 带超时和重试的执行
      const result = await this.retry(
        () => this.executeToolWithTimeout(tool, toolCall.arguments),
        3,      // 最大重试3次
        1000    // 重试延迟1000ms
      );
      
      this.updateToolStats(toolCall.name, true, Date.now() - startTime);
      
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: true,
        result,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.updateToolStats(toolCall.name, false, Date.now() - startTime);
      
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
      };
    }
  }
  
  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    // 1. generate_svg - 生成SVG矢量图形
    this.registerTool({
      name: 'generate_svg',
      description: '生成SVG矢量图形，用于可视化数学概念',
      parameters: {
        type: 'object',
        properties: {
          shape_type: { type: 'string', description: '图形类型: rect/circle/triangle' },
          dimensions: { type: 'object', description: '图形尺寸参数' },
          label: { type: 'string', description: '标签文字' },
          style: { type: 'string', description: '样式描述' },
        },
        required: ['shape_type', 'dimensions'],
      },
      execute: async (args, workDir) => {
        const { shape_type, dimensions, label } = args;
        let svg = '';
        
        switch (shape_type) {
          case 'rect':
            svg = `<svg width="${dimensions.width}" height="${dimensions.height}" ...>`;
            break;
          case 'circle':
            svg = `<svg ...><circle .../></svg>`;
            break;
          case 'triangle':
            svg = `<svg ...><polygon points="..."/></svg>`;
            break;
        }
        
        return { svg, shape_type, dimensions };
      },
    });
    
    // 2. generate_svg_diagram - 生成SVG图表
    // 3. generate_html_component - 生成HTML组件
    // 4. validate_html - 验证HTML有效性
    // 5. search_educational_content - 搜索教育内容
    // 6. save_course_html - 保存课程HTML
    
    // 7. 文件操作工具
    this.registerTool({
      name: 'create_file',
      description: '创建新文件',
      execute: async (args, workDir) => {
        const filePath = path.isAbsolute(args.file_path) 
          ? args.file_path 
          : path.join(workDir, args.file_path);
        
        fs.writeFileSync(filePath, args.content, 'utf-8');
        return { path: filePath, size: args.content.length };
      },
    });
    
    // 8. write_file - 写入文件
    // 9. read_file - 读取文件
    // 10. list_files - 列出文件
    // 11. file_exists - 检查文件存在
    // 12. create_directory - 创建目录
    // 13. delete_file - 删除文件
    // 14. copy_file - 复制文件
  }
  
  /**
   * 验证参数
   */
  private validateToolParameters(tool: ToolDefinition, args: Record<string, any>): string | null {
    const requiredParams = tool.parameters.required || [];
    for (const param of requiredParams) {
      if (args[param] === undefined || args[param] === null) {
        return `缺少必填参数: ${param}`;
      }
    }
    return null;
  }
  
  /**
   * 带超时的执行
   */
  private async executeToolWithTimeout(
    tool: ToolDefinition, 
    args: Record<string, any>, 
    timeoutMs: number = 30000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`工具执行超时 (${timeoutMs}ms): ${tool.name}`));
      }, timeoutMs);

      tool.execute(args, this.workDir)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
  
  /**
   * 重试机制
   */
  private async retry<T>(
    fn: () => Promise<T>, 
    maxAttempts: number, 
    delayMs: number
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * 更新统计
   */
  private updateToolStats(toolName: string, success: boolean, executionTime: number): void {
    const stats = this.toolStats.get(toolName);
    if (stats) {
      stats.total++;
      if (success) stats.success++;
      else stats.failures++;
      stats.avgTime = (stats.avgTime * (stats.total - 1) + executionTime) / stats.total;
    }
  }
}

// 全局实例
export const toolManager = new ToolManager();
```

### 4.2 课程服务 (`src/services/courseService.ts`)

**功能**: 课程生成编排层，协调工具调用Agent和普通Agent。

```typescript
// ============================================
// 课程服务 - CourseService
// ============================================

interface GenerateCourseOptions {
  topic: string;
  subject: string;
  gradeLevel: number;
  useTools?: boolean;              // 是否使用工具模式
  onProgress?: (progress: any) => void;
}

class CourseService {
  private coursesDir: string;       // 课程存储目录
  private courseToolCallAgent: CourseToolCallAgent;
  private courseAgent: CourseAgent;
  
  constructor() {
    this.coursesDir = path.join(__dirname, '../../courses');
    this.ensureCoursesDirExists();
    
    // 初始化Agent
    this.courseToolCallAgent = new CourseToolCallAgent({
      workDir: this.coursesDir,
    });
    this.courseAgent = new CourseAgent();
  }
  
  /**
   * 生成课程入口
   */
  async generateCourse(options: GenerateCourseOptions): Promise<Course> {
    const { topic, subject, gradeLevel, useTools = true, onProgress } = options;
    
    try {
      if (useTools) {
        // 工具调用模式
        return await this.generateCourseWithTools(topic, subject, gradeLevel, onProgress);
      } else {
        // 非工具调用模式
        return await this.generateCourseWithoutTools(topic, subject, gradeLevel, onProgress);
      }
    } catch (error: any) {
      // 降级处理: 如果工具模式失败，尝试非工具模式
      if (useTools) {
        console.log('[CourseService] 降级到非工具生成模式');
        return await this.generateCourseWithoutTools(topic, subject, gradeLevel, onProgress);
      }
      throw error;
    }
  }
  
  /**
   * 工具调用模式生成
   */
  private async generateCourseWithTools(
    topic: string, subject: string, gradeLevel: number, onProgress?: Function
  ): Promise<Course> {
    const courseToolCallAgent = new CourseToolCallAgent({
      workDir: this.coursesDir,
      onProgress,
    });
    
    const result = await courseToolCallAgent.generate(topic, subject, gradeLevel);
    
    if (!result.success) {
      // 降级
      return await this.generateCourseWithoutTools(topic, subject, gradeLevel, onProgress);
    }
    
    const course: Course = {
      id: result.courseId,
      topic,
      subject,
      gradeLevel,
      createdAt: new Date().toISOString(),
      html: result.html,
      toolCalls: result.toolCalls,
      sections: this.extractSectionsFromHtml(result.html),
    };
    
    await this.saveCourse(course);
    return course;
  }
  
  /**
   * 非工具调用模式生成
   */
  private async generateCourseWithoutTools(
    topic: string, subject: string, gradeLevel: number, onProgress?: Function
  ): Promise<Course> {
    const result = await this.courseAgent.generate(topic, onProgress);
    
    const course: Course = {
      id: result.courseId || `course_${Date.now()}`,
      topic,
      subject,
      gradeLevel,
      createdAt: new Date().toISOString(),
      html: result.html,
      toolCalls: [],
      sections: this.extractSectionsFromHtml(result.html),
    };
    
    await this.saveCourse(course);
    return course;
  }
  
  /**
   * 从HTML提取章节
   */
  private extractSectionsFromHtml(html: string): CourseSection[] {
    const sections: CourseSection[] = [];
    
    // 提取概念讲解模块
    const conceptMatch = html.match(/<div[^>]*id=["']concept["'][^>]*>([\s\S]*?)<\/div>/i);
    if (conceptMatch) {
      sections.push({
        id: `section_${Date.now()}_1`,
        type: 'concept',
        title: '概念讲解',
        content: conceptMatch[1],
      });
    }
    
    // 提取图形演示模块
    const demoMatch = html.match(/<div[^>]*id=["']demo["'][^>]*>([\s\S]*?)<\/div>/i);
    if (demoMatch) {
      sections.push({
        id: `section_${Date.now()}_2`,
        type: 'demo',
        title: '图形演示',
        content: demoMatch[1],
      });
    }
    
    // 提取练习测试模块
    const exerciseMatch = html.match(/<div[^>]*id=["']exercise["'][^>]*>([\s\S]*?)<\/div>/i);
    if (exerciseMatch) {
      sections.push({
        id: `section_${Date.now()}_3`,
        type: 'exercise',
        title: '练习测试',
        content: exerciseMatch[1],
      });
    }
    
    return sections;
  }
  
  /**
   * 保存课程
   */
  private async saveCourse(course: Course): Promise<void> {
    const courseDir = path.join(this.coursesDir, course.id);
    
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }
    
    // 保存JSON
    const courseJsonPath = path.join(courseDir, 'course.json');
    fs.writeFileSync(courseJsonPath, JSON.stringify(course, null, 2));
    
    // 保存HTML
    const htmlPath = path.join(courseDir, 'index.html');
    fs.writeFileSync(htmlPath, course.html);
  }
  
  /**
   * 获取课程
   */
  async getCourse(id: string): Promise<Course | null> {
    const courseJsonPath = path.join(this.coursesDir, id, 'course.json');
    if (!fs.existsSync(courseJsonPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(courseJsonPath, 'utf8'));
  }
  
  /**
   * 列出所有课程
   */
  async listCourses(): Promise<Course[]> {
    const courseDirs = fs.readdirSync(this.coursesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const courses: Course[] = [];
    for (const courseId of courseDirs) {
      const course = await this.getCourse(courseId);
      if (course) courses.push(course);
    }
    
    return courses.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  
  /**
   * 删除课程
   */
  async deleteCourse(id: string): Promise<boolean> {
    const courseDir = path.join(this.coursesDir, id);
    if (!fs.existsSync(courseDir)) return false;
    
    try {
      fs.rmSync(courseDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

### 4.3 工具调用Agent (`src/services/courseToolCallAgent.ts`)

**功能**: 多轮对话式工具调用Agent，通过循环调用AI和工具完成任务。

```typescript
// ============================================
// 工具调用Agent - CourseToolCallAgent
// ============================================

interface CourseToolResult {
  success: boolean;
  html: string;
  courseId: string;
  iterations: number;
  toolCalls: ToolResult[];
  error?: string;
}

class CourseToolCallAgent {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private workDir: string;
  private maxIterations: number;    // 最大迭代次数，默认15
  private progressCallback?: AgentProgressCallback;
  private toolManager: ToolManager;
  private logger: AgentLogger;
  
  constructor(options: {
    workDir?: string;
    maxIterations?: number;
    onProgress?: AgentProgressCallback;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    toolManager?: ToolManager;
  } = {}) {
    this.apiKey = options.apiKey || process.env.DASHSCOPE_API_KEY || '';
    this.baseUrl = options.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.model = options.model || 'qwen-plus';
    this.workDir = options.workDir || './courses';
    this.maxIterations = options.maxIterations || 15;
    this.progressCallback = options.onProgress;
    this.toolManager = options.toolManager || toolManager;
    this.toolManager.setWorkDir(this.workDir);
    this.logger = new AgentLogger('CourseToolCallAgent');
  }
  
  /**
   * 主生成方法
   */
  async generate(prompt: string, subject: string, gradeLevel: number): Promise<CourseToolResult> {
    const courseId = `course_${Date.now()}`;
    const toolResults: ToolResult[] = [];
    let iterations = 0;
    let currentHtml = '';
    
    // 构建初始消息
    let messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: this.buildSystemPrompt(subject, gradeLevel, courseId) },
      { role: 'user', content: prompt },
    ];
    
    this.reportProgress({
      iteration: 0,
      stage: 'thinking',
      message: '开始使用工具生成课件...',
    });
    
    // 主循环
    while (iterations < this.maxIterations) {
      iterations++;
      
      this.reportProgress({
        iteration: iterations,
        stage: 'thinking',
        message: `第 ${iterations} 轮：正在思考和规划...`,
      });
      
      try {
        // 调用AI
        const response = await this.callAIWithTools(messages, iterations);
        messages.push({ role: 'assistant', content: response.content });
        
        // 检查完成条件
        if (this.checkCompletionCondition(response.content)) {
          if (!currentHtml) {
            // AI说完成但HTML未生成，继续
            messages.push({
              role: 'user',
              content: '你说了完成，但我还没有收到HTML内容。请使用save_course_html工具保存。',
            });
            continue;
          }
          
          this.reportProgress({
            iteration: iterations,
            stage: 'complete',
            message: '课件生成完成!',
          });
          
          return {
            success: true,
            html: currentHtml,
            courseId,
            iterations,
            toolCalls: toolResults,
          };
        }
        
        // 无工具调用
        if (!response.toolCalls || response.toolCalls.length === 0) {
          if (iterations >= this.maxIterations) {
            return {
              success: false,
              html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
              courseId,
              iterations,
              toolCalls: toolResults,
              error: '达到最大迭代次数',
            };
          }
          messages.push({
            role: 'user',
            content: '请继续使用工具完成任务。',
          });
          continue;
        }
        
        this.reportProgress({
          iteration: iterations,
          stage: 'tool_call',
          message: `执行 ${response.toolCalls.length} 个工具调用`,
          toolCalls: response.toolCalls.map(tc => ({
            name: tc.name,
            arguments: tc.arguments,
          })),
        });
        
        // 执行工具
        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(toolCall, courseId, currentHtml);
          toolResults.push(result);
          
          // 记录工具结果到消息
          const toolResultContent = result.success
            ? JSON.stringify(result.result, null, 2)
            : `错误: ${result.error}`;
          
          messages.push({
            role: 'tool',
            content: toolResultContent,
          });
          
          // 如果是保存HTML工具
          if (result.toolName === 'save_course_html' && result.success && result.result?.html) {
            currentHtml = result.result.html;
          }
        }
        
        this.reportProgress({
          iteration: iterations,
          stage: 'tool_result',
          message: `工具执行完成: ${toolResults.filter(r => r.success).length}/${toolResults.length} 成功`,
          toolResults,
        });
        
      } catch (error: any) {
        console.error(`[CourseToolCallAgent] 第 ${iterations} 轮执行失败:`, error.message);
        
        if (iterations >= this.maxIterations) {
          return {
            success: false,
            html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
            courseId,
            iterations,
            toolCalls: toolResults,
            error: error.message,
          };
        }
        
        messages.push({
          role: 'user',
          content: `发生错误: ${error.message}，请继续尝试生成课件。`,
        });
      }
    }
    
    return {
      success: currentHtml.length > 0,
      html: currentHtml || this.generateFallbackHtml(prompt, subject, gradeLevel),
      courseId,
      iterations,
      toolCalls: toolResults,
      error: currentHtml.length > 0 ? undefined : '生成失败',
    };
  }
  
  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(subject: string, gradeLevel: number, courseId: string): string {
    return `你是小学${gradeLevel}年级${subject}课件生成专家，可以使用工具来生成精美的互动课件。

## 重要提示
本次课程的唯一标识ID是: ${courseId}
在调用 save_course_html 工具时，必须使用这个 course_id: "${courseId}"，不要自行编造其他ID。

## 可用工具
### generate_svg
生成SVG矢量图形，用于可视化数学概念。
参数: shape_type, dimensions, label, style

### generate_html_component
生成HTML组件代码，如公式卡片、步骤展示、练习题等。
参数: component_type, content, style

### validate_html
验证HTML代码的有效性和完整性。
参数: html_code

### search_educational_content
使用百度搜索API搜索相关的教育教学内容作为参考。
参数: query, grade_level, subject

### save_course_html
保存生成的课件HTML文件。
参数: filename, html_content, course_id
**重要**: course_id 必须使用 "${courseId}"

## 课件要求
1. 必须生成完整的HTML页面，包含<!DOCTYPE html>、<html>、<head>、<body>标签
2. 页面必须包含三个主要模块：
   - id="concept": 概念讲解模块
   - id="demo": 图形演示模块（使用Canvas或SVG）
   - id="exercise": 练习测试模块
3. 使用现代化设计，包含渐变色、阴影、动画效果
4. 所有数学公式和概念用中文清晰解释
5. 练习题要有即时反馈

## 工作流程
1. 搜索相关教学资料
2. 生成必要的SVG图形
3. 生成HTML组件
4. 组装完整课件
5. 验证HTML有效性
6. 保存课件文件

## 结束条件
当课件生成并保存完成后，必须在回复中包含"完成"或"DONE"。`;
  }
  
  /**
   * 调用AI(带工具)
   */
  private async callAIWithTools(
    messages: Array<{ role: string; content: string }>,
    iteration: number
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const tools = this.toolManager.getTools();
    const apiEndpoint = `${this.baseUrl}/chat/completions`;
    
    const requestBody: any = {
      model: this.model,
      messages,
      stream: false,
    };
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }
    
    // 带超时检测的重试
    const response = await this.retryWithTimeout(
      () => axios.post(apiEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 360000, // 6分钟超时
      }),
      3,      // 最大尝试3次
      2000,   // 延迟2秒
      300000  // 5分钟超时检测
    );
    
    const assistantMessage = response.data.choices?.[0]?.message;
    const content = assistantMessage?.content || '';
    const toolCalls: ToolCall[] = [];
    
    if (assistantMessage?.tool_calls) {
      for (const tc of assistantMessage.tool_calls) {
        toolCalls.push({
          id: tc.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: tc.function?.name || '',
          arguments: this.toolManager.parseToolCallArgs(tc.function?.arguments || {}),
        });
      }
    }
    
    return { content, toolCalls };
  }
  
  /**
   * 执行工具
   */
  private async executeTool(
    toolCall: ToolCall, 
    courseId: string, 
    currentHtml: string
  ): Promise<ToolResult> {
    try {
      // 强制使用正确的课程ID
      if (toolCall.name === 'save_course_html') {
        toolCall.arguments.course_id = courseId;
      }
      
      const result = await this.retry(
        () => this.toolManager.executeTool(toolCall),
        2,      // 重试2次
        1000
      );
      
      // 推送草稿内容
      if (result.result && typeof result.result === 'object') {
        if (result.result.svg_code) {
          this.reportProgress({
            iteration: 0,
            stage: 'tool_result',
            message: '生成了SVG图形草稿',
            draft_content: { type: 'svg', title: 'SVG图形', content: result.result.svg_code },
          });
        }
        if (result.result.html_content) {
          this.reportProgress({
            iteration: 0,
            stage: 'tool_result',
            message: '生成了HTML内容草稿',
            draft_content: { type: 'html', title: 'HTML内容', content: result.result.html_content },
          });
        }
      }
      
      return result;
    } catch (error: any) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * 检查完成条件
   */
  private checkCompletionCondition(content: string): boolean {
    const upperContent = content.toUpperCase();
    const completionKeywords = ['完成', 'DONE', 'FINISH', '任务完成', '所有文件已生成'];
    return completionKeywords.some(k => upperContent.includes(k.toUpperCase()));
  }
  
  /**
   * 生成降级HTML
   */
  private generateFallbackHtml(prompt: string, subject: string, gradeLevel: number): string {
    const topic = prompt.replace(/[？?]/, '');
    // 返回基础模板HTML...
    return `<!DOCTYPE html>...`; // 完整降级模板见源码
  }
  
  /**
   * 带超时检测的重试
   */
  private async retryWithTimeout<T>(
    fn: () => Promise<T>, 
    maxAttempts: number, 
    delayMs: number, 
    timeoutMs: number
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`AI调用超时（超过 ${timeoutMs/1000/60} 分钟）`));
          }, timeoutMs);
        });
        
        return await Promise.race([fn(), timeoutPromise]);
      } catch (error: any) {
        lastError = error;
        console.warn(`尝试 ${attempt}/${maxAttempts} 失败: ${error.message}`);
        
        if (error.message.includes('超时') && attempt < maxAttempts) {
          // 压缩提示词后重试
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        } else if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * 压缩提示词(超时降级)
   */
  private compressMessages(
    messages: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    const compressed: Array<{ role: string; content: string }> = [];
    
    // 保留系统消息(简化)
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      compressed.push({ role: 'system', content: this.simplifySystemPrompt(systemMessage.content) });
    }
    
    // 保留最近6条消息(3轮对话)
    const recentMessages = messages.filter(msg => msg.role !== 'system').slice(-6);
    compressed.push(...recentMessages);
    
    return compressed;
  }
  
  /**
   * 简化系统提示
   */
  private simplifySystemPrompt(systemPrompt: string): string {
    const courseId = this.extractCourseId(systemPrompt);
    return `你是小学课件生成专家，可以使用工具生成互动课件。
    课程ID: ${courseId}
    工具: generate_svg, generate_html_component, validate_html, search_educational_content, save_course_html
    要求: 完整HTML，三个模块(concept/demo/exercise)，Canvas动画，练习题即时反馈
    完成后回复包含"完成"。`;
  }
  
  private reportProgress(progress: AgentProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
  
  private async retry<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    throw lastError;
  }
}
```

### 4.4 课程Agent (`src/services/courseAgent.ts`)

**功能**: 单轮生成和多轮调优，支持Web搜索、本地搜索、重试机制。

```typescript
// ============================================
// 课程Agent - CourseAgent
// ============================================

interface GenerationResult {
  success: boolean;
  html: string;
  courseId?: string;
  validation?: ValidationResult;
  qualityScore?: QualityScore;
  attempts: number;
  duration: number;
  error?: GenerationError;
}

class CourseAgent {
  private client: OpenCodeClient;
  private validator: HtmlValidator;
  private codeValidator: CodeValidator;
  private webSearch: WebSearchService;
  private localSearch: LocalKnowledgeSearch;
  private refinementLoop: RefinementLoop;
  private options: GenerationOptions;
  
  constructor(options: Partial<GenerationOptions> = {}) {
    this.client = new OpenCodeClient();
    this.validator = htmlValidator;
    this.codeValidator = codeValidator;
    this.webSearch = webSearchService;
    this.localSearch = localKnowledgeSearch;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    this.refinementLoop = new RefinementLoop({
      maxRefinementAttempts: this.options.maxRefinementAttempts,
      threshold: this.options.qualityThreshold,
    });
  }
  
  /**
   * 多轮调优生成
   */
  async generateWithRefinement(
    prompt: string,
    onProgress?: ProgressCallback,
    courseId?: string
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    
    if (!this.options.enableQualityRefinement) {
      return this.generate(prompt, onProgress, courseId);
    }
    
    const refinementProgressCallback: RefinementProgressCallback = (progress) => {
      if (onProgress) {
        onProgress({
          stage: this.mapRefinementStatus(progress.status),
          message: progress.message,
          timestamp: Date.now(),
          retryCount: progress.currentAttempt,
          qualityScore: progress.currentScore ? {
            overall: progress.currentScore.overall,
            passed: progress.currentScore.passed,
            dimensions: progress.currentScore.dimensions,
          } : undefined,
          issues: progress.issues,
        });
      }
    };
    
    try {
      const result = await this.refinementLoop.execute(prompt, refinementProgressCallback);
      
      return {
        success: result.success,
        html: result.html,
        courseId: courseId || this.generateCourseId(prompt),
        qualityScore: result.finalScore,
        attempts: result.context.attempts,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        html: '',
        courseId,
        attempts: 1,
        duration: Date.now() - startTime,
        error: new GenerationError(`多轮调优失败: ${error.message}`, GenerationErrorType.API_ERROR, error, true),
      };
    }
  }
  
  /**
   * 单轮生成
   */
  async generate(
    prompt: string,
    onProgress?: ProgressCallback,
    courseId?: string
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: GenerationError | undefined;
    let searchResults: SearchResult[] = [];
    let enrichedPrompt = prompt;
    
    // 1. 搜索相关资料
    if (this.options.enableWebSearch && this.webSearch.isConfigured()) {
      onProgress?.({ stage: 'search', message: '正在搜索相关教学资料...', timestamp: Date.now() });
      
      const topic = this.extractTopic(prompt);
      searchResults = await this.webSearch.searchEducationalContent(topic);
      
      if (searchResults.length > 0) {
        enrichedPrompt = this.enrichPromptWithSearch(prompt, searchResults);
      }
    }
    
    if (this.options.enableLocalSearch && searchResults.length === 0) {
      onProgress?.({ stage: 'search', message: '正在本地知识库搜索...', timestamp: Date.now() });
      
      const topic = this.extractTopic(prompt);
      searchResults = this.localSearch.search(topic);
      
      if (searchResults.length > 0) {
        enrichedPrompt = this.enrichPromptWithSearch(prompt, searchResults);
      }
    }
    
    // 2. 重试循环
    while (attempts < this.options.maxRetries) {
      attempts++;
      
      const currentPrompt = attempts > 1 && lastError
        ? this.enrichPromptWithError(prompt, lastError, [])
        : enrichedPrompt;
      
      onProgress?.({
        stage: 'api_call',
        message: `正在调用AI模型 (第${attempts}次尝试)...`,
        timestamp: Date.now(),
        retryCount: attempts - 1,
      });
      
      try {
        // 调用API
        const rawResponse = await this.client.generateWithPrompt(currentPrompt);
        
        onProgress?.({ stage: 'parse', message: '解析AI响应...', timestamp: Date.now() });
        
        // 解析和验证HTML
        const extractedHtml = this.validator.extractHtml(rawResponse);
        const sanitizedHtml = this.validator.sanitize(extractedHtml);
        
        if (this.options.enableValidation) {
          onProgress?.({ stage: 'validate', message: '验证HTML有效性...', timestamp: Date.now() });
          
          const validation = this.validator.validate(sanitizedHtml);
          
          if (!validation.isValid && attempts < this.options.maxRetries) {
            lastError = new GenerationError(
              `HTML验证失败: ${validation.errors.map(e => e.message).join('; ')}`,
              GenerationErrorType.VALIDATION_ERROR,
              undefined,
              true
            );
            await this.delay(this.options.retryDelayMs * attempts);
            continue;
          }
        }
        
        onProgress?.({ stage: 'complete', message: '生成完成!', timestamp: Date.now() });
        
        return {
          success: true,
          html: sanitizedHtml,
          courseId: courseId || this.generateCourseId(prompt),
          attempts,
          duration: Date.now() - startTime,
        };
        
      } catch (error: any) {
        lastError = this.classifyError(error);
        
        onProgress?.({
          stage: 'error',
          message: `错误: ${lastError.message}`,
          timestamp: Date.now(),
          retryCount: attempts,
        });
        
        if (!lastError.retryable || attempts >= this.options.maxRetries) {
          break;
        }
        
        const delay = this.options.retryDelayMs * Math.pow(2, attempts - 1);
        await this.delay(delay);
      }
    }
    
    return {
      success: false,
      html: '',
      courseId,
      attempts,
      duration: Date.now() - startTime,
      error: lastError || new GenerationError('生成失败', GenerationErrorType.UNKNOWN_ERROR),
    };
  }
  
  /**
   * 错误分类
   */
  private classifyError(error: any): GenerationError {
    const message = error.message || String(error);
    
    if (message.includes('timeout')) {
      return new GenerationError(`请求超时: ${message}`, GenerationErrorType.TIMEOUT_ERROR, error, true);
    }
    
    if (message.includes('401') || message.includes('403') || message.includes('API key')) {
      return new GenerationError(`API认证失败: ${message}`, GenerationErrorType.API_ERROR, error, false);
    }
    
    if (message.includes('rate') || message.includes('quota')) {
      return new GenerationError(`API限流: ${message}`, GenerationErrorType.API_ERROR, error, true);
    }
    
    return GenerationError.fromOriginal(error, GenerationErrorType.API_ERROR, `API调用失败: ${message}`);
  }
  
  /**
   * 提取主题
   */
  private extractTopic(prompt: string): string {
    const questionMatch = prompt.match(/[\u4e00-\u9fa5]+[？?]/);
    if (questionMatch) {
      return questionMatch[0].replace(/[？?]/, '');
    }
    
    const words = prompt.split(/[\s,，。.]+/).filter(w => w.length > 2);
    return words[0] || prompt.substring(0, 20);
  }
  
  /**
   * 丰富Prompt(搜索结果)
   */
  private enrichPromptWithSearch(prompt: string, searchResults: SearchResult[]): string {
    const searchContext = searchResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n');
    
    return `${prompt}

---
参考信息（来自搜索）：
${searchContext}

请根据以上参考信息生成更加准确和丰富的课件内容。`;
  }
  
  /**
   * 丰富Prompt(错误信息)
   */
  private enrichPromptWithError(
    originalPrompt: string, 
    error: GenerationError,
    validationErrors: ValidationError[]
  ): string {
    return `${originalPrompt}

---
【上一步生成失败，请修复以下问题后重新生成】

失败原因: ${error.message}

具体错误列表:
${validationErrors.map((e, i) => `${i + 1}. [${e.code}] ${e.message}`).join('\n')}

请确保:
1. HTML结构完整，包含 <!DOCTYPE html>, <html>, <head>, <body> 标签
2. 必须包含三个模块: id="concept", id="demo", id="exercise"
3. Canvas元素必须有id属性并正确初始化getContext('2d')
4. JavaScript代码放在<script>标签内，语法正确

请直接输出完整的HTML代码，不要包含任何markdown代码块标记。`;
  }
  
  private generateCourseId(prompt: string): string {
    const hash = prompt.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `course_${Math.abs(hash).toString(36)}_${Date.now()}`;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private mapRefinementStatus(status: RefinementStatus): GenerationProgress['stage'] {
    const map: Record<RefinementStatus, GenerationProgress['stage']> = {
      [RefinementStatus.IDLE]: 'prompt',
      [RefinementStatus.GENERATING]: 'api_call',
      [RefinementStatus.REVIEWING]: 'review',
      [RefinementStatus.FIXING]: 'refine',
      [RefinementStatus.PASSED]: 'complete',
      [RefinementStatus.FAILED]: 'error',
    };
    return map[status] || 'validate';
  }
}

export const courseAgent = new CourseAgent();
```

### 4.5 质量审查器 (`src/services/courseReviewer.ts`)

**功能**: 评估课件质量，从教学设计、内容质量、交互设计、安全合规、格式规范五个维度评分。

```typescript
// ============================================
// 质量审查器 - CourseReviewer
// ============================================

interface ReviewCriteria {
  pattern: RegExp;
  weight: number;
  message: string;
  category: QualityIssue['category'];
  severity: QualityIssue['severity'];
}

class CourseReviewer {
  private criteria: ReviewCriteria[];
  private threshold: QualityThreshold;
  
  constructor(threshold: Partial<QualityThreshold> = {}) {
    this.threshold = { ...DEFAULT_QUALITY_THRESHOLD, ...threshold };
    this.criteria = this.buildCriteria();
  }
  
  /**
   * 审查课件
   */
  review(html: string, prompt?: string): QualityScore {
    const issues: QualityIssue[] = [];
    
    // 1. 正则模式匹配检查
    for (const criterion of this.criteria) {
      const match = criterion.pattern.test(html);
      if (!match || (criterion.pattern.global && !criterion.pattern.exec(html))) {
        issues.push({
          severity: criterion.severity,
          category: criterion.category,
          message: criterion.message,
          suggestion: this.getSuggestion(criterion),
        });
      }
      criterion.pattern.lastIndex = 0;
    }
    
    // 2. 内容审查
    issues.push(...this.reviewContent(html, prompt));
    
    // 3. 交互审查
    issues.push(...this.reviewInteraction(html));
    
    // 4. 安全审查
    issues.push(...this.reviewSafety(html));
    
    // 5. 计算维度得分
    const dimensions = this.calculateDimensions(issues);
    const overall = this.calculateOverallScore(dimensions);
    
    return {
      overall,
      dimensions,
      issues,
      passed: this.checkPass(overall, dimensions),
    };
  }
  
  /**
   * 构建审查标准
   */
  private buildCriteria(): ReviewCriteria[] {
    return [
      // 格式检查
      { pattern: /<!DOCTYPE\s+html>/i, weight: 10, message: '缺少 DOCTYPE 声明', category: 'format', severity: 'critical' },
      { pattern: /<html[^>]*>/i, weight: 10, message: '缺少 <html> 标签', category: 'format', severity: 'critical' },
      { pattern: /<head[^>]*>[\s\S]*<\/head>/i, weight: 10, message: '缺少 <head> 标签', category: 'format', severity: 'critical' },
      { pattern: /<body[^>]*>[\s\S]*<\/body>/i, weight: 10, message: '缺少 <body> 标签', category: 'format', severity: 'critical' },
      
      // 必需模块检查
      { pattern: /id=["']concept["']/i, weight: 15, message: '缺少概念讲解模块 (id="concept")', category: 'format', severity: 'critical' },
      { pattern: /id=["']demo["']/i, weight: 15, message: '缺少图形演示模块 (id="demo")', category: 'format', severity: 'critical' },
      { pattern: /id=["']exercise["']/i, weight: 15, message: '缺少练习测试模块 (id="exercise")', category: 'format', severity: 'critical' },
      
      // Canvas检查
      { pattern: /<canvas[^>]+id=["'][^"']+["'][^>]*>/i, weight: 12, message: 'Canvas 元素缺少 id 属性', category: 'format', severity: 'critical' },
      { pattern: /getContext\s*\(\s*["']2d["']\s*\)/i, weight: 12, message: 'Canvas 未正确初始化 getContext', category: 'format', severity: 'critical' },
      
      // JavaScript检查
      { pattern: /<script[^>]*>[\s\S]*?<\/script>/gi, weight: 10, message: 'JavaScript 代码格式错误', category: 'format', severity: 'warning' },
      
      // 内容长度检查
      { pattern: /[\u4e00-\u9fa5]{50,}/i, weight: 5, message: '存在过长的中文段落，建议拆分', category: 'pedagogy', severity: 'info' },
    ];
  }
  
  /**
   * 内容审查
   */
  private reviewContent(html: string, prompt?: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    
    // 检查是否有教育内容
    if (!/[\u4e00-\u9fa5]{20,}/.test(html)) {
      issues.push({
        severity: 'critical',
        category: 'content',
        message: '缺少教学内容或内容过短',
        suggestion: '请添加详细的教育内容',
      });
    }
    
    // 检查段落数量
    const paragraphCount = (html.match(/<p[^>]*>/gi) || []).length;
    if (paragraphCount < 3) {
      issues.push({
        severity: 'warning',
        category: 'pedagogy',
        message: '内容段落过少，建议添加更多解释性内容',
        suggestion: '每个概念至少包含一个解释段落',
      });
    }
    
    return issues;
  }
  
  /**
   * 交互审查
   */
  private reviewInteraction(html: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    
    // 检查按钮数量
    const buttonCount = (html.match(/<button/gi) || []).length;
    if (buttonCount < 2) {
      issues.push({
        severity: 'warning',
        category: 'interaction',
        message: '交互元素过少',
        suggestion: '添加更多按钮、输入框等交互元素',
      });
    }
    
    // 检查Canvas动画
    if (/<canvas/i.test(html) && !/requestAnimationFrame|setInterval|animate\(/i.test(html)) {
      issues.push({
        severity: 'info',
        category: 'interaction',
        message: 'Canvas 存在但缺少动画效果',
        suggestion: '添加动画效果使演示更生动',
      });
    }
    
    return issues;
  }
  
  /**
   * 安全审查
   */
  private reviewSafety(html: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    
    const dangerousPatterns = [
      { pattern: /eval\s*\(/i, message: '发现 eval() 使用，存在安全风险' },
      { pattern: /document\.write\s*\(/i, message: '发现 document.write() 使用，存在 XSS 风险' },
      { pattern: /innerHTML\s*=\s*[^"']*\$/i, message: 'innerHTML 赋值可能存在 XSS 风险' },
    ];
    
    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(html)) {
        issues.push({
          severity: 'critical',
          category: 'safety',
          message,
          suggestion: '请使用更安全的 DOM 操作方式',
        });
      }
      pattern.lastIndex = 0;
    }
    
    return issues;
  }
  
  /**
   * 计算维度得分
   */
  private calculateDimensions(issues: QualityIssue[]): QualityScore['dimensions'] {
    const dimensionIssues = {
      pedagogy: 0,
      content: 0,
      interaction: 0,
      safety: 0,
      format: 0,
    };
    
    for (const issue of issues) {
      const severityWeight = issue.severity === 'critical' ? 30 : 
                            issue.severity === 'warning' ? 15 : 5;
      dimensionIssues[issue.category] += severityWeight;
    }
    
    return {
      pedagogy: Math.max(0, 100 - dimensionIssues.pedagogy * 1.5),
      content: Math.max(0, 100 - dimensionIssues.content * 1.5),
      interaction: Math.max(0, 100 - dimensionIssues.interaction * 1.5),
      safety: Math.max(0, 100 - dimensionIssues.safety * 2),
      format: Math.max(0, 100 - dimensionIssues.format * 1.2),
    };
  }
  
  /**
   * 计算总分
   */
  private calculateOverallScore(dimensions: QualityScore['dimensions']): number {
    const weights = {
      pedagogy: 0.25,
      content: 0.25,
      interaction: 0.20,
      safety: 0.20,
      format: 0.10,
    };
    
    return Math.round(
      dimensions.pedagogy * weights.pedagogy +
      dimensions.content * weights.content +
      dimensions.interaction * weights.interaction +
      dimensions.safety * weights.safety +
      dimensions.format * weights.format
    );
  }
  
  /**
   * 检查是否通过
   */
  private checkPass(overall: number, dimensions: QualityScore['dimensions']): boolean {
    if (overall < this.threshold.overall) return false;
    if (dimensions.pedagogy < this.threshold.pedagogy) return false;
    if (dimensions.content < this.threshold.content) return false;
    if (dimensions.interaction < this.threshold.interaction) return false;
    if (dimensions.safety < this.threshold.safety) return false;
    if (dimensions.format < this.threshold.format) return false;
    
    // 安全必须100%
    if (dimensions.safety < 100) return false;
    
    return true;
  }
  
  /**
   * 生成修复Prompt
   */
  generateFixPrompt(html: string, score: QualityScore): string {
    const criticalIssues = score.issues.filter(i => i.severity === 'critical');
    const warningIssues = score.issues.filter(i => i.severity === 'warning');
    
    let prompt = `请修复以下课件中的问题：\n当前得分: ${score.overall}/100\n`;
    
    if (criticalIssues.length > 0) {
      prompt += '\n【必须修复的问题】\n';
      criticalIssues.forEach((issue, index) => {
        prompt += `${index + 1}. ${issue.message}`;
        if (issue.suggestion) prompt += ` → ${issue.suggestion}`;
        prompt += '\n';
      });
    }
    
    if (warningIssues.length > 0) {
      prompt += '\n【建议修复的问题】\n';
      warningIssues.forEach((issue, index) => {
        prompt += `${index + 1}. ${issue.message}`;
        if (issue.suggestion) prompt += ` → ${issue.suggestion}`;
        prompt += '\n';
      });
    }
    
    prompt += '\n请直接输出修复后的完整 HTML 代码。';
    
    return prompt;
  }
}

export const courseReviewer = new CourseReviewer();
```

### 4.6 课件调整服务 (`src/services/courseAdjustmentService.ts`)

**功能**: 多轮交互式课件修改，支持会话管理、历史记录、回滚。

```typescript
// ============================================
// 课件调整服务 - CourseAdjustmentService
// ============================================

class CourseAdjustmentService {
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
  
  /**
   * 列出所有可调整的课件
   */
  async listCourses(): Promise<ListCoursesResponse> {
    const courses: CourseInfo[] = [];
    const entries = fs.readdirSync(this.coursesDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const courseInfo = await this.getCourseInfoFromDir(entry.name);
        if (courseInfo) courses.push(courseInfo);
      }
    }
    
    courses.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return { success: true, courses, total: courses.length };
  }
  
  /**
   * 创建调整会话
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
  
  /**
   * 处理调整请求
   */
  async processAdjustment(
    request: AdjustmentRequest,
    onProgress?: (progress: AdjustmentProgress) => void,
    onLog?: (log: LogMessage) => void
  ): Promise<AdjustmentResponse> {
    try {
      let session: AdjustmentSession | null = null;
      
      if (request.sessionId) {
        session = await this.getSession(request.sessionId);
        if (!session) {
          throw new Error(`会话不存在: ${request.sessionId}`);
        }
      } else {
        session = await this.createSession(request.courseId);
      }
      
      if (onProgress) {
        this.progressCallbacks.set(session.sessionId, onProgress);
      }
      if (onLog) {
        this.logCallbacks.set(session.sessionId, onLog);
      }
      
      // 记录用户消息
      const userMessage: ConversationMessage = {
        id: generateId(),
        role: 'user',
        content: request.userRequest,
        timestamp: new Date(),
      };
      session.conversationHistory.push(userMessage);
      
      this.reportProgress(session.sessionId, 'analyzing', '正在分析您的修改请求...', 10);
      this.reportProgress(session.sessionId, 'planning', '正在规划修改方案...', 30);
      
      // 构建消息
      const systemPrompt = this.buildSystemPrompt(session);
      const messages = this.buildMessages(session, systemPrompt);
      
      this.reportProgress(session.sessionId, 'executing', '正在执行修改...', 50);
      
      // 调用AI
      const aiResponse = await this.callAI(messages, session, onLog);
      
      this.reportProgress(session.sessionId, 'validating', '正在验证修改结果...', 80);
      
      // 创建调整记录
      const adjustmentRecord = await this.createAdjustmentRecord(
        session,
        request.userRequest,
        aiResponse.content,
        aiResponse.html
      );
      
      session.adjustmentHistory.push(adjustmentRecord);
      session.currentHtml = aiResponse.html;
      session.updatedAt = new Date();
      
      // 记录AI消息
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
      
      await this.saveSession(session);
      
      this.reportProgress(session.sessionId, 'complete', '修改完成!', 100);
      
      return {
        success: true,
        sessionId: session.sessionId,
        message: aiResponse.content,
        html: aiResponse.html,
        conversationHistory: session.conversationHistory,
        adjustmentRecord,
      };
    } catch (error: any) {
      return {
        success: false,
        sessionId: request.sessionId || '',
        error: error.message,
      };
    }
  }
  
  /**
   * 构建系统提示词
   */
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
  
  /**
   * 构建消息列表
   */
  private buildMessages(session: AdjustmentSession, systemPrompt: string): any[] {
    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    
    if (session.conversationHistory.length === 0) {
      messages.push({
        role: 'user',
        content: `这是当前的课件HTML内容，请先分析一下这个课件的结构和内容：\n\n\`\`\`html\n${session.currentHtml}\n\`\`\``,
      });
    } else {
      for (const msg of session.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    return messages;
  }
  
  /**
   * 调用AI
   */
  private async callAI(
    messages: any[],
    session: AdjustmentSession,
    onLog?: (log: LogMessage) => void
  ): Promise<{ content: string; html: string; toolCalls: any[]; processingTime: number }> {
    const startTime = Date.now();
    const toolCalls: any[] = [];
    let currentHtml = '';
    let lastContent = '';
    
    const apiKey = process.env.OPENAI_API_KEY || process.env.DASHSCOPE_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = process.env.OPENAI_MODEL || 'qwen-plus';
    
    const tools = [
      {
        type: 'function',
        function: {
          name: 'save_course_html',
          description: '保存修改后的HTML课件内容',
          parameters: {
            type: 'object',
            properties: {
              html_content: { type: 'string', description: '完整的HTML课件内容' },
              changes_summary: { type: 'string', description: '修改内容摘要' },
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
              query: { type: 'string', description: '搜索关键词' },
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
              description: { type: 'string', description: '图形描述' },
              diagram_type: { type: 'string', description: '图形类型' },
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
      
      if (!response.ok) {
        throw new Error(`AI调用失败: ${response.status}`);
      }
      
      const data = await response.json();
      const choice = data.choices[0];
      const message = choice.message;
      
      if (message.content) {
        lastContent = message.content;
        messages.push({ role: 'assistant', content: message.content });
      }
      
      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);
        
        for (const tc of message.tool_calls) {
          const functionName = tc.function.name;
          const functionArgs = JSON.parse(tc.function.arguments);
          
          let functionResult: any;
          
          if (functionName === 'save_course_html') {
            currentHtml = functionArgs.html_content;
            functionResult = { success: true, message: 'HTML内容已保存' };
          } else if (functionName === 'search_educational_content') {
            const toolCallObj = {
              id: tc.id,
              name: functionName,
              arguments: { ...functionArgs, grade_level: session.courseInfo.gradeLevel, subject: session.courseInfo.subject },
            };
            functionResult = await toolManager.executeTool(toolCallObj);
          } else if (functionName === 'generate_svg_diagram') {
            const toolCallObj = { id: tc.id, name: functionName, arguments: functionArgs };
            functionResult = await toolManager.executeTool(toolCallObj);
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
        break;
      }
    }
    
    if (!currentHtml) {
      currentHtml = this.extractHtmlFromContent(lastContent);
    }
    
    return {
      content: lastContent,
      html: currentHtml,
      toolCalls,
      processingTime: Date.now() - startTime,
    };
  }
  
  /**
   * 回滚
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
      return { success: false, html: '', message: '', error: error.message };
    }
  }
  
  /**
   * 验证HTML
   */
  async validateHtml(html: string): Promise<ValidateAdjustmentResponse> {
    const issues: ValidationIssue[] = [];
    
    if (!html.includes('<!DOCTYPE html>')) {
      issues.push({ severity: 'warning', category: 'structure', message: '缺少DOCTYPE声明' });
    }
    
    // 标签闭合检查...
    
    return {
      success: true,
      isValid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      suggestions: [],
    };
  }
  
  private reportProgress(sessionId: string, stage: AdjustmentProgress['stage'], message: string, progress: number): void {
    const callback = this.progressCallbacks.get(sessionId);
    if (callback) {
      callback({ sessionId, stage, message, progress, timestamp: new Date() });
    }
  }
  
  private async saveSession(session: AdjustmentSession): Promise<void> {
    const sessionPath = path.join(this.sessionsDir, `${session.sessionId}.json`);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    this.sessions.set(session.sessionId, session);
  }
  
  private async getSession(sessionId: string): Promise<AdjustmentSession | null> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }
    
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      this.sessions.set(sessionId, data);
      return data;
    }
    
    return null;
  }
}
```

---

## 5. API接口设计

### 5.1 课程生成API (`src/api/course.ts`)

```yaml
# 健康检查
GET /api/course/health
Response:
  status: "ok"
  timestamp: "2026-03-29T..."
  mock_mode: false
  refinement_mode: "available"

# 质量信息
GET /api/course/quality-info
Response:
  description: "Claude Code Solo Mode 多轮调优机制"
  thresholds:
    overall: 75
    pedagogy: 70
    content: 70
    interaction: 60
    safety: 100
    format: 60
  max_refinement_attempts: 3

# 生成课程
POST /api/course/generate
Content-Type: application/json

Request:
{
  "user_question": "分数的加减法怎么做？",
  "subject": "数学",
  "grade_level": 3,
  "stream": false,              # 可选，是否流式
  "enable_refinement": true,   # 可选，启用多轮调优
  "use_tools": true            # 可选，启用工具调用模式
}

Response (非流式):
{
  "success": true,
  "course_id": "course_xxx",
  "html_content": "<!DOCTYPE html>..."
}

Response (流式 - text/event-stream):
data: {"stage":"prompt","message":"正在准备...","timestamp":...}
data: {"stage":"api_call","message":"正在调用AI...","timestamp":...}
data: {"stage":"complete","message":"生成完成!","timestamp":...,"course_id":"..."}

# 列出课程
GET /api/course/list
Response:
{
  "success": true,
  "courses": [...],
  "total": 5
}

# 获取课程详情
GET /api/course/:courseId
Response:
{
  "success": true,
  "course": {
    "id": "...",
    "topic": "...",
    "html": "...",
    ...
  }
}

# Agent执行
POST /api/course/agent/execute
Request:
{
  "prompt": "生成一个正方形面积课件",
  "work_dir": "./courses",
  "max_iterations": 15,
  "stream": false
}
```

### 5.2 课件调整API (`src/api/adjustment.ts`)

```yaml
# 列出可调整的课件
GET /api/adjustment/courses
Response:
{
  "success": true,
  "courses": [
    { "id": "...", "topic": "...", "subject": "数学", "gradeLevel": 3 }
  ],
  "total": 1
}

# 获取课件详情
GET /api/adjustment/courses/:courseId

# 创建调整会话
POST /api/adjustment/sessions
Request:
{ "courseId": "course_xxx" }
Response:
{
  "success": true,
  "session": {
    "sessionId": "...",
    "courseId": "...",
    "status": "active"
  }
}

# 获取会话
GET /api/adjustment/sessions/:sessionId

# 提交调整请求
POST /api/adjustment/adjust
Request:
{
  "sessionId": "...",
  "courseId": "course_xxx",
  "userRequest": "把标题改成蓝色的",
  "stream": false
}
Response:
{
  "success": true,
  "sessionId": "...",
  "message": "已修改标题颜色...",
  "html": "<!DOCTYPE html>...",
  "adjustmentRecord": {...}
}

# 回滚
POST /api/adjustment/rollback
Request:
{ "sessionId": "...", "adjustmentId": "..." }
Response:
{ "success": true, "html": "...", "message": "已回滚" }

# 验证HTML
POST /api/adjustment/validate
Request:
{ "html": "<!DOCTYPE html>..." }
Response:
{ "success": true, "isValid": true, "issues": [], "suggestions": [] }

# 保存最终课件
POST /api/adjustment/save-final
Request:
{ "sessionId": "..." }
Response:
{ "success": true, "filePath": "./courses/adjusted_xxx.html" }
```

---

## 6. Prompt模板 (`src/skills/coursePrompt.ts`)

### 6.1 系统Prompt

```typescript
export const COURSE_SYSTEM_PROMPT = `你是资深小学数学教师，有10年教学经验，擅长用生动有趣的方式向小学生解释数学概念。

## 核心任务
根据用户问题，生成一份完整的小学数学互动HTML课件。

## 严格输出要求
1. 只输出HTML代码，不要任何解释、注释或代码块标记
2. 响应必须以<!DOCTYPE html>开头
3. 使用单文件架构（HTML + CSS + JS 在一个文件内）
4. 必须包含三个学习模块：概念讲解、图形演示、练习测试
5. 使用HTML5 Canvas进行所有图形绘制
6. 使用requestAnimationFrame实现动画效果

## HTML结构模板
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <style>/* CSS样式 */</style>
</head>
<body>
    <div class="header">...</div>
    <div class="nav-tabs">...</div>
    <div class="main-content">
        <div id="concept" class="tab-content active">...</div>
        <div id="demo" class="tab-content">...</div>
        <div id="exercise" class="tab-content">...</div>
    </div>
    <script>/* JavaScript代码 */</script>
</body>
</html>

## Canvas绘制规范
1. 获取画布: const canvas = document.getElementById('canvas-id'); const ctx = canvas.getContext('2d');
2. 绘制: ctx.beginPath(), ctx.arc()/ctx.rect(), ctx.fill(), ctx.stroke()

## 互动功能要求
- 模块切换（switchTab函数）
- Canvas 动态可视化
- 输入验证与即时反馈`;
```

### 6.2 质量审查Prompt

```typescript
export const REFINEMENT_PROMPT = `你是一个小学数学课件质量审核专家。评估课件质量并提供改进建议。

## 评分维度（总分100分）
| 维度 | 权重 | 说明 |
|-----|-----|-----|
| 教学设计 | 25% | 内容是否符合小学生认知特点 |
| 内容质量 | 25% | 数学概念讲解清晰，例子贴切 |
| 交互设计 | 20% | Canvas动画流畅，练习题有反馈 |
| 安全合规 | 20% | 无XSS风险，代码安全 |
| 格式规范 | 10% | HTML结构完整，标签正确 |

## 通过标准
- 总分 >= 75
- 安全合规 = 100
- 各维度 >= 60

## 输出格式
{
  "score": { "overall": 85, "pedagogy": 80, "content": 85, "interaction": 80, "safety": 100, "format": 90 },
  "passed": true,
  "issues": [{ "severity": "warning", "category": "interaction", "message": "...", "suggestion": "..." }]
}`;
```

---

## 7. 流程图

### 7.1 课程生成流程

```
用户提问
    │
    ▼
┌─────────────────┐
│  参数验证        │ ← Zod Schema校验
│  subject/grade  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  内容搜索        │ ← WebSearch/LocalSearch
│  (可选)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  选择模式        │
│  useTools=true? │
└────────┬────────┘
    ┌────┴────┐
   是         否
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│工具Agent│ │单轮Agent│
│循环调用 │ │ API调用 │
└────┬───┘ └───┬────┘
     │          │
     └────┬─────┘
          │
          ▼
┌─────────────────┐
│  HTML解析        │ ← HtmlValidator.extractHtml
│  提取内容        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  质量审查        │ ← CourseReviewer.review
│  评分≥75?       │
└────────┬────────┘
    ┌────┴────┐
   是         否
    │         │
    │    ┌────┴────┐
    │   继续      终止
    │  (maxRetry) │
    ▼            ▼
┌────────┐    ┌────────┐
│  保存  │    │ 返回  │
│  课程  │    │ 错误  │
└────────┘    └────────┘
```

### 7.2 工具调用Agent流程

```
开始生成
    │
    ▼
┌─────────────────┐
│ 构建消息         │ ← system + user prompt
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 调用AI (带工具)  │ ← OpenAI/DashScope API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 检查完成条件     │ ← 包含"完成"/"DONE"?
└────────┬────────┘
    ┌────┴────┐
   是         否
    │         │
    ▼         ▼
┌────────┐ ┌─────────────────┐
│ 结束   │ │ 有工具调用?      │
└────────┘ └────────┬────────┘
               ┌────┴────┐
              是         否
               │         │
               ▼         ▼
          ┌────────┐ ┌────────┐
          │执行工具 │ │ 继续对话│
          └────┬───┘ └────────┘
               │
               ▼
          ┌────────┐
          │ save_   │← 更新currentHtml
          │ course_ │
          │ html    │
          └────┬───┘
               │
               ▼
          ┌────────┐
          │继续循环 │← < maxIterations
          └────────┘
```

### 7.3 课件调整流程

```
用户选择课件
    │
    ▼
┌─────────────────┐
│ 创建会话         │ ← createSession
│ 保存originalHtml │
└────────┬────────┘
         │
         ▼
用户输入修改请求
    │
    ▼
┌─────────────────┐
│ 分析请求         │ ← stage: analyzing
│ 记录用户消息     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 规划修改方案     │ ← stage: planning
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 调用AI          │ ← stage: executing
│ (多轮对话)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 执行工具        │ ← save_course_html
│ 生成新HTML      │   search_educational
└────────┬────────┘   content
         │            generate_svg
         ▼
┌─────────────────┐
│ 验证结果         │ ← stage: validating
│ 创建调整记录    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 保存会话         │ ← saveSession
│ 更新currentHtml │
└────────┬────────┘
         │
         ▼
返回修改结果 + 新HTML
```

---

## 8. 错误处理

### 8.1 错误类型 (`src/types/generation.ts`)

```typescript
enum GenerationErrorType {
  PARSE_ERROR = 'PARSE_ERROR',           // JSON解析失败
  VALIDATION_ERROR = 'VALIDATION_ERROR', // HTML验证失败
  API_ERROR = 'API_ERROR',               // API调用失败
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',       // 请求超时
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',   // 重试次数耗尽
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',        // 未知错误
}

class GenerationError extends Error {
  constructor(
    message: string,
    public type: GenerationErrorType,
    public originalError?: Error,
    public retryable: boolean = false     // 是否可重试
  ) {
    super(message);
    this.name = 'GenerationError';
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      retryable: this.retryable,
      stack: this.stack,
    };
  }
}
```

### 8.2 重试策略

```typescript
// 在 CourseAgent 中
private async retry<T>(
  fn: () => Promise<T>, 
  maxAttempts: number, 
  delayMs: number
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // 指数退避
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// 可重试错误
const RETRYABLE_ERRORS = [
  'timeout', 'Timeout',
  'network', 'ECONNRESET',
  'rate', 'quota', '429',
  '500', '502', '503', '504',
];

// 不可重试错误
const NON_RETRYABLE_ERRORS = [
  '401', '403', 'API key',
  'invalid', 'unauthorized',
];
```

---

## 9. 目录结构与文件对照

| 文件路径 | 类/函数 | 功能说明 |
|---------|---------|---------|
| `src/index.ts` | Express App | 服务器入口，注册路由 |
| `src/api/course.ts` | router | 课程生成API路由 |
| `src/api/adjustment.ts` | router | 课件调整API路由 |
| `src/services/courseService.ts` | CourseService | 课程服务编排层 |
| `src/services/courseAgent.ts` | CourseAgent | 单轮生成+多轮调优 |
| `src/services/courseToolCallAgent.ts` | CourseToolCallAgent | 工具调用Agent |
| `src/services/courseReviewer.ts` | CourseReviewer | 质量审查 |
| `src/services/toolManager.ts` | ToolManager | 工具注册执行 |
| `src/services/courseAdjustmentService.ts` | CourseAdjustmentService | 课件调整服务 |
| `src/services/opencode.ts` | OpenCodeClient | OpenCode/DashScope客户端 |
| `src/skills/coursePrompt.ts` | COURSE_SYSTEM_PROMPT | Prompt模板 |
| `src/types/*.ts` | interfaces | 类型定义 |

---

**文档结束**
