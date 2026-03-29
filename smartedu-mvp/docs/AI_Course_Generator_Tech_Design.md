# AI智能课件生成器 - 技术设计文档

> **面向开发者**：帮助理解系统运作方式，快速定位代码，进行调试和扩展。

---

## 1. 系统概览

### 1.1 核心概念

```
用户请求 ──▶ CourseService ──▶ CourseToolCallAgent ──▶ AI循环 ──▶ 工具调用 ──▶ HTML课件
```

**一句话概括**：用户输入教学主题，AI通过多轮工具调用（搜索、生成SVG、组装HTML），最终输出可交互的课件。

### 1.2 架构分层

| 层级 | 组件 | 文件路径 |
|------|------|----------|
| **API层** | Express路由 | `src/index.ts` |
| **服务层** | CourseService | `src/services/courseService.ts` |
| **Agent层** | CourseToolCallAgent | `src/services/courseToolCallAgent.ts` |
| **工具层** | ToolManager | `src/services/toolManager.ts` |
| **存储层** | 本地文件系统 | `courses/` 目录 |

---

## 2. 主生成流程

### 2.1 入口调用链

```
POST /api/course/generate
    │
    ▼
CourseService.generateCourse(options)
    │
    ├─ useTools=true ──▶ generateCourseWithTools()
    │                       │
    │                       ▼
    │                   CourseToolCallAgent.generate()
    │                       │
    │                       ▼ (AI循环)
    │                   课件生成完成
    │                       │
    │                       ▼
    │                   saveCourse()
    │
    └─ useTools=false ──▶ generateCourseWithoutTools() (降级模式)
```

### 2.2 核心参数

```typescript
// 用户请求参数
interface GenerateCourseOptions {
  topic: string;        // 教学主题，如"正方形面积"
  subject: string;      // 学科，如"数学"
  gradeLevel: number;   // 年级，如3
  useTools?: boolean;   // 是否使用工具模式（默认true）
  onProgress?: (progress) => void;  // 进度回调
}

// 返回结果
interface Course {
  id: string;           // 课程ID: course_<timestamp>
  topic: string;
  subject: string;
  gradeLevel: number;
  html: string;         // 完整HTML课件
  toolCalls: ToolResult[];  // 工具调用记录
  sections: CourseSection[]; // 提取的模块
}
```

---

## 3. AI循环机制

### 3.1 循环伪代码

```python
# CourseToolCallAgent.generate() 核心逻辑

def generate(topic, subject, gradeLevel):
    course_id = f"course_{timestamp}"
    messages = [
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": topic}
    ]
    current_html = ""
    iterations = 0
    max_iterations = 15

    while iterations < max_iterations:
        iterations += 1

        # ① 调用AI（带工具定义）
        response = call_ai_with_tools(messages)

        # ② 检查完成条件
        if contains_completion_keyword(response.content):
            if current_html:  # 必须已生成HTML
                return success(current_html)
            else:
                messages.append({"role": "user", "content": "请用save_course_html保存课件"})
                continue

        # ③ 无工具调用 → 提示继续
        if not response.tool_calls:
            messages.append({"role": "user", "content": "请继续使用工具"})
            continue

        # ④ 执行工具调用
        for tool_call in response.tool_calls:
            result = execute_tool(tool_call)

            if tool_call.name == "save_course_html" and result.success:
                current_html = result.html  # 更新HTML

            messages.append({"role": "tool", "content": result_json})

        # ⑤ 推送进度到前端
        report_progress(iteration, tool_results)

    # 循环结束，检查是否有HTML
    return success_or_fallback(current_html)
```

### 3.2 完成条件判断

```python
def check_completion(content):
    keywords = ["完成", "DONE", "FINISH", "任务完成"]
    return any(keyword in content.upper() for keyword in keywords)

# 关键：即使AI说"完成"，也要验证HTML是否存在
```

### 3.3 超时处理

```python
def call_ai_with_timeout(messages):
    timeout = 5 * 60 * 1000  # 5分钟

    try:
        return await call_ai(messages)
    except TimeoutError:
        # 压缩提示词后重试
        compressed = compress_messages(messages)
        return await call_ai(compressed)

def compress_messages(messages):
    # 保留：系统消息（简化版） + 最近3轮对话
    return [
        simplified_system_prompt,
        ...messages[-6:]  # 最近3轮
    ]
```

---

## 4. 工具调用体系

### 4.1 工具定义表

