/**
 * 课程生成 Prompt —— 编程智能体模式
 *
 * 流程：设计 → 分模块生成 → 集成 → 修复
 * 每步都是独立的 AI 调用，payload 极小，无 tool_call。
 */

// ============================================================
// 阶段 1：意图理解 + 设计规划
// ============================================================

export function buildDesignSystemPrompt(): string {
  return `你是一位资深课程设计师和前端架构师。你的任务是为互动 HTML 课件设计完整的内容方案和视觉规范。

## 输出要求
严格按照下面的 Markdown 结构输出设计方案，不要添加额外解释：

## 课件信息
- 主题：（给定主题）
- 学科：（给定学科）
- 年级：（给定年级）

## 教学目标
- 目标1（具体可衡量）
- 目标2
- 目标3

## 全局视觉规范
- 主色调：#xxxxxx（明亮活泼，适合小学生）
- 辅助色：#xxxxxx
- 字体：微软雅黑/思源黑体
- 布局：顶部导航栏 + 内容区，Tab 切换各模块
- 风格：渐变背景、圆角卡片、柔和阴影、卡通插画感

## 模块清单

### 模块1：概念讲解（id=concept）
- 教学内容：3-5 个核心知识点
- 核心知识点：
  1. 知识点名称（配生活化例子：具体例子描述）
  2. ...
- 视觉呈现：卡片式布局，每个知识点一张卡片，配图标
- 交互：点击卡片展开详细解释

### 模块2：图形演示（id=demo）
- 图形类型：Canvas 动画 / SVG 图形（明确选一种）
- 绘制内容：详细描述要画什么
- 动画效果：详细描述动画过程
- 交互：可调节参数 / 可拖动元素

### 模块3：练习测试（id=exercise）
- 题目数量：5
- 题型：选择题 3 + 填空题 2
- 题目列表：
  1. 题干（选项 A/B/C/D，正确答案：X，错误解析：...）
  2. ...
- 即时反馈：答对显示绿色✓和鼓励语，答错显示红色✗和解析
- 评分：实时显示正确率和得分

### 模块4（可选）：根据主题添加，如拓展知识/互动游戏/实例演示/生活应用
- 模块id：（英文，如 expand/game/example）
- 模块名称：（中文）
- 内容：...
- 交互：...

## 导航与交互方案
- Tab 切换：点击顶部 Tab 切换模块，当前 Tab 高亮
- 过渡动画：切换时淡入淡出
- 响应式：适配平板和手机

## 技术约束提醒
（后续阶段会遵守，本阶段只需设计内容）`;
}

export function buildDesignUserPrompt(topic: string, subject: string, gradeLevel: number): string {
  return `请为${gradeLevel}年级${subject}课程"${topic}"设计互动 HTML 课件方案。

要求：
1. 根据主题复杂度决定模块数量（3-6 个），必须包含"概念讲解"、"图形演示"、"练习测试"三个核心模块
2. 每个模块的设计要具体，可直接用于编码
3. 视觉规范要统一，所有模块共用同一套配色和字体

直接按指定 Markdown 结构输出设计文档，不要有前言或结论。`;
}

// ============================================================
// 阶段 2：单模块 HTML 片段生成
// ============================================================

export function buildModuleSystemPrompt(gradeLevel: number, subject: string): string {
  return `你是一位前端工程师。你的任务是根据模块设计规范，生成单个模块的 HTML 片段。

## 输出要求
- 只输出该模块的 HTML 片段，不输出完整 HTML 文档
- 顶层是一个 <div id="模块id" class="module"> 容器，内部是该模块的内容
- 该模块需要的 CSS 放在 <style> 标签内，紧接在容器之后（注意不要冲突，加模块前缀）
- 该模块需要的 JS 放在 <script> 标签内，紧接在 CSS 之后
- 用 \`\`\`html 和 \`\`\` 包裹整个输出

## 技术约束
1. JS 用 var/function，避免 let/const/箭头函数/模板字符串
2. JS 包裹在立即执行函数或 DOMContentLoaded 内
3. Canvas 绑定检查：var canvas = document.getElementById('xxx'); if (!canvas) return;
4. 不用 eval()、不用 innerHTML 拼接用户输入
5. 颜色用 #hex 或 rgba() 格式
6. 适合${gradeLevel}年级${subject}学科

## 视觉规范
- 遵循全局视觉规范（在 user prompt 中给出）
- 该模块特有样式可叠加，但不能冲突全局
- 色彩鲜明，渐变、圆角、阴影

## 输出格式示例
\`\`\`html
<div id="concept" class="module">
  <h2>概念讲解</h2>
  <div class="card">...</div>
</div>
<style>
  .module#concept .card { ... }
</style>
<script>
  (function() {
    // 模块逻辑
  })();
</script>
\`\`\``;
}

export function buildModuleUserPrompt(
  moduleIndex: number,
  totalModules: number,
  moduleName: string,
  moduleId: string,
  moduleSpec: string,
  globalStyle: string,
): string {
  return `## 任务
生成第 ${moduleIndex}/${totalModules} 个模块："${moduleName}"（id=${moduleId}）。

## 全局视觉规范
${globalStyle}

## 模块设计规范
${moduleSpec}

## 请开始
严格按照设计规范生成该模块的 HTML 片段，包含：
1. <div id="${moduleId}" class="module"> 容器
2. 该模块的样式（<style>）
3. 该模块的交互逻辑（<script>）

用 \`\`\`html 和 \`\`\` 包裹整个输出，不要添加任何解释文字。`;
}

// ============================================================
// 阶段 3：集成完整 HTML 文档
// ============================================================

