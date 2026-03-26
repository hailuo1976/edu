import { ValidationResult, ValidationError } from '../types/generation';

export class HtmlValidator {
  private static readonly REQUIRED_ELEMENTS = [
    { tag: 'html', message: '缺少 <html> 标签' },
    { tag: 'head', message: '缺少 <head> 标签' },
    { tag: 'body', message: '缺少 <body> 标签' },
    { tag: 'title', message: '缺少 <title> 标签' },
  ];

  private static readonly REQUIRED_MODULES = [
    { id: 'concept', name: '概念讲解' },
    { id: 'demo', name: '图形演示' },
    { id: 'exercise', name: '练习测试' },
  ];

  validate(html: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (!html || typeof html !== 'string') {
      errors.push({ code: 'EMPTY_CONTENT', message: 'HTML内容为空' });
      return { isValid: false, errors, warnings };
    }

    this.validateStructure(html, errors);
    this.validateDoctype(html, errors);
    this.validateModules(html, errors);
    this.validateCanvas(html, errors);
    this.validateInteractive(html, warnings);
    this.validateClosingTags(html, errors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateDoctype(html: string, errors: ValidationError[]): void {
    const trimmed = html.trim();
    if (!trimmed.startsWith('<!DOCTYPE html>') && !trimmed.startsWith('<html')) {
      errors.push({
        code: 'MISSING_DOCTYPE',
        message: 'HTML必须以 <!DOCTYPE html> 或 <html> 开头',
      });
    }
  }

  private validateStructure(html: string, errors: ValidationError[]): void {
    for (const { tag, message } of HtmlValidator.REQUIRED_ELEMENTS) {
      const pattern = new RegExp(`<${tag}[\\s>]`, 'i');
      if (!pattern.test(html)) {
        errors.push({ code: `MISSING_${tag.toUpperCase()}`, message });
      }
    }
  }

  private validateModules(html: string, errors: ValidationError[]): void {
    for (const { id, name } of HtmlValidator.REQUIRED_MODULES) {
      if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
        errors.push({
          code: `MISSING_MODULE_${id.toUpperCase()}`,
          message: `缺少 "${name}" 模块 (id="${id}")`,
        });
      }
    }

    if (!html.includes('switchTab') && !html.includes('onclick=')) {
      errors.push({
        code: 'MISSING_NAVIGATION',
        message: '缺少模块切换功能',
      });
    }
  }

  private validateCanvas(html: string, errors: ValidationError[]): void {
    if (!html.includes('<canvas')) {
      errors.push({
        code: 'MISSING_CANVAS',
        message: '缺少 Canvas 画布元素',
      });
    }

    if (html.includes('<canvas') && !html.includes('getContext')) {
      warnings: [];
      errors.push({
        code: 'CANVAS_NO_CONTEXT',
        message: 'Canvas 元素缺少绑定代码 (getContext)',
      });
    }
  }

  private validateInteractive(html: string, warnings: string[]): void {
    const hasFormInputs = /<(input|button|select|textarea)/i.test(html);
    const hasEventHandlers = /on(click|change|input|submit|keyup)/i.test(html);
    const hasFeedback = /feedback|correct|wrong|错误|正确/i.test(html);

    if (!hasFormInputs) {
      warnings.push('没有发现表单输入元素');
    }
    if (!hasEventHandlers) {
      warnings.push('没有发现交互事件处理');
    }
    if (!hasFeedback) {
      warnings.push('缺少答案反馈机制');
    }
  }

  private validateClosingTags(html: string, errors: ValidationError[]): void {
    const openTags = ['div', 'span', 'p', 'button'];
    
    for (const tag of openTags) {
      const openCount = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
      const closeCount = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
      
      if (openCount > closeCount) {
        errors.push({
          code: `UNCLOSED_${tag.toUpperCase()}`,
          message: `<${tag}> 标签未闭合 (打开${openCount}个, 关闭${closeCount}个)`,
        });
      }
    }
  }

  sanitize(html: string): string {
    let sanitized = html.trim();
    
    sanitized = sanitized.replace(/^```html\s*/i, '');
    sanitized = sanitized.replace(/^```\s*/i, '');
    sanitized = sanitized.replace(/\s*```$/i, '');
    
    sanitized = sanitized.replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '<!DOCTYPE html>\n');
    
    return sanitized;
  }

  extractHtml(content: string): string {
    const trimmed = content.trim();
    
    const doctypeMatch = trimmed.match(/<!DOCTYPE[^>]*>[\s\S]*?<html/i);
    if (doctypeMatch) {
      const startIndex = doctypeMatch.index!;
      const htmlStart = trimmed.indexOf('<html', startIndex);
      const htmlEnd = trimmed.lastIndexOf('</html>');
      
      if (htmlStart !== -1 && htmlEnd !== -1) {
        return trimmed.substring(htmlStart, htmlEnd + '</html>'.length);
      }
    }
    
    const htmlMatch = trimmed.match(/<html[\s\S]*<\/html>/i);
    if (htmlMatch) {
      return htmlMatch[0];
    }
    
    return trimmed;
  }
}

export const htmlValidator = new HtmlValidator();