| 工具名 | 功能 | 关键参数 |
|--------|------|----------|
| `search_educational_content` | 搜索教学资料 | query, grade_level, subject |
| `generate_svg` | 生成SVG图形 | shape_type, dimensions, label |
| `generate_html_component` | 生成HTML组件 | component_type, content |
| `validate_html` | 验证HTML结构 | html_code |
| `save_course_html` | 保存课件文件 | filename, html_content, course_id |
| `create_file` / `write_file` | 文件操作 | file_path, content |
| `read_file` / `list_files` | 文件读取 | file_path / directory |

### 4.2 工具执行流程

```python
def execute_tool(tool_call):
    # ① 验证参数
    validate_parameters(tool_call.arguments)

    # ② 特殊处理：强制修正course_id
    if tool_call.name == "save_course_html":
        tool_call.arguments["course_id"] = actual_course_id

    # ③ 执行工具（带重试）
    result = retry(lambda: tool.execute(arguments), max_attempts=3)

    # ④ 记录日志和统计
    update_tool_stats(tool_call.name, result.success)

    return {
        "toolCallId": tool_call.id,
        "toolName": tool_call.name,
        "success": result.success,
        "result": result.data,
        "error": result.error
    }
```

### 4.3 工具结果如何影响对话

```typescript
// 工具结果添加到messages
messages.push({
    role: 'tool',
    content: result.success
        ? JSON.stringify(result.result, null, 2)
        : `错误: ${result.error}`
});

// AI根据工具结果决定下一步行动
// 例：搜索成功 → AI基于搜索内容生成讲解
// 例：SVG生成成功 → AI将SVG嵌入HTML
```

---

## 5. 前端实时展示

### 5.1 进度推送机制

```typescript
// AgentProgress 结构
interface AgentProgress {
    iteration: number;       // 当前轮次
    stage: 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'retry';
    message: string;         // 状态描述

    // 可选字段
    ai_input?: string;       // AI输入内容（展示给用户）
    ai_output?: string;      // AI输出内容
    tool_call?: {            // 单个工具调用
        name: string;
        arguments: object;
        result?: object;
        success: boolean;
        error?: string;
    };
    draft_content?: {        // 草稿内容
        type: 'svg' | 'html';
        content: string;
    };
}
```

### 5.2 SSE流式传输

```typescript
// 后端：Express响应
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');

onProgress = (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
};

// 前端：EventSource接收
const eventSource = new EventSource('/api/course/generate?stream=true');
eventSource.onmessage = (event) => {
    const progress = JSON.parse(event.data);
    updateUI(progress);
};
```

### 5.3 前端UI更新逻辑

```typescript
function handleProgress(progress) {
    // AI输入/输出展示
    if (progress.ai_input || progress.ai_output) {
        showAIPanel();
        aiInputElement.textContent = progress.ai_input;
        aiOutputElement.textContent = progress.ai_output;
    }

    // 工具调用展示
    if (progress.tool_call) {
        showToolCallPanel();
        addToolCallRecord(progress.tool_call);
    }

    // 草稿内容展示（SVG预览等）
    if (progress.draft_content) {
        renderDraft(progress.draft_content);
    }

    // 时间线更新
    addTimelineItem(progress.stage, progress.message);
}
```

---

## 6. 异常处理与降级策略

### 6.1 降级路径

```
工具模式失败
    │
    ├─ 单个工具失败 ──▶ 继续循环，AI尝试其他方案
    │
    ├─ AI调用超时 ──▶ 压缩提示词重试
    │
    ├─ 循环达到上限 ──▶ 检查是否有HTML
    │                    │
    │                    ├─ 有HTML ──▶ 返回部分成功
    │                    └─ 无HTML ──▶ 返回fallback模板
    │
    └─ 整体失败 ──▶ generateCourseWithoutTools() (纯AI模式)
```

### 6.2 Fallback模板

```typescript
// 当生成失败时，返回基础HTML模板
function generateFallbackHtml(topic, subject, gradeLevel) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${gradeLevel}年级${subject} - ${topic}</title>
    <style>
        /* 基础样式 + Canvas演示 + 简单练习 */
    </style>
</head>
<body>
    <div id="concept">概念讲解...</div>
    <div id="demo">图形演示...</div>
    <div id="exercise">练习测试...</div>
    <script>draw(); check();</script>
</body>
</html>`;
}
```

### 6.3 重试机制

| 场景 | 重试次数 | 间隔 | 特殊处理 |
|------|----------|------|----------|
| AI调用失败 | 3次 | 2s递增 | 超时触发压缩 |
| 工具执行失败 | 2次 | 1s递增 | 参数验证优先 |
| 整体生成失败 | 1次 | - | 降级到非工具模式 |

---

## 7. 接口速查表

### 7.1 API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/course/generate` | 生成课件 |
| GET | `/api/course/list` | 列出所有课件 |
| GET | `/api/course/:id` | 获取课件详情 |
| DELETE | `/api/course/:id` | 删除课件 |
| GET | `/api/health` | 健康检查 |

