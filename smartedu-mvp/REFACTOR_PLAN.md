# SmartEdu 重构方案

## 问题总结

| 问题 | 影响 |
|------|------|
| `ToolCall`/`ToolResult`/`ToolDefinition` 各定义两套 | 类型混乱，改一处漏一处 |
| `ToolManager` 是 1400 行 God Class | 难以维护和测试 |
| `CourseToolCallAgent`(OpenAI) + `ToolCallAgent`(Anthropic) + `CourseAgent` 做同样的事 | 三套 Agent 循环逻辑重复 |
| `fileTools.ts` 和 `ToolManager.registerFileTools()` 各实现一套文件工具 | 重复且行为不一致 |
| `retry()` 在 3 个文件重复 | |
| `index.ts` 混合日志/启动/路由 | 职责不清 |
| `CourseAdjustmentService` 1275 行，内嵌 AI 调用循环和工具执行 | 又一个 Agent 循环 |
| `core/ai/` 抽象层几乎未使用 | 死代码 |
| 多个 AI Client 接口不统一 | 切换模型困难 |

## 重构目标

1. 统一类型系统 - 一套 `ToolCall`/`ToolResult`/`ToolDefinition`
2. 统一 AI Client - 一个 client 适配多 provider
3. 统一 Agent 循环 - 一个核心 Agent 循环，不同场景通过配置区分
4. 拆分 God Class - ToolManager 拆为注册 + 执行 + 各工具独立文件
5. 清理死代码 - 删除未使用的 core/ai 抽象层、fileTools.ts 重复
6. 分离关注点 - 日志/启动/路由各归其位

## 目标目录结构

```
src/
├── index.ts                    # 入口：只做启动
├── app.ts                      # Express 应用配置
├── config.ts                   # 统一配置（端口、API key 等）
├── api/
│   ├── course.ts               # 课程路由（精简）
│   └── adjustment.ts           # 调整路由（保持）
├── agent/
│   ├── core.ts                 # 核心 Agent 循环（统一）
│   ├── prompts/
│   │   ├── course.ts           # 课程生成 system prompt
│   │   └── adjustment.ts       # 调整 system prompt
│   └── strategies/
│       ├── courseGeneration.ts # 课程生成策略（调用 core）
│       ├── courseRefinement.ts # 质量调优策略
│       └── courseAdjustment.ts # 课件调整策略
├── ai/
│   ├── client.ts               # 统一 AI Client（适配 OpenAI/Anthropic）
│   └── types.ts                # AI 相关类型
├── tools/
│   ├── registry.ts             # 工具注册表（轻量）
│   ├── executor.ts             # 工具执行器（含重试）
│   ├── definitions/            # 每个工具一个文件
│   │   ├── fileOps.ts          # 文件操作工具
│   │   ├── svg.ts              # SVG 生成工具
│   │   ├── htmlComponent.ts    # HTML 组件工具
│   │   ├── htmlValidator.ts    # HTML 验证工具
│   │   ├── search.ts           # 教育搜索工具
│   │   └── courseSaver.ts      # 课程保存工具
│   └── types.ts                # 工具类型定义（唯一一套）
├── services/
│   ├── courseService.ts        # 课程编排服务（精简）
│   ├── courseReviewer.ts       # 质量审查（保持）
│   └── courseStore.ts          # 课程存储（从 courseService 拆出）
├── utils/
│   ├── retry.ts                # 通用重试工具
│   ├── logger.ts               # 日志模块
│   ├── htmlParser.ts           # HTML 提取/解析
│   └── contextManager.ts       # 上下文优化
├── types/
│   ├── course.ts               # 课程类型
│   ├── agent.ts                # Agent 类型（统一后）
│   ├── adjustment.ts           # 调整类型
│   └── index.ts                # 统一导出
└── web/                        # 保持不变
```

## 核心设计

### 1. 统一 AI Client (`src/ai/client.ts`)

```typescript
// 统一接口，底层适配 OpenAI 或 Anthropic
interface AIClient {
  chat(messages: Message[], tools?: ToolDef[]): Promise<AIResponse>;
}

interface AIResponse {
  content: string;
  toolCalls: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}
```

- 根据 env 自动选择 provider（DashScope/OpenCode/Anthropic）
- 一个 `createAIClient()` 工厂函数

### 2. 统一 Agent 循环 (`src/agent/core.ts`)

```typescript
interface AgentConfig {
  systemPrompt: string;
  tools: ToolDefinition[];
  maxIterations: number;
  exitCondition: (content: string) => boolean;
  onProgress?: (progress: AgentProgress) => void;
}

async function runAgentLoop(
  client: AIClient,
  initialMessage: string,
  config: AgentConfig
): Promise<AgentResult>
```

- 所有三种场景（生成、调优、调整）都用这同一个循环
- 不同场景只改 `systemPrompt`、`tools`、`exitCondition`

### 3. 统一工具类型 (`src/tools/types.ts`)

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;       // JSON Schema 格式
  execute: (args: any, ctx: ToolContext) => Promise<any>;
}

interface ToolCall {
  id: string;
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
```

### 4. 拆分 ToolManager

- `registry.ts`：注册/查询工具（~50行）
- `executor.ts`：执行工具 + 重试 + 超时（~100行）
- `definitions/*.ts`：每个工具独立文件

### 5. 清理项

| 删除 | 原因 |
|------|------|
| `src/core/ai/` 整个目录 | 未被充分使用，用新的 `src/ai/` 替代 |
| `src/services/fileTools.ts` | 与 `toolManager` 中重复 |
| `src/services/opencode.ts` | 用新的 `src/ai/client.ts` 替代 |
| `src/services/toolCallAgent.ts` | 用新的 `src/agent/core.ts` 替代 |
| `src/services/courseToolCallAgent.ts` | 用策略模式替代 |
| `src/services/courseAgent.ts` | 用新的 Agent 架构替代 |
| 根目录的 `test-*.js/ts` 文件 | 散乱，测试应放 tests/ |

## 执行顺序（分 5 步）

### 步骤 1：基础设施（无功能变化）
- 创建 `src/utils/retry.ts`、`src/utils/logger.ts`
- 创建 `src/tools/types.ts`（统一类型）
- 创建 `src/config.ts`
- 创建 `src/ai/types.ts` + `src/ai/client.ts`

### 步骤 2：工具层重构
- 创建 `src/tools/definitions/*.ts`（从 toolManager.ts 拆出）
- 创建 `src/tools/registry.ts` + `src/tools/executor.ts`
- 删除 `fileTools.ts`（重复代码）

### 步骤 3：Agent 层重构
- 创建 `src/agent/core.ts`（统一循环）
- 创建 `src/agent/prompts/*.ts`
- 创建 `src/agent/strategies/*.ts`
- 删除旧 Agent 文件

### 步骤 4：服务层重构
- 拆分 `courseService.ts` → `courseService.ts` + `courseStore.ts`
- 重构 `courseAdjustmentService.ts` 使用新 Agent
- 创建 `src/app.ts`，精简 `src/index.ts`

### 步骤 5：清理
- 删除 `src/core/ai/`
- 删除根目录 `test-*` 文件
- 更新 `tsconfig.json` 和 `package.json`
- 验证所有 API 端点行为不变
