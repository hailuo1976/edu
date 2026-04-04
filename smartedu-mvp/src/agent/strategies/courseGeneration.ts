import { AgentConfig, runAgentLoop, AgentResult } from '../core';
import '../../tools'; // 确保工具注册
import { toolRegistry } from '../../tools/registry';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface CourseGenerationResult {
  success: boolean;
  html: string;
  courseId: string;
  iterations: number;
  toolResults: any[];
  error?: string;
}

/** 课程生成只保留搜索工具（HTML 由 AI 直接输出，不通过工具参数传递） */
const COURSE_TOOLS = [
  'search_educational_content',
];

export interface GenerateOptions {
  maxIterations?: number;
  workDir?: string;
  onProgress?: (p: any) => void;
}

/**
 * 课程生成策略
 * 新方案：AI 只搜索教学内容，然后在回复中直接输出完整 HTML（避免大参数导致 API 超时）
 */
export async function generateCourse(
  topic: string,
  subject: string,
  gradeLevel: number,
  options?: GenerateOptions
): Promise<CourseGenerationResult> {
  const courseId = `course_${Date.now()}`;

  const systemPrompt = `你是小学${gradeLevel}年级${subject}课件生成专家。

## 任务
根据用户提供的主题，生成一个完整的交互式 HTML 课件页面。

## 工具
你只有一个工具：search_educational_content(query, subject, grade_level) — 搜索教学参考资料

## 工作流程
1. 先调用 search_educational_content 搜索相关教学内容
2. 基于搜索结果，在回复中直接输出完整的 HTML 页面代码（用 \`\`\`html 代码块包裹）

## HTML 要求
- 完整的 HTML 页面：<!DOCTYPE html> + <html> + <head> + <style> + <body>
- 页面包含三个模块：<section id="concept">概念讲解</section>、<section id="demo">图形演示</section>、<section id="exercise">练习测试</section>
- 使用内联 CSS 样式，色彩鲜明，适合小学生
- 使用 SVG 或 Canvas 绘制教学图形（如几何图形、数轴等）
- 练习模块包含交互式题目（选择题或填空题），点击按钮可检查答案并显示反馈
- 标题包含主题名称和年级信息
- 所有 CSS 和 JS 内联，不依赖外部资源

完成后回复"[课件完成]"`;

  const allTools = toolRegistry.getAll();
  const tools = allTools.filter(t => COURSE_TOOLS.includes(t.name));

  logger.info(`课程工具: ${tools.map(t => t.name).join(', ')} (${tools.length}/${allTools.length})`);

  const agentConfig: AgentConfig = {
    systemPrompt,
    tools,
    maxIterations: options?.maxIterations || 8,
    onProgress: options?.onProgress,
  };

  try {
    const result = await runAgentLoop(topic, agentConfig);

    // 从 AI 回复中提取 HTML
    let html = extractHtml(result);

    if (!html) {
      logger.warn('未能从 AI 回复中提取 HTML，使用 fallback');
      html = generateFallbackHtml(topic, subject, gradeLevel);
    } else {
      // 自动保存 HTML 到文件
      const coursesDir = options?.workDir || 'courses';
      const courseDir = path.join(coursesDir, courseId);
      if (!fs.existsSync(courseDir)) {
        fs.mkdirSync(courseDir, { recursive: true });
      }
      fs.writeFileSync(path.join(courseDir, 'index.html'), html, 'utf-8');
      logger.info(`课程 HTML 已保存: ${courseDir}/index.html (${html.length} 字符)`);
    }

    return {
      success: result.success,
      html,
      courseId,
      iterations: result.iterations,
      toolResults: result.toolResults,
    };
  } catch (error: any) {
    return {
      success: false,
      html: generateFallbackHtml(topic, subject, gradeLevel),
      courseId,
      iterations: 0,
      toolResults: [],
      error: error.message,
    };
  }
}

function extractHtml(result: AgentResult): string {
  // 1. 从所有 AI 回复中找 HTML 代码块
  for (const msg of [...result.messages].reverse()) {
    if (msg.role === 'assistant' && msg.content) {
      const htmlMatch = msg.content.match(/```html\n([\s\S]*?)\n```/);
      if (htmlMatch && htmlMatch[1].includes('<!DOCTYPE')) {
        return htmlMatch[1];
      }
    }
  }

  // 2. 从最终内容中提取
  const content = result.finalContent;
  const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/);
  if (htmlMatch) return htmlMatch[1];
  if (content.includes('<!DOCTYPE html>')) return content;

  return '';
}

function generateFallbackHtml(topic: string, subject: string, gradeLevel: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${gradeLevel}年级${subject} - ${topic}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh;}
    .header{background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:24px 32px;text-align:center;}
    .header h1{font-size:2rem;margin-bottom:8px;}
  </style>
</head>
<body>
  <div class="header"><h1>${topic}</h1><p>${gradeLevel}年级 ${subject}</p></div>
</body>
</html>`;
}
