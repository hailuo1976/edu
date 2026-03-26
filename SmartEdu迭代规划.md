# SmartEdu 迭代规划

**更新时间**: 2026-03-23  
**规划原则**: 小步快跑，每个迭代交付可用的最小功能集

---

## 迭代总览

| 迭代 | 名称 | 目标 | 周期 | 验证指标 |
|-----|-----|-----|-----|---------|
| **0** | **项目启动** | 环境搭建、需求确认 | 1周 | 技术方案评审 |
| **1** | **MVP验证** | OpenCode课程生成可行性 | 2周 | 成功生成课程 |
| **2** | **核心闭环** | Claude Code + 审核入库 | 2周 | 双平台跑通 |
| **3** | **功能完善** | 问题解析 + 知识演示 | 2周 | 演示可用 |
| **4** | **CLI+规范** | CLI工具 + Skill标准化 | 2周 | 命令行可用 |
| **5** | **完整系统** | 用户管理 + Web界面 | 2周 | 端到端可用 |
| **6** | **测试评估** | 题库生成 + 评分分析 | 2周 | 测试功能可用 |
| **7** | **稳定上线** | 性能优化 + 部署上线 | 2周 | 生产可用 |

**总工期**: 15周 (可并行部分压缩至10周)

---

## 迭代0: 项目启动

### 目标
完成开发环境搭建和技术方案确认。

### 工作内容

| 任务 | 说明 | 负责人 |
|-----|-----|-------|
| 开发环境 | Git仓库、Docker环境、IDE配置 | 全员 |
| 技术选型确认 | 后端框架、数据库、技术栈 | 技术负责人 |
| 需求细化 | 输入输出定义、边界明确 | PM |
| 架构设计 | 接口设计、数据库设计 | 技术负责人 |

### 交付物
- [x] Git仓库初始化
- [x] 技术方案文档
- [x] 初步API接口设计

### 验收标准
- 开发环境可正常运行
- 技术方案通过评审

---

## 迭代1: MVP验证 (OpenCode课程生成)

### 目标
**核心**: 验证调用 OpenCode API 生成小学课程内容的可行性

### 工作内容

```
┌──────────────────────────────────────────────────────────────┐
│                     迭代1 架构                                │
│                                                              │
│  学生问题 ──► CLI工具 ──► OpenCode API ──► 课程JSON          │
│              (Node.js)  (course.skill)    (Markdown)         │
└──────────────────────────────────────────────────────────────┘
```

| 任务 | 说明 | 优先级 |
|-----|-----|-------|
| OpenCode SDK集成 | 调用OpenCode API | P0 |
| course.skill定义 | 定义课程生成Prompt模板 | P0 |
| 课程生成接口 | POST /generate-course 接口 | P0 |
| 简单Web界面 | 输入框 + 结果展示 | P1 |
| 课程存储 | JSON文件本地存储 | P1 |

### 代码结构

```
smartedu/
├── src/
│   ├── api/                    # API层
│   │   └── generate.ts         # 课程生成接口
│   ├── skills/                  # Skill定义
│   │   └── course.skill.ts      # 课程生成Skill
│   ├── services/               # 服务层
│   │   └── opencode.ts         # OpenCode调用服务
│   └── types/                  # 类型定义
│       └── course.ts
├── cli/                        # CLI工具
│   └── index.ts
├── web/                        # Web界面
│   └── index.html
├── courses/                    # 生成的课程存储
└── package.json
```

### course.skill Prompt设计

```typescript
// course.skill.ts
export const COURSE_SKILL_PROMPT = `你是一个小学数学教育专家。
根据用户的问题，生成适合小学生学习的课程内容。

问题: {user_question}
学科: {subject}
年级: {grade_level}年级

请按以下JSON格式输出课程内容：
{
  "course_id": "唯一ID",
  "metadata": {
    "subject": "学科",
    "grade": 年级,
    "topic": "主题",
    "estimated_minutes": 时长
  },
  "sections": [
    {
      "type": "intro|concept|example|exercise|summary",
      "title": "标题",
      "content": "Markdown格式内容"
    }
  ]
}

