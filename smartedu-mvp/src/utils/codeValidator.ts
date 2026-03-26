import * as vm from 'vm';
import { ValidationResult, ValidationError } from '../types/generation';

export interface CodeValidationOptions {
  enableJsSandbox?: boolean;
  timeout?: number;
  memoryLimit?: number;
}

interface JsValidationResult {
  canExecute: boolean;
  syntaxErrors: string[];
  runtimeErrors: string[];
  warnings: string[];
}

export class CodeValidator {
  private options: Required<CodeValidationOptions>;

  constructor(options: CodeValidationOptions = {}) {
    this.options = {
      enableJsSandbox: options.enableJsSandbox ?? false, // 默认关闭，避免误报
      timeout: options.timeout ?? 5000,
      memoryLimit: options.memoryLimit ?? 128 * 1024 * 1024
    };
  }

  validateHtmlInteractive(html: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    this.validateScriptTags(html, errors, warnings);
    this.validateEventHandlers(html, errors, warnings);
    this.validateCanvasInitialization(html, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateScriptTags(html: string, errors: ValidationError[], warnings: (string | ValidationError)[]): void {
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptCount = 0;

    while ((match = scriptRegex.exec(html)) !== null) {
      scriptCount++;
      const scriptContent = match[1].trim();
      
      if (scriptContent) {
        const jsValidation = this.validateJavaScript(scriptContent);
        
        errors.push(...jsValidation.syntaxErrors.map(msg => ({
          code: 'JS_SYNTAX_ERROR',
          message: `Script标签内语法错误: ${msg}`
        })));

        warnings.push(...jsValidation.warnings.map(msg => ({
          code: 'JS_WARNING',
          message: `Script标签警告: ${msg}`
        })));
      }
    }

    if (scriptCount === 0) {
      warnings.push({
        code: 'NO_SCRIPT',
        message: '未发现<script>标签，交互功能可能无法工作'
      } as any);
    }
  }

  private validateEventHandlers(html: string, errors: ValidationError[], warnings: (string | ValidationError)[]): void {
    const eventHandlers = ['onclick', 'onchange', 'oninput', 'onsubmit', 'onkeyup', 'onload'];
    const foundHandlers: string[] = [];

    for (const handler of eventHandlers) {
      if (html.includes(handler)) {
        foundHandlers.push(handler);
      }
    }

    if (foundHandlers.length === 0) {
      warnings.push({
        code: 'NO_EVENT_HANDLERS',
        message: '未发现事件处理函数，页面可能无交互功能'
      } as any);
    }

    const inlineHandlers = html.match(/on\w+\s*=\s*["']([^"']+)["']/g);
    if (inlineHandlers) {
      warnings.push({
        code: 'INLINE_HANDLERS',
        message: `发现 ${inlineHandlers.length} 个内联事件处理器，建议使用addEventListener`
      } as any);
    }
  }

  private validateCanvasInitialization(html: string, errors: ValidationError[], warnings: (string | ValidationError)[]): void {
    const hasCanvas = /<canvas[\s>]/i.test(html);
    
    if (hasCanvas) {
      const hasGetContext = html.includes('getContext');
      const hasCanvasId = html.match(/<canvas[^>]+id\s*=\s*["']([^"']+)["']/i);
      
      if (!hasGetContext) {
        errors.push({
          code: 'CANVAS_NO_CONTEXT',
          message: 'Canvas元素未调用getContext()进行初始化'
        });
      }

      if (!hasCanvasId) {
        warnings.push({
          code: 'CANVAS_NO_ID',
          message: 'Canvas元素缺少id属性，难以通过JavaScript获取'
        } as any);
      }

      const hasDrawCode = /getContext|fillRect|strokeRect|beginPath|moveTo|lineTo|arc|drawImage/i.test(html);
      if (!hasDrawCode) {
        warnings.push({
          code: 'CANVAS_NO_DRAWING',
          message: 'Canvas可能没有绘图代码'
        } as any);
      }
    }
  }

  validateJavaScript(code: string): JsValidationResult {
    const result: JsValidationResult = {
      canExecute: true,
      syntaxErrors: [],
      runtimeErrors: [],
      warnings: []
    };

    if (!this.options.enableJsSandbox) {
      return result;
    }

    const scriptContent = this.extractScriptContent(code);
    
    if (!scriptContent) {
      result.warnings.push('未找到<script>标签');
      return result;
    }

    const syntaxErrors = this.checkSyntax(scriptContent);
    result.syntaxErrors = syntaxErrors;

    if (syntaxErrors.length > 0) {
      result.canExecute = false;
      return result;
    }

    if (this.options.enableJsSandbox) {
      const runtimeResult = this.runInSandbox(scriptContent);
      result.runtimeErrors = runtimeResult.errors;
      result.warnings = runtimeResult.warnings;
      
      if (runtimeResult.errors.length > 0) {
        result.canExecute = false;
      }
    }

    return result;
  }

  private extractScriptContent(html: string): string | null {
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const contents: string[] = [];
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1].trim();
      if (content) {
        contents.push(content);
      }
    }

    if (contents.length === 0) return null;
    return contents.join('\n');
  }

