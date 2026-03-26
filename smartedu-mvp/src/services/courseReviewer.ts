import {
  QualityScore,
  QualityIssue,
  QualityThreshold,
  DEFAULT_QUALITY_THRESHOLD,
} from '../types/refinement';

interface ReviewCriteria {
  pattern: RegExp;
  weight: number;
  message: string;
  category: QualityIssue['category'];
  severity: QualityIssue['severity'];
}

export class CourseReviewer {
  private criteria: ReviewCriteria[];
  private threshold: QualityThreshold;

  constructor(threshold: Partial<QualityThreshold> = {}) {
    this.threshold = { ...DEFAULT_QUALITY_THRESHOLD, ...threshold };
    this.criteria = this.buildCriteria();
  }

  private buildCriteria(): ReviewCriteria[] {
    return [
      {
        pattern: /<!DOCTYPE\s+html>/i,
        weight: 10,
        message: '缺少 DOCTYPE 声明',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /<html[^>]*>/i,
        weight: 10,
        message: '缺少 <html> 标签',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /<head[^>]*>[\s\S]*<\/head>/i,
        weight: 10,
        message: '缺少 <head> 标签',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /<body[^>]*>[\s\S]*<\/body>/i,
        weight: 10,
        message: '缺少 <body> 标签',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /id=["']concept["']/i,
        weight: 15,
        message: '缺少概念讲解模块 (id="concept")',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /id=["']demo["']/i,
        weight: 15,
        message: '缺少图形演示模块 (id="demo")',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /id=["']exercise["']/i,
        weight: 15,
        message: '缺少练习测试模块 (id="exercise")',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /<canvas[^>]+id=["'][^"']+["'][^>]*>/i,
        weight: 12,
        message: 'Canvas 元素缺少 id 属性',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /getContext\s*\(\s*["']2d["']\s*\)/i,
        weight: 12,
        message: 'Canvas 未正确初始化 getContext',
        category: 'format',
        severity: 'critical',
      },
      {
        pattern: /<script[^>]*>[\s\S]*?<\/script>/gi,
        weight: 10,
        message: 'JavaScript 代码格式错误',
        category: 'format',
        severity: 'warning',
      },
      {
        pattern: /[\u4e00-\u9fa5]{50,}/i,
        weight: 5,
        message: '存在过长的中文段落，建议拆分',
        category: 'pedagogy',
        severity: 'info',
      },
      {
        pattern: /<canvas[^>]*>/gi,
        weight: 8,
        message: 'Canvas 尺寸设置检查',
        category: 'interaction',
        severity: 'warning',
      },
    ];
  }

  review(html: string, prompt?: string): QualityScore {
    const issues: QualityIssue[] = [];
    
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

    issues.push(...this.reviewContent(html, prompt));
    issues.push(...this.reviewInteraction(html));
    issues.push(...this.reviewSafety(html));

    const dimensions = this.calculateDimensions(issues);
    const overall = this.calculateOverallScore(dimensions);

    return {
      overall,
      dimensions,
      issues,
      passed: this.checkPass(overall, dimensions),
    };
  }

  private reviewContent(html: string, prompt?: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    const hasEducationalContent = /[\u4e00-\u9fa5]{20,}/.test(html);
    if (!hasEducationalContent) {
      issues.push({
        severity: 'critical',
        category: 'content',
        message: '缺少教学内容或内容过短',
        suggestion: '请添加详细的教育内容，使用生动的语言解释概念',
      });
    }

    const paragraphCount = (html.match(/<p[^>]*>/gi) || []).length;
    if (paragraphCount < 3) {
      issues.push({
        severity: 'warning',
        category: 'pedagogy',
        message: '内容段落过少，建议添加更多解释性内容',
        suggestion: '每个概念至少包含一个解释段落',
      });
    }

    const hasFormula = /[\u4e00-\u9fa5]+[=:]/i.test(html) || /[SVAa-z]/.test(html);
    if (!hasFormula) {
      issues.push({
        severity: 'info',
        category: 'pedagogy',
        message: '建议添加数学公式或符号',
        suggestion: '使用公式框展示关键公式',
      });
    }

    return issues;
  }

  private reviewInteraction(html: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    const buttonCount = (html.match(/<button/gi) || []).length;
    if (buttonCount < 2) {
      issues.push({
        severity: 'warning',
        category: 'interaction',
        message: '交互元素过少',
        suggestion: '添加更多按钮、输入框等交互元素',
      });
    }

    const hasCanvas = /<canvas/i.test(html);
    if (hasCanvas) {
      const hasAnimation = /requestAnimationFrame|setInterval|animate\(/i.test(html);
      if (!hasAnimation) {
        issues.push({
          severity: 'info',
          category: 'interaction',
          message: 'Canvas 存在但缺少动画效果',
          suggestion: '添加动画效果使演示更生动',
        });
      }
    }

    const hasInput = /<input|textarea/gi.test(html);
    if (!hasInput) {
      issues.push({
        severity: 'info',
        category: 'interaction',
        message: '缺少用户输入元素',
        suggestion: '添加输入框让用户参与练习',
      });
    }

    return issues;
  }

  private reviewSafety(html: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    const dangerousPatterns = [
      { pattern: /eval\s*\(/i, message: '发现 eval() 使用，存在安全风险' },
      { pattern: /document\.write\s*\(/i, message: '发现 document.write() 使用，存在 XSS 风险' },
      { pattern: /innerHTML\s*=\s*[^"']*\$/i, message: 'innerHTML 赋值可能存在 XSS 风险' },
      { pattern: /onclick\s*=\s*["'][^"']*\$/i, message: '事件处理器中存在潜在 XSS 风险' },
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

  private calculateDimensions(issues: QualityIssue[]): QualityScore['dimensions'] {
    const dimensionWeights = {
      pedagogy: 0.25,
      content: 0.25,
      interaction: 0.2,
      safety: 0.2,
      format: 0.1,
    };

    const dimensionIssues = {
      pedagogy: 0,
      content: 0,
      interaction: 0,
      safety: 0,
      format: 0,
    };

    for (const issue of issues) {
      const severityWeight = issue.severity === 'critical' ? 30 : issue.severity === 'warning' ? 15 : 5;
      dimensionIssues[issue.category] += severityWeight;
    }

    const dimensions: QualityScore['dimensions'] = {
      pedagogy: Math.max(0, 100 - dimensionIssues.pedagogy * 1.5),
      content: Math.max(0, 100 - dimensionIssues.content * 1.5),
      interaction: Math.max(0, 100 - dimensionIssues.interaction * 1.5),
      safety: Math.max(0, 100 - dimensionIssues.safety * 2),
      format: Math.max(0, 100 - dimensionIssues.format * 1.2),
    };

    return dimensions;
  }

  private calculateOverallScore(dimensions: QualityScore['dimensions']): number {
    const weights = {
      pedagogy: 0.25,
      content: 0.25,
      interaction: 0.2,
      safety: 0.2,
      format: 0.1,
    };

    return Math.round(
      dimensions.pedagogy * weights.pedagogy +
      dimensions.content * weights.content +
      dimensions.interaction * weights.interaction +
      dimensions.safety * weights.safety +
      dimensions.format * weights.format
    );
  }

  private checkPass(overall: number, dimensions: QualityScore['dimensions']): boolean {
    if (overall < this.threshold.overall) return false;
    if (dimensions.pedagogy < this.threshold.pedagogy) return false;
    if (dimensions.content < this.threshold.content) return false;
    if (dimensions.interaction < this.threshold.interaction) return false;
    if (dimensions.safety < this.threshold.safety) return false;
    if (dimensions.format < this.threshold.format) return false;

    const criticalIssues = dimensions.safety < 100;
    if (criticalIssues) return false;

    return true;
  }

  private getSuggestion(criterion: ReviewCriteria): string {
    const suggestions: Record<string, string> = {
      '缺少 DOCTYPE 声明': '在 HTML 文件开头添加 <!DOCTYPE html>',
      '缺少 <html> 标签': '添加 <html> 和 </html> 标签包裹整个文档',
      '缺少 <head> 标签': '添加 <head> 和 </head> 标签，包含元信息和样式',
      '缺少 <body> 标签': '添加 <body> 和 </body> 标签，包含可见内容',
      '缺少概念讲解模块 (id="concept")': '添加 <div id="concept"> 包含概念讲解内容',
      '缺少图形演示模块 (id="demo")': '添加 <div id="demo"> 包含 Canvas 或 SVG 演示',
      '缺少练习测试模块 (id="exercise")': '添加 <div id="exercise"> 包含练习题目',
      'Canvas 元素缺少 id 属性': '确保每个 Canvas 都有唯一的 id 属性',
      'Canvas 未正确初始化 getContext': '调用 canvas.getContext("2d") 初始化绘图上下文',
    };
    return suggestions[criterion.message] || '请检查并修复此问题';
  }

  generateFixPrompt(html: string, score: QualityScore): string {
    const criticalIssues = score.issues.filter(i => i.severity === 'critical');
    const warningIssues = score.issues.filter(i => i.severity === 'warning');

    let prompt = `请修复以下课件中的问题：

当前得分: ${score.overall}/100
`;

    if (criticalIssues.length > 0) {
      prompt += '\n【必须修复的问题】\n';
      criticalIssues.forEach((issue, index) => {
        prompt += `${index + 1}. ${issue.message}`;
        if (issue.suggestion) {
          prompt += ` → ${issue.suggestion}`;
        }
        prompt += '\n';
      });
    }

    if (warningIssues.length > 0) {
      prompt += '\n【建议修复的问题】\n';
      warningIssues.forEach((issue, index) => {
        prompt += `${index + 1}. ${issue.message}`;
        if (issue.suggestion) {
          prompt += ` → ${issue.suggestion}`;
        }
        prompt += '\n';
      });
    }

    prompt += `
请直接输出修复后的完整 HTML 代码，不要包含任何解释或 markdown 代码块标记。
确保：
1. HTML 结构完整且规范
2. 包含完整的三个模块：concept、demo、exercise
3. Canvas 正确初始化
4. JavaScript 代码语法正确
`;

    return prompt;
  }
}

export const courseReviewer = new CourseReviewer();