### 7.2 工具参数速查

```json
// search_educational_content
{
    "query": "正方形面积公式",
    "grade_level": 3,
    "subject": "数学"
}

// generate_svg
{
    "shape_type": "rect",
    "dimensions": { "width": 100, "height": 100 },
    "label": "边长"
}

// save_course_html
{
    "filename": "index.html",
    "html_content": "<!DOCTYPE html>...",
    "course_id": "course_1234567890"  // 必须使用正确ID
}
```

### 7.3 环境变量

```bash
DASHSCOPE_API_KEY=xxx       # 通义千问API密钥
OPENAI_BASE_URL=https://... # API地址（默认阿里云）
OPENAI_MODEL=qwen-plus      # 模型名称
BAIDU_API_KEY=xxx           # 百度搜索API密钥
```

---

## 8. 常见调试场景

### 8.1 查看AI循环日志

```
[CourseToolCallAgent] 第 1 轮开始
[CourseToolCallAgent] 调用 OpenAI 兼容接口
[CourseToolCallAgent] 响应: 内容长度=xxx, 工具调用=2
[ToolManager] 开始执行工具: search_educational_content
[ToolManager] 工具执行成功，耗时: 1200ms
[ToolManager] 开始执行工具: generate_svg
...
[CourseToolCallAgent] 课件生成完成，HTML长度: 15000
```

### 8.2 定位问题

| 问题 | 定位位置 | 检查点 |
|------|----------|--------|
| AI不调用工具 | `callAIWithTools()` | 系统提示是否正确、工具定义是否传递 |
| HTML未保存 | `executeTool()` | course_id是否被修正、文件路径是否正确 |
| 超时卡住 | `retryWithTimeout()` | 检查压缩逻辑是否触发 |
| 工具参数错误 | `ToolManager.validateToolParameters()` | 检查required参数 |

### 8.3 扩展新工具

```typescript
// 在 ToolManager.registerDefaultTools() 中添加
this.registerTool({
    name: 'new_tool',
    description: '工具描述',
    parameters: {
        type: 'object',
        properties: {
            param1: { type: 'string', description: '参数1' }
        },
        required: ['param1']
    },
    execute: async (args, workDir) => {
        // 实现逻辑
        return { result: 'xxx' };
    }
});

// 在系统提示中说明工具用途
```

---

## 9. 数据流图（完整版）

```
用户输入: "正方形面积怎么算"
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  CourseService.generateCourse()                              │
│  ├─ 创建 CourseToolCallAgent                                 │
│  └─ 调用 agent.generate("正方形面积怎么算", "数学", 3)        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  AI循环（最多15轮）                                           │
│                                                              │
│  第1轮:                                                      │
│  ├─ callAI() ──▶ AI决定调用 search_educational_content      │
│  ├─ executeTool(search) ──▶ 返回教学资料                     │
│  ├─ messages.append(tool_result)                             │
│  └─ reportProgress({stage:'tool_result'})                    │
│                                                              │
│  第2轮:                                                      │
│  ├─ callAI() ──▶ AI基于搜索结果，调用 generate_svg           │
│  ├─ executeTool(svg) ──▶ 返回SVG代码                         │
│  ├─ messages.append(tool_result)                             │
│  └─ reportProgress({draft_content: {svg}})                   │
│                                                              │
│  第3-5轮:                                                    │
│  ├─ AI继续生成HTML组件、验证、组装                            │
│                                                              │
│  第6轮:                                                      │
│  ├─ callAI() ──▶ AI调用 save_course_html                     │
│  ├─ executeTool(save) ──▶ currentHtml = result.html          │
│  ├─ messages.append(tool_result)                             │
│                                                              │
│  第7轮:                                                      │
│  ├─ callAI() ──▶ AI回复"任务完成"                             │
│  ├─ checkCompletion() ──▶ 检测关键词                          │
│  ├─ currentHtml存在 ──▶ 返回成功                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CourseService.saveCourse()                                  │
│  ├─ 保存 course.json                                         │
│  ├─ 保存 index.html                                          │
│  └─ 返回 Course 对象                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
用户收到: 课件HTML + 工具调用记录
```

---

**文档版本**: 2.0 (流程驱动版)
**最后更新**: 2026-03-29
**适用版本**: smartedu-mvp 当前实现