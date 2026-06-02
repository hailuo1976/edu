/**
 * 课程生成策略 —— 编程智能体模式
 *
 * 流程：设计 → 分模块生成 → 集成 → 验证 → 修复
 * 每步独立的 AI 调用，payload 极小，无 tool_call。
 */

import { chat } from '../../ai/client';
import { Message } from '../../ai/types';
import { ToolResult } from '../../tools/types';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { htmlValidator } from '../../utils/htmlValidator';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildDesignSystemPrompt,
  buildDesignUserPrompt,
  buildModuleSystemPrompt,
  buildModuleUserPrompt,
  buildIntegrateSystemPrompt,
  buildIntegrateUserPrompt,
  buildFixSystemPrompt,
  buildFixUserPrompt,
} from '../../skills/coursePrompt';

// --- Types ---

export interface CourseGenerationResult {
  success: boolean;
  html: string;
  courseId: string;
  iterations: number;
  toolResults: any[];
  fixRounds: number;
  timing: {
    design: number;
    modules: number;
    integrate: number;
    validate: number;
    fix: number;
    total: number;
  };
  /** 模块数量 */
  moduleCount: number;
  error?: string;
}

export interface GenerateOptions {
  maxFixRounds?: number;
  workDir?: string;
  onProgress?: (p: any) => void;
}

interface ModuleSpec {
  id: string;
  name: string;
  spec: string;
  html?: string;
}

// --- HTML 提取 ---

function extractHtmlFromText(text: string): string {
  if (!text) return '';

  const codeBlockMatch = text.match(/```html\n([\s\S]*?)\n```/);
  if (codeBlockMatch && (codeBlockMatch[1].includes('<!DOCTYPE') || codeBlockMatch[1].includes('<html'))) {
    return codeBlockMatch[1].trim();
  }

  const doctypeIdx = text.indexOf('<!DOCTYPE');
  if (doctypeIdx !== -1) {
    const htmlEnd = text.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return text.substring(doctypeIdx, htmlEnd + '</html>'.length).trim();
    }
  }

  const htmlStartIdx = text.indexOf('<html');
  if (htmlStartIdx !== -1) {
    const htmlEnd = text.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return text.substring(htmlStartIdx, htmlEnd + '</html>'.length).trim();
    }
  }

  return '';
}

/** 提取模块片段（div + style + script） */
function extractModuleHtmlFromText(text: string): string {
  if (!text) return '';

  // 优先从 ```html 代码块中提取
  const codeBlockMatch = text.match(/```(?:html)?\n([\s\S]*?)\n```/);
  const content = codeBlockMatch ? codeBlockMatch[1] : text;

  // 找到 <div ... class="module" ...> 或 <div id="xxx" ...> 开始
  const divStart = content.indexOf('<div');
  if (divStart === -1) return content.trim();

  // 末尾可能有 <script>...</script>，找最后的 </script>
  const lastScriptClose = content.lastIndexOf('</script>');
  const lastStyleClose = content.lastIndexOf('</style>');
  const endPos = Math.max(lastScriptClose, lastStyleClose);
  const lastDivClose = content.lastIndexOf('</div>');

  // 取到最末尾的合适位置
  let extractEnd: number;
  if (endPos !== -1) {
    extractEnd = endPos + '</script>'.length;
  } else if (lastDivClose !== -1) {
    extractEnd = lastDivClose + '</div>'.length;
  } else {
    extractEnd = content.length;
  }

  return content.substring(divStart, extractEnd).trim();
}

/**
 * 防御性后处理：保证 Tab 切换脚本始终存在且独立于模块脚本。
 * 思路：在 </body> 前注入一段独立的 Tab 切换 <script>。
 * 如果页面中已存在等价逻辑（showModule），这段脚本会重写绑定，确保可用。
 * 关键：使用 try/catch 包裹，且自身不依赖任何模块代码。
 */