要求：
1. 内容符合小学教学大纲
2. 语言生动有趣，适合小学生
3. 包含具体例子和练习
4. 总时长控制在{minutes}分钟内`;
```

### 验收标准

| 指标 | 标准 | 验证方法 |
|-----|-----|---------|
| API调用成功率 | ≥90% | 10次连续测试 |
| 课程生成成功率 | ≥80% | 5个不同问题测试 |
| 输出格式正确率 | ≥90% | JSON解析验证 |
| 响应时间 | <30秒 | 计时统计 |

### 验证用例

| # | 测试问题 | 期望科目 | 期望年级 |
|---|---------|---------|---------|
| 1 | 分数的加减法怎么做？ | 数学 | 3 |
| 2 | 什么是春天的特点？ | 科学 | 2 |
| 3 | 怎么写春天的作文？ | 语文 | 3 |

### 交付物
- [ ] OpenCode API集成代码
- [ ] course.skill Prompt定义
- [ ] 课程生成API接口
- [ ] 简单Web测试页面
- [ ] 迭代1验证报告

---

## 迭代2: 核心闭环 (Claude Code + 审核入库)

### 目标
扩展到Claude Code双平台支持，实现课程审核和入库流程。

### 工作内容

```
┌─────────────────────────────────────────────────────────────────┐
│                     迭代2 架构                                    │
│                                                                 │
│  问题 ──► 负载均衡 ──► ┌──────────┬──────────┐                │
│                        │OpenCode  │Claude    │                │
│                        │ API      │ Code API │                │
│                        └────┬─────┴────┬─────┘                │
│                             │          │                       │
│                             └─────┬─────┘                       │
│                                   ▼                             │
│                            课程内容                              │
│                                   │                             │
│                                   ▼                             │
│                         ┌──────────────────┐                    │
│                         │   自动审核        │                    │
│                         │  (格式/安全/大纲) │                    │
│                         └────────┬─────────┘                    │
│                                  │                              │
│                                  ▼                              │
│                         ┌──────────────────┐                    │
│                         │   课程库         │                    │
│                         │  (JSON存储)      │                    │
│                         └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

| 任务 | 说明 | 优先级 |
|-----|-----|-------|
| Claude Code SDK集成 | 调用Claude API | P0 |
| 多平台适配层 | 统一调用接口 | P0 |
| 自动审核服务 | 格式检查、内容安全 | P0 |
| 课程入库服务 | 存储到课程库 | P0 |
| 生成历史记录 | 记录生成日志 | P1 |

### 平台适配器设计

```typescript
// adapters/base.ts
interface AICodeAdapter {
  name: 'opencode' | 'claude';
  generate(prompt: string): Promise<CourseContent>;
}

// adapters/opencode.ts
export class OpenCodeAdapter implements AICodeAdapter {
  async generate(prompt: string): Promise<CourseContent> {
    // OpenCode API调用
  }
}

// adapters/claude.ts
export class ClaudeCodeAdapter implements AICodeAdapter {
  async generate(prompt: string): Promise<CourseContent> {
    // Claude Code API调用
  }
}

// services/courseGenerator.ts
export class CourseGenerator {
  constructor(private adapters: AICodeAdapter[]) {}
  
  async generate(input: GenerateInput): Promise<GenerateResult> {
    // 轮询或选择适配器
  }
}
```

### 自动审核规则

```typescript
// 审核规则
const REVIEW_RULES = {
  // 格式审核
  format: [
    { rule: 'valid_json', weight: 10 },
    { rule: 'has_required_fields', weight: 10 },
  ],
  // 内容安全
  safety: [
    { rule: 'no_profanity', weight: 20 },
    { rule: 'no_politics', weight: 20 },
    { rule: 'no_violence', weight: 20 },
  ],
  // 大纲符合度
  alignment: [
    { rule: 'subject_match', weight: 10 },
    { rule: 'grade_appropriate', weight: 10 },
  ],
};