export function buildIntegrateSystemPrompt(): string {
  return `你是一位前端架构师。你的任务是将多个模块的 HTML 片段集成为一个完整的 HTML 课件。

## 输出要求
- 一个完整的、可直接运行的 HTML 文档
- 用 \`\`\`html 和 \`\`\` 包裹整个文档
- 包含 <!DOCTYPE html>、<html>、<head>（meta、title、全局 CSS）、<body>

## 集成步骤
1. 创建 HTML 骨架（<!DOCTYPE> + <html> + <head>）
2. 在 <head> 中放置全局视觉规范对应的 CSS（背景、导航栏、Tab 样式、响应式布局）
3. 在 <body> 顶部放置导航栏（含所有模块的 Tab 按钮）
4. 依次插入每个模块的 HTML 片段
5. 将每个模块的 <style> 合并到 <head> 的 <style> 中（或保留在模块附近，二选一保持一致）
6. 将每个模块的 <script> 放在 </body> 之前
7. 在最后添加 Tab 切换的 JS 逻辑：点击 Tab 隐藏其他模块、显示对应模块、高亮当前 Tab

## Tab 切换 JS 模板（必须包含）
\`\`\`javascript
document.addEventListener('DOMContentLoaded', function() {
  var tabs = document.querySelectorAll('.nav-tab');
  var modules = document.querySelectorAll('.module');
  function showModule(id) {
    for (var i = 0; i < modules.length; i++) {
      modules[i].style.display = (modules[i].id === id) ? 'block' : 'none';
    }
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].className = (tabs[j].getAttribute('data-target') === id) ? 'nav-tab active' : 'nav-tab';
    }
  }
  for (var k = 0; k < tabs.length; k++) {
    tabs[k].onclick = function() { showModule(this.getAttribute('data-target')); };
  }
  // 默认显示第一个模块
  if (tabs.length > 0) showModule(tabs[0].getAttribute('data-target'));
});
\`\`\`

## 技术约束
1. JS 用 var/function，不用 let/const/箭头函数/模板字符串
2. Canvas 绑定前检查元素存在
3. 不用 eval()、不用 innerHTML 拼接用户输入
4. 颜色用 #hex 或 rgba()

## 重要
- 不要修改模块内部的内容和样式，只做"组装"
- 不要丢弃任何模块的 <style> 或 <script>
- Tab 切换功能必须工作

## 错误隔离（非常重要）
每个模块的 <script> 必须用 try/catch 包裹起来，确保单个模块的 JS 错误不会影响其他模块和 Tab 切换：

\`\`\`javascript
(function() {
  try {
    // 模块 N 的原始代码
  } catch(e) {
    console.error('模块 N 初始化失败:', e);
  }
})();
\`\`\`

Tab 切换的 JS 代码必须单独放在一个独立的 <script> 块中（不与任何模块代码共用 <script>），确保即使模块脚本出错，Tab 切换仍然可用。`;
}

export function buildIntegrateUserPrompt(
  topic: string,
  subject: string,
  gradeLevel: number,
  designDoc: string,
  moduleFragments: Array<{ id: string; name: string; html: string }>,
): string {
  const fragmentList = moduleFragments
    .map((f, i) => `### 模块${i + 1}：${f.name}（id=${f.id}）\n${f.html}`)
    .join('\n\n---\n\n');

  return `## 课件基本信息
- 主题：${topic}
- 学科：${subject}
- 年级：${gradeLevel}年级

## 设计文档
${designDoc}

## 待集成的模块片段
${fragmentList}

## 请集成
将以上 ${moduleFragments.length} 个模块集成为完整 HTML 文档：
1. 添加 HTML 骨架和全局样式（根据设计文档的"全局视觉规范"和"导航与交互方案"）
2. 顶部导航栏含 ${moduleFragments.length} 个 Tab 按钮
3. 插入所有模块片段
4. 添加 Tab 切换 JS

用 \`\`\`html 和 \`\`\` 包裹整个文档，不要添加任何解释。`;
}

// ============================================================
// 阶段 4：修复（沿用现有逻辑）
// ============================================================

export function buildFixSystemPrompt(): string {
  return `你是一位前端代码修复专家。你的任务是修复 HTML 课件中的问题，输出修复后的完整代码。

## 修复原则
1. 只修复报告的问题，不要"顺手"重写没问题的部分
2. 修复后代码必须仍然是完整的、可独立运行的 HTML 文件
3. 保持原有的设计风格和交互逻辑

## 技术约束
1. 所有 JS 在 DOMContentLoaded 内
2. Canvas 绑定需检查元素存在性
3. 用 var 而非 let/const，用 function 而非箭头函数
4. 不使用 eval()、innerHTML 拼接用户输入
5. 颜色用 #hex 或 rgba() 格式

## 输出格式
- 只输出修复后的完整 HTML 代码
- 用 \`\`\`html 和 \`\`\` 包裹
- 不要在 HTML 前后添加任何解释文字`;
}

export function buildFixUserPrompt(
  originalHtml: string,
  errors: Array<{ code: string; message: string }>,
  warnings: string[],
): string {
  const errorList = errors
    .map((e, i) => `${i + 1}. [${e.code}] ${e.message}`)
    .join('\n');
  const warningList = warnings.length > 0
    ? '\n\n## 警告（建议修复）\n' + warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')
    : '';

  return `## 需要修复的错误
${errorList}
${warningList}

## 待修复的 HTML 代码
\`\`\`html
${originalHtml}
\`\`\`

## 请修复上述错误，输出完整 HTML：`;
}