function ensureTabSwitchingScript(html: string): string {
  if (!html) return html;

  const tabSwitchScript = `
<script>
(function() {
  try {
    var tabs = document.querySelectorAll('.nav-tab');
    var modules = document.querySelectorAll('.module');
    if (!tabs.length || !modules.length) return;
    function showModule(id) {
      for (var i = 0; i < modules.length; i++) {
        modules[i].style.display = (modules[i].id === id) ? 'block' : 'none';
      }
      for (var j = 0; j < tabs.length; j++) {
        tabs[j].className = (tabs[j].getAttribute('data-target') === id) ? 'nav-tab active' : 'nav-tab';
      }
      window.dispatchEvent(new Event('resize'));
    }
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].onclick = function() { showModule(this.getAttribute('data-target')); };
    }
    var active = document.querySelector('.nav-tab.active');
    if (active) {
      showModule(active.getAttribute('data-target'));
    } else if (tabs.length > 0) {
      showModule(tabs[0].getAttribute('data-target'));
    }
  } catch(e) {
    console.error('Tab 切换初始化失败:', e);
  }
})();
</script>
</body>`;

  if (/<\/body>\s*<\/html>\s*$/i.test(html)) {
    return html.replace(/<\/body>/i, tabSwitchScript);
  }
  // fallback: 在 </html> 前注入
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, tabSwitchScript + '</html>');
  }
  return html + tabSwitchScript + '</html>';
}

// ============================================================
// 阶段 1：意图理解 + 设计
// ============================================================

async function designCourse(
  topic: string,
  subject: string,
  gradeLevel: number,
  onProgress?: (p: any) => void,
): Promise<string> {
  const startMs = Date.now();
  onProgress?.({ stage: 'design', message: '正在理解需求并设计课件结构...' });

  const messages: Message[] = [
    { role: 'system', content: buildDesignSystemPrompt() },
    { role: 'user', content: buildDesignUserPrompt(topic, subject, gradeLevel) },
  ];

  const response = await chat(messages, [], { maxTokens: 8192 });
  const designDoc = response.content;

  const duration = Date.now() - startMs;
  logger.info(`设计阶段完成: ${designDoc.length} 字符, ${duration}ms`);

  onProgress?.({ stage: 'design', message: '设计完成', designDoc });
  return designDoc;
}

// ============================================================
// 设计文档解析
// ============================================================