// 评分阈值
const REVIEW_THRESHOLD = {
  PASS: 80,    // 直接通过
  WARN: 60,    // 需要人工审核
  FAIL: 0,     // 拒绝
};
```

### 验收标准

| 指标 | 标准 | 验证方法 |
|-----|-----|---------|
| Claude Code集成 | API调用成功 | 5次测试 |
| 平台切换 | 可通过配置切换 | 配置变更测试 |
| 审核流程 | 自动执行审核规则 | 样本测试 |
| 课程入库 | 成功存储到库 | 查询验证 |

### 交付物
- [ ] Claude Code API集成
- [ ] 多平台适配层
- [ ] 自动审核服务
- [ ] 课程入库功能
- [ ] 迭代2验证报告

---

## 迭代3: 功能完善 (问题解析 + 知识演示)

### 目标
实现问题解析模块和知识演示模块。

### 工作内容

| 任务 | 说明 | 优先级 |
|-----|-----|-------|
| NLP问题解析 | 提取知识点、意图识别 | P0 |
| 知识图谱基础 | 知识点关联映射 | P1 |
| 演示模板 | Markdown转HTML组件 | P0 |
| 动画支持 | Lottie动画集成 | P1 |
| 交互组件 | 选择题、填空题交互 | P1 |

### 问题解析流程

```typescript
// 问题解析服务
interface ParsedQuestion {
  subject: string;       // 学科
  grade: number;         // 年级
  topic: string;        // 主题
  keywords: string[];   // 关键词
  intent: string;       // 学习意图
}

// 解析流程
async function parseQuestion(question: string): Promise<ParsedQuestion> {
  // 1. 分词
  const tokens = tokenize(question);
  
  // 2. 关键词提取
  const keywords = extractKeywords(tokens);
  
  // 3. 知识点匹配
  const knowledgePoints = matchKnowledgeGraph(keywords);
  
  // 4. 意图识别
  const intent = classifyIntent(question);
  
  return { subject, grade, topic, keywords, intent };
}
```

### 验收标准

| 指标 | 标准 | 验证方法 |
|-----|-----|---------|
| 问题解析准确率 | ≥80% | 20个问题测试 |
| 演示页面渲染 | 正常显示 | 浏览器测试 |
| 动画播放 | 正常播放 | 功能测试 |

### 交付物
- [ ] NLP问题解析服务
- [ ] 知识演示Web组件
- [ ] Lottie动画支持
- [ ] 迭代3验证报告

---

## 迭代4: CLI工具 + Skill规范

### 目标
开发完整的CLI工具和标准化Skill规范。

### CLI命令设计

```bash
# 安装
npm install -g @smartedu/cli

# 初始化
smartedu-cli init

# 核心命令
smartedu-cli ask "分数的加减法怎么做？" --subject math --grade 3

# 课程管理
smartedu-cli list                      # 列出课程
smartedu-cli show <course_id>          # 查看课程
smartedu-cli review <course_id>        # 审核课程
smartedu-cli publish <course_id>       # 发布课程

# 平台选择
smartedu-cli ask "..." --platform opencode    # 指定平台
smartedu-cli ask "..." --platform claude     # 指定平台
smartedu-cli ask "..." --platform auto       # 自动选择
```

### Skill规范完善

```yaml
# course.skill 完整规范
course_skill:
  version: "1.0"
  platforms: [opencode, claude_code]
  
  input:
    user_question: string [required]
    subject: enum [语文,数学,英语,科学]
    grade_level: integer [1-6]
    duration_minutes: integer [10-45]
  
  output:
    format: json
    schema: course_schema_v1
  
  quality_requirements:
    - 符合教学大纲
    - 语言儿童化
    - 难度适配
    - 内容安全
  
  metadata:
    created_by: smartedu-cli
    skill_version: "1.0"
