# SmartEdu MVP

> 小学智能教育辅助系统 - AI互动课件生成

[![迭代1状态](https://img.shields.io/badge/迭代1-验收通过-brightgreen)](#迭代1验收报告)

## 项目目标

验证通过 AI 生成**精美互动课件**的可行性，包含SVG图形、公式卡片、互动计算器、练习测试等。

## 当前状态

**🚀 迭代1完成 - AI互动课件生成已实现**

- ✅ API服务正常运行 (GLM-5 AI)
- ✅ Web界面功能完整
- ✅ SVG图形可视化
- ✅ 公式卡片展示
- ✅ 互动计算器
- ✅ 步骤展示
- ✅ 练习测试
- ✅ 单元素测试全部通过

## 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd smartedu-mvp

# 安装依赖
npm install

# 启动服务 (需要配置 .env 文件)
npm run dev

# 访问Web界面
# http://localhost:3000/web
```

## 配置API密钥

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件，填入您的API密钥
OPENCODE_API_KEY=your_api_key_here
```

## 功能演示

### Web界面

访问 `http://localhost:3000/web` 打开智能课件生成器：

1. 输入问题（如"正方形的面积怎么算？"）
2. 选择学科和年级
3. 点击"生成课件"
4. AI自动生成包含SVG图形和互动计算的精美课件

### 示例问题

- 正方形的面积怎么算？
- 分数的加减法怎么做？
- 三角形的面积怎么算？
- 圆形的周长怎么算？

### API接口

```bash
# 健康检查
curl http://localhost:3000/api/course/health

# 生成课件
curl -X POST http://localhost:3000/api/course/generate \
  -H "Content-Type: application/json" \
  -d '{"user_question":"正方形的面积怎么算？","subject":"数学","grade_level":3}'

# 课件列表
curl http://localhost:3000/api/course/list
```

## 生成的课件特点

### 📊 SVG图形可视化
自动生成数学图形的SVG矢量图，包括：
- 几何图形（正方形、圆形、三角形等）
- 数学概念可视化
- 标注清晰的尺寸标注

### 📐 公式卡片
精美的公式展示卡片，包含：
- 公式名称
- LaTeX格式公式
- 变量说明

### 🔢 互动计算器
可交互的计算器组件：
- 输入参数
- 点击计算
- 查看计算过程
- 结果展示

### 📝 步骤展示
详细的解题步骤：
- 步骤编号
- 清晰说明
- 重点标注

### 🎯 练习测试
包含多种题型：
- 填空题
- 选择题
- 应用题
- 自动评分

## 技术栈

| 层级 | 技术 |
|-----|-----|
| 后端 | Node.js + TypeScript + Express |
| AI集成 | GLM-5 (阿里云) |
| 数据验证 | Zod |
| 测试 | Jest |
| 前端 | 原生 HTML/CSS/JavaScript |

## 项目结构

```
smartedu-mvp/
├── src/
│   ├── api/course.ts          # API路由
│   ├── services/
│   │   ├── opencode.ts        # OpenCode调用
│   │   ├── courseService.ts   # 课程服务
│   │   └── mockData.ts        # 模拟数据
│   ├── skills/coursePrompt.ts # Prompt模板
│   ├── utils/parser.ts        # JSON解析
│   ├── types/course.ts        # 类型定义
│   └── index.ts               # 入口
├── web/index.html             # Web界面
├── courses/                   # 课件存储
├── tests/                    # 测试
└── docs/                     # 文档
```

## 迭代规划

| 迭代 | 目标 | 状态 |
|-----|-----|-----|
| 迭代0 | 项目启动 | ✅ 完成 |
| 迭代1 | MVP验证 | ✅ **当前** |
| 迭代2 | Claude Code + 审核入库 | ⏳ 待开始 |
| 迭代3 | 问题解析 + 知识演示 | ⏳ 待开始 |
| 迭代4 | CLI工具 + Skill规范 | ⏳ 待开始 |
| 迭代5 | 用户管理 + Web界面 | ⏳ 待开始 |

## 测试

```bash
# 单元测试
npm test

# Prompt测试
npm run test:prompt
```

## 文档

- [API文档](docs/API文档.md)
- [迭代规划](docs/迭代规划.md)
- [迭代1详细执行方案](docs/迭代1详细执行方案.md)
- [Week1总结报告](docs/Week1总结报告.md)
- [迭代1验收报告](docs/迭代1验收报告.md)

## License

MIT
