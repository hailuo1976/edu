import { ValidationResult, ValidationError } from '../types/generation';

/**
 * HTML 课件验证器（轻量版）
 *
 * 验证目标：
 *   1. 基本 HTML 语法（DOCTYPE、html/head/body/title、标签闭合）
 *   2. 多模块链接稳定（必须存在 Tab 切换 JS、每个 Tab 对应一个模块容器）
 *
 * 不再强制：
 *   - 必须包含 concept/demo/exercise 三模块（模块由设计文档决定）
 *   - 必须使用 Canvas（学科可能不需要）
 *   - 必须有交互表单（仅作为 warning）
 */
export class HtmlValidator {
  private static readonly REQUIRED_ELEMENTS = [
    { tag: 'html', message: '缺少 <html> 标签' },
    { tag: 'head', message: '缺少 <head> 标签' },
    { tag: 'body', message: '缺少 <body> 标签' },
    { tag: 'title', message: '缺少 <title> 标签' },
  ];

  validate(html: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (!html || typeof html !== 'string') {
      errors.push({ code: 'EMPTY_CONTENT', message: 'HTML内容为空' });
      return { isValid: false, errors, warnings };
    }

    this.validateDoctype(html, errors);
    this.validateStructure(html, errors);
    this.validateModuleLinks(html, errors, warnings);
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

  /**
   * 模块链接稳定性验证：
   *   - 至少存在 2 个 .module 容器
   *   - 每个 .module 都有 id
   *   - 存在 Tab 切换逻辑（showModule / switchTab / data-target / onclick 任一）
   */
  private validateModuleLinks(html: string, errors: ValidationError[], warnings: string[]): void {
    // 统计模块容器
    const moduleMatches = html.match(/<div[^>]*class="[^"]*\bmodule\b[^"]*"[^>]*>/gi) || [];
    if (moduleMatches.length < 2) {
      warnings.push(`模块数量较少（${moduleMatches.length} 个），可能不足以构成多模块课件`);
    }

    // 每个模块容器应该有 id
    const modulesWithoutId = moduleMatches.filter(m => !/id\s*=/.test(m));
    if (modulesWithoutId.length > 0) {
      errors.push({
        code: 'MODULE_WITHOUT_ID',
        message: `${modulesWithoutId.length} 个模块容器缺少 id 属性，Tab 切换将无法定位`,
      });
    }

    // Tab 切换逻辑检查
    const hasTabLogic =
      html.includes('showModule') ||
      html.includes('switchTab') ||
      html.includes('data-target') ||
      /onclick\s*=/i.test(html);

    if (!hasTabLogic) {
      errors.push({
        code: 'MISSING_NAVIGATION',
        message: '缺少模块切换功能（showModule/switchTab/data-target/onclick 均未发现）',
      });
    }

    // Tab 按钮数量与模块数量应一致（警告）
    const tabButtons = html.match(/class="[^"]*\bnav-tab\b[^"]*"/gi) || [];
    if (tabButtons.length > 0 && moduleMatches.length > 0 && tabButtons.length !== moduleMatches.length) {
      warnings.push(
        `Tab 按钮(${tabButtons.length} 个) 与模块数量(${moduleMatches.length} 个) 不一致`,
      );
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