```

### 验收标准

| 指标 | 标准 | 验证方法 |
|-----|-----|---------|
| CLI安装 | npm install成功 | 命令测试 |
| ask命令 | 正常生成课程 | 功能测试 |
| 平台切换 | 可配置切换 | 配置测试 |
| Skill规范 | 符合定义标准 | 格式验证 |

### 交付物
- [ ] smartedu-cli npm包
- [ ] 完整的Skill规范文档
- [ ] CLI使用手册
- [ ] 迭代4验证报告

---

## 迭代5: 完整系统 (用户管理 + Web界面)

### 目标
实现用户管理系统和完整的Web界面。

### Web功能

| 角色 | 功能 |
|-----|-----|
| **学生端** | 问题输入、课程学习、进度展示 |
| **教师端** | 问题查询、课程管理、学生数据 |
| **管理端** | 用户管理、课程审核、系统配置 |

### 验收标准

| 指标 | 标准 | 验证方法 |
|-----|-----|---------|
| 用户注册登录 | 正常注册登录 | 功能测试 |
| 角色权限 | 权限隔离正确 | 权限测试 |
| 端到端流程 | 提问到学习完成 | 流程测试 |

### 交付物
- [ ] 用户管理系统
- [ ] 学生Web端
- [ ] 教师Web端
- [ ] 迭代5验证报告

---

## 迭代6: 测试评估

### 目标
实现测试评估模块。

### 功能

| 功能 | 说明 |
|-----|-----|
| 题库生成 | quiz.skill自动生成题目 |
| 在线答题 | 多种题型支持 |
| 自动评分 | 即时反馈 |
| 错题分析 | 薄弱点识别 |
| 进度追踪 | 学习数据统计 |

### 交付物
- [ ] quiz.skill定义
- [ ] 题库生成服务
- [ ] 在线测试界面
- [ ] 评分分析系统
- [ ] 迭代6验证报告

---

## 迭代7: 稳定上线

### 目标
性能优化和正式部署上线。

### 工作内容

| 任务 | 说明 |
|-----|-----|
| 性能优化 | 缓存、索引、异步处理 |
| 安全加固 | 身份认证、数据加密 |
| 监控告警 | 日志、指标、告警 |
| 部署上线 | 生产环境部署 |
| 文档完善 | 用户手册、运维文档 |

### 交付物
- [ ] 性能优化报告
- [ ] 安全审计报告
- [ ] 部署文档
- [ ] 用户手册
- [ ] 正式上线

---

## 迭代执行看板

```
迭代    名称              周期      状态      里程碑
─────────────────────────────────────────────────────
0       项目启动          1周       □        技术方案评审
1       MVP验证           2周       □        成功生成课程
2       核心闭环          2周       □        双平台跑通
3       功能完善          2周       □        演示可用
4       CLI+规范          2周       □        命令行可用
5       完整系统          2周       □        端到端可用
6       测试评估          2周       □        测试功能可用
7       稳定上线          2周       □        生产可用
─────────────────────────────────────────────────────
总计    -                 15周      -        -
```

---

## 快速启动建议

如果想最快验证可行性，建议执行以下组合：

```
Week 1-2: 迭代0 + 迭代1
├── 搭建环境
├── 集成OpenCode
├── 编写course.skill
└── 验证: 能生成一个数学课程

Week 3-4: 迭代2
├── 集成Claude Code
├── 实现审核流程
└── 验证: 双平台都能生成课程
```

**最小验证集**: 仅需迭代0+迭代1，2周内可验证核心可行性。

---

## 附录：技术债务规划

| 债务项 | 说明 | 偿还计划 |
|-------|-----|---------|
| 硬编码配置 | 初期配置写死 | 迭代4配置化 |
| 本地存储 | JSON文件存储 | 迭代5数据库 |
| 简单UI | 原型级界面 | 迭代5完善UI |
| 无缓存 | 每次请求AI | 迭代7加缓存 |
| 单点部署 | 单机运行 | 迭代7容器化 |

---

**文档结束**