  private checkSyntax(code: string): string[] {
    const errors: string[] = [];
    
    try {
      new vm.Script(code, { filename: 'sandbox.js' });
    } catch (error: any) {
      errors.push(error.message);
    }

    return errors;
  }

  private runInSandbox(code: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const logs: string[] = [];

    const mockCanvas = {
      getContext: (type: string) => ({
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        drawImage: () => {},
        clearRect: () => {},
        fillText: () => {},
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0
      }),
      addEventListener: () => {},
      style: {}
    };

    const mockElement = {
      getContext: (type: string) => mockCanvas.getContext(type),
      addEventListener: () => {},
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      checked: false,
      classList: { add: () => {}, remove: () => {} },
      getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 })
    };

    const sandbox = {
      console: {
        log: (...args: any[]) => logs.push(args.map(String).join(' ')),
        warn: (...args: any[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
        error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' '))
      },
      setTimeout: () => { warnings.push('setTimeout被禁用'); },
      setInterval: () => { warnings.push('setInterval被禁用'); },
      fetch: () => { warnings.push('fetch被禁用'); },
      XMLHttpRequest: undefined,
      require: undefined,
      process: undefined,
      Buffer: undefined,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      JSON,
      Map,
      Set,
      Promise,
      document: {
        getElementById: () => mockElement,
        querySelector: () => mockElement,
        querySelectorAll: () => [],
        createElement: () => mockElement,
        body: mockElement,
        head: mockElement
      }
    };

    try {
      const script = new vm.Script(`
        (function() {
          ${code}
        })()
      `);
      
      const context = vm.createContext(sandbox);
      
      script.runInContext(context, {
        timeout: this.options.timeout,
        displayErrors: true
      });

    } catch (error: any) {
      if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        errors.push('脚本执行超时');
      } else {
        errors.push(`运行时错误: ${error.message}`);
      }
    }

    return { errors, warnings };
  }

  validateAll(html: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: (string | ValidationError)[] = [];

    const interactiveResult = this.validateHtmlInteractive(html);
    errors.push(...interactiveResult.errors);
    warnings.push(...interactiveResult.warnings);

    const jsValidation = this.validateJavaScript(html);
    if (!jsValidation.canExecute) {
      errors.push(...jsValidation.syntaxErrors.map(msg => ({
        code: 'JS_ERROR',
        message: msg
      })));
      errors.push(...jsValidation.runtimeErrors.map(msg => ({
        code: 'JS_RUNTIME_ERROR',
        message: msg
      })));
    }

    warnings.push(...jsValidation.warnings.map(msg => ({
      code: 'JS_WARNING',
      message: msg
    })));

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.map(w => typeof w === 'string' ? w : w.message)
    };
  }
}

export const codeValidator = new CodeValidator();