/** 从设计文档中提取全局视觉规范 */
function extractGlobalStyle(designDoc: string): string {
  const match = designDoc.match(/## 全局视觉规范\s*\n([\s\S]*?)(?=\n##\s|\n###\s|$)/);
  return match ? match[1].trim() : '主色调：#3b82f6（明亮活泼）；风格：渐变、圆角、阴影';
}

/** 从设计文档中解析模块清单 */
function parseModulesFromDesign(designDoc: string): ModuleSpec[] {
  const modules: ModuleSpec[] = [];

  // 匹配 "### 模块N：xxx（id=xxx）" 或 "### 模块N：xxx(id=xxx)"
  const moduleRegex = /###\s*模块\s*\d+\s*[：:]\s*(.+?)(?:\s*[（(]\s*id\s*=\s*([\w-]+)\s*[）)])?/g;
  // 找到 "## 模块清单" 部分
  const listMatch = designDoc.match(/## 模块清单\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!listMatch) {
    logger.warn('未找到"## 模块清单"章节，使用默认模块');
    return [
      { id: 'concept', name: '概念讲解', spec: '默认概念讲解模块' },
      { id: 'demo', name: '图形演示', spec: '默认图形演示模块' },
      { id: 'exercise', name: '练习测试', spec: '默认练习测试模块' },
    ];
  }

  const listContent = listMatch[1];

  // 用 "### " 分割每个模块
  const sections = listContent.split(/\n###\s+/).filter(s => s.trim());

  for (const section of sections) {
    const firstLineEnd = section.indexOf('\n');
    const header = firstLineEnd === -1 ? section : section.substring(0, firstLineEnd);
    const body = firstLineEnd === -1 ? '' : section.substring(firstLineEnd + 1).trim();

    // 解析 "模块名（id=xxx）" 或 "模块名(id=xxx)"
    let name = header.trim();
    let id = '';

    const idMatch = name.match(/(.+?)[（(]\s*id\s*=\s*([\w-]+)\s*[）)]/);
    if (idMatch) {
      name = idMatch[1].trim();
      id = idMatch[2].trim();
    } else {
      // 没有 id，从名字推断
      if (name.includes('概念') || name.includes('讲解')) id = 'concept';
      else if (name.includes('演示') || name.includes('图形') || name.includes('动画')) id = 'demo';
      else if (name.includes('练习') || name.includes('测试') || name.includes('习题')) id = 'exercise';
      else id = `module_${modules.length + 1}`;
    }

    modules.push({
      id,
      name,
      spec: `### 模块：${name}（id=${id}）\n${body}`,
    });
  }

  if (modules.length === 0) {
    logger.warn('解析模块清单为空，使用默认模块');
    return [
      { id: 'concept', name: '概念讲解', spec: '默认概念讲解模块' },
      { id: 'demo', name: '图形演示', spec: '默认图形演示模块' },
      { id: 'exercise', name: '练习测试', spec: '默认练习测试模块' },
    ];
  }

  logger.info(`从设计文档解析出 ${modules.length} 个模块: ${modules.map(m => `${m.name}(${m.id})`).join(', ')}`);
  return modules;
}

// ============================================================
// 阶段 2：分模块生成
// ============================================================

async function generateModule(
  moduleSpec: ModuleSpec,
  globalStyle: string,
  gradeLevel: number,
  subject: string,
  moduleIndex: number,
  totalModules: number,
  onProgress?: (p: any) => void,
): Promise<string> {
  const startMs = Date.now();
  onProgress?.({
    stage: 'module_generate',
    message: `生成模块 ${moduleIndex}/${totalModules}：${moduleSpec.name}...`,
    moduleIndex,
    moduleName: moduleSpec.name,
    moduleId: moduleSpec.id,
  });

  const messages: Message[] = [
    { role: 'system', content: buildModuleSystemPrompt(gradeLevel, subject) },
    {
      role: 'user',
      content: buildModuleUserPrompt(
        moduleIndex,
        totalModules,
        moduleSpec.name,
        moduleSpec.id,
        moduleSpec.spec,
        globalStyle,
      ),
    },
  ];

  const response = await chat(messages, [], { maxTokens: 32768 });
  let fragment = extractModuleHtmlFromText(response.content);

  if (!fragment) {
    logger.warn(`模块 ${moduleSpec.name} 生成结果为空，使用原始响应`);
    fragment = response.content;
  }

  const duration = Date.now() - startMs;
  logger.info(`模块 ${moduleIndex}/${totalModules} "${moduleSpec.name}" 生成完成: ${fragment.length} 字符, ${duration}ms`);

  return fragment;
}

async function generateAllModules(
  modules: ModuleSpec[],
  globalStyle: string,
  gradeLevel: number,
  subject: string,
  onProgress?: (p: any) => void,
): Promise<ModuleSpec[]> {
  const startMs = Date.now();
  const results: ModuleSpec[] = [];

  for (let i = 0; i < modules.length; i++) {
    const module = modules[i];
    let html: string;
    try {
      html = await generateModule(
        module, globalStyle, gradeLevel, subject,
        i + 1, modules.length, onProgress,
      );
    } catch (err: any) {
      logger.warn(`模块 ${module.name} 生成失败: ${err.message}，使用占位符`);
      html = `<div id="${module.id}" class="module"><h2>${module.name}</h2><p>本模块生成失败，请重试。</p></div>`;
    }
    results.push({ ...module, html });
  }

  const duration = Date.now() - startMs;
  logger.info(`所有模块生成完成: ${results.length} 个, ${duration}ms`);
  return results;
}

// ============================================================
// 阶段 3：集成
// ============================================================

async function integrateCourse(
  topic: string,
  subject: string,
  gradeLevel: number,
  designDoc: string,
  modules: ModuleSpec[],
  courseDir: string,
  onProgress?: (p: any) => void,
): Promise<string> {
  const startMs = Date.now();
  onProgress?.({ stage: 'integrate', message: `正在集成 ${modules.length} 个模块...` });

  const fragments = modules
    .filter(m => m.html)
    .map(m => ({ id: m.id, name: m.name, html: m.html! }));

  const messages: Message[] = [
    { role: 'system', content: buildIntegrateSystemPrompt() },
    {
      role: 'user',
      content: buildIntegrateUserPrompt(topic, subject, gradeLevel, designDoc, fragments),
    },
  ];

  const response = await chat(messages, [], { maxTokens: 65536 });
  let html = extractHtmlFromText(response.content);

  if (!html) {
    logger.warn('集成阶段未能提取 HTML，尝试直接使用响应');
    html = response.content;
  }

  // 防御性后处理：保证 Tab 切换始终可用
  html = ensureTabSwitchingScript(html);

  // 保存到文件
  if (html) {
    fs.writeFileSync(path.join(courseDir, 'index.html'), html, 'utf-8');
  }

  const duration = Date.now() - startMs;
  logger.info(`集成阶段完成: ${html.length} 字符, ${duration}ms`);

  return html;
}

// ============================================================
// 阶段 4：验证（沿用旧逻辑）
// ============================================================

interface ValidationReport {
  isValid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: string[];
}

function validateHtml(html: string): ValidationReport {
  if (!html) {
    return {
      isValid: false,
      errors: [{ code: 'EMPTY', message: 'HTML 内容为空' }],
      warnings: [],
    };
  }

  const result = htmlValidator.validate(html);
  return {
    isValid: result.isValid,
    errors: result.errors,
    warnings: result.warnings || [],
  };
}

// ============================================================
// 阶段 5：修复（沿用旧逻辑）
// ============================================================

async function fixHtml(
  html: string,
  errors: Array<{ code: string; message: string }>,
  warnings: string[],
  maxRounds: number,
  onProgress?: (p: any) => void,
): Promise<{ html: string; rounds: number }> {
  let currentHtml = html;
  let currentErrors = errors;
  let currentWarnings = warnings;

  for (let round = 1; round <= maxRounds; round++) {
    const startMs = Date.now();
    onProgress?.({
      stage: 'fix',
      message: `修复第 ${round}/${maxRounds} 轮，${currentErrors.length} 个错误`,
    });

    logger.info(`修复第 ${round} 轮: ${currentErrors.length} 个错误, ${currentWarnings.length} 个警告`);

    const messages: Message[] = [
      { role: 'system', content: buildFixSystemPrompt() },
      { role: 'user', content: buildFixUserPrompt(currentHtml, currentErrors, currentWarnings) },
    ];

    const response = await chat(messages, [], { maxTokens: 65536 });
    const fixedHtml = extractHtmlFromText(response.content);

    if (!fixedHtml) {
      logger.warn(`修复第 ${round} 轮: 未能提取 HTML，保留原版本`);
      continue;
    }

    const report = validateHtml(fixedHtml);
    const duration = Date.now() - startMs;
    logger.info(`修复第 ${round} 轮完成: ${report.errors.length} 个错误剩余, ${duration}ms`);

    currentHtml = fixedHtml;

    if (report.isValid) {
      logger.info('修复成功，所有验证通过');
      return { html: currentHtml, rounds: round };
    }

    currentErrors = report.errors;
    currentWarnings = report.warnings;
  }

  logger.warn(`修复 ${maxRounds} 轮后仍有 ${currentErrors.length} 个错误`);
  return { html: currentHtml, rounds: maxRounds };
}

// ============================================================
// 主流程
// ============================================================

export async function generateCourse(
  topic: string,
  subject: string,
  gradeLevel: number,
  options?: GenerateOptions,
): Promise<CourseGenerationResult> {
  const totalStart = Date.now();
  const courseId = `course_${Date.now()}`;
  const maxFixRounds = options?.maxFixRounds ?? 2;
  const onProgress = options?.onProgress;

  const timing = { design: 0, modules: 0, integrate: 0, validate: 0, fix: 0, total: 0 };

  try {
    // 创建课程目录
    const coursesDir = options?.workDir || config.paths.courses;
    const courseDir = path.join(coursesDir, courseId);
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }

    // 阶段 1：设计
    const designStart = Date.now();
    const designDoc = await designCourse(topic, subject, gradeLevel, onProgress);
    timing.design = Date.now() - designStart;

    // 解析模块清单 + 全局视觉规范
    const modules = parseModulesFromDesign(designDoc);
    const globalStyle = extractGlobalStyle(designDoc);

    if (modules.length === 0) {
      throw new Error('设计文档未解析出任何模块');
    }

    onProgress?.({ stage: 'design', message: `设计完成：${modules.length} 个模块` });

    // 阶段 2：分模块生成
    const modulesStart = Date.now();
    const moduleResults = await generateAllModules(
      modules, globalStyle, gradeLevel, subject, onProgress,
    );
    timing.modules = Date.now() - modulesStart;

    // 阶段 3：集成
    const integrateStart = Date.now();
    let html = await integrateCourse(
      topic, subject, gradeLevel, designDoc, moduleResults, courseDir, onProgress,
    );
    timing.integrate = Date.now() - integrateStart;

    if (!html || html.length < 100) {
      logger.warn(`集成后 HTML 内容过短 (${html?.length || 0} 字符)`);
      return {
        success: false,
        html: generateFallbackHtml(topic, subject, gradeLevel),
        courseId,
        iterations: 0,
        toolResults: [],
        fixRounds: 0,
        timing: { ...timing, total: Date.now() - totalStart },
        moduleCount: modules.length,
        error: 'HTML 集成失败',
      };
    }

    // 阶段 4：验证
    const valStart = Date.now();
    const report = validateHtml(html);
    timing.validate = Date.now() - valStart;

    logger.info(`验证结果: ${report.isValid ? '通过' : '失败'}, ${report.errors.length} 错误, ${report.warnings.length} 警告`);

    // 阶段 5：修复
    let fixRounds = 0;
    if (!report.isValid && report.errors.length > 0) {
      const fixStart = Date.now();
      const fixResult = await fixHtml(html, report.errors, report.warnings, maxFixRounds, onProgress);
      html = fixResult.html;
      fixRounds = fixResult.rounds;
      timing.fix = Date.now() - fixStart;

      // 更新文件
      const indexPath = path.join(courseDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, html, 'utf-8');
      }
    }

    // 最终验证
    const finalReport = validateHtml(html);
    timing.total = Date.now() - totalStart;

    logger.info(`课程生成完成: ${html.length} 字符, ${modules.length} 模块, ${fixRounds} 轮修复, 最终${finalReport.isValid ? '通过' : '仍有问题'}, 总耗时 ${timing.total}ms`);

    return {
      success: finalReport.isValid,
      html,
      courseId,
      iterations: 1 + moduleResults.length + 1, // 设计 + 模块 + 集成
      toolResults: [],
      fixRounds,
      timing,
      moduleCount: modules.length,
    };
  } catch (error: any) {
    timing.total = Date.now() - totalStart;
    logger.error(`课程生成失败: ${error.message}`);

    return {
      success: false,
      html: generateFallbackHtml(topic, subject, gradeLevel),
      courseId,
      iterations: 0,
      toolResults: [],
      fixRounds: 0,
      timing,
      moduleCount: 0,
      error: error.message,
    };
  }
}

// --- Fallback ---

function generateFallbackHtml(topic: string, subject: string, gradeLevel: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${gradeLevel}年级${subject} - ${topic}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .notice { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); max-width: 500px; }
    .notice h1 { color: #3b82f6; margin-bottom: 16px; }
    .notice p { color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="notice">
    <h1>${topic}</h1>
    <p>${gradeLevel}年级 ${subject}</p>
    <p style="margin-top:16px;color:#ef4444;">课件生成遇到问题，请重试。</p>
  </div>
</body>
</html>`;
}
