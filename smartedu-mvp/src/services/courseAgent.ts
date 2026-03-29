import { OpenCodeClient } from './opencode';
import { htmlValidator, HtmlValidator } from '../utils/htmlValidator';
import { codeValidator, CodeValidator } from '../utils/codeValidator';
import { localKnowledgeSearch, LocalKnowledgeSearch } from './localSearch';
import { webSearchService, WebSearchService, SearchResult } from './webSearch';
import {
  RefinementLoop,
  RefinementResult,
  RefinementProgressCallback,
} from './refinementLoop';
import {
  QualityScore,
  QualityThreshold,
  RefinementOptions,
  RefinementProgress,
  RefinementStatus,
  DEFAULT_REFINEMENT_OPTIONS,
} from '../types/refinement';
import {
  GenerationError,
  GenerationErrorType,
  GenerationOptions,
  GenerationProgress,
  ProgressCallback,
  ValidationResult,
  ValidationError
} from '../types/generation';
import { initAISystem, agentFactory, promptManager } from '../core/ai';

const DEFAULT_OPTIONS: GenerationOptions = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 300000,
  enableValidation: true,
  enableFallback: true,
  enableWebSearch: false,
  enableLocalSearch: true,
  enableCodeValidation: true,
  searchResultCount: 3,
  enableQualityRefinement: true,
  qualityThreshold: DEFAULT_REFINEMENT_OPTIONS.threshold,
  maxRefinementAttempts: DEFAULT_REFINEMENT_OPTIONS.maxRefinementAttempts,
};

export interface GenerationResult {
  success: boolean;
  html: string;
  courseId?: string;
  validation?: ValidationResult;
  qualityScore?: QualityScore;
  attempts: number;
  duration: number;
  error?: GenerationError;
}

export class CourseAgent {
  private client: OpenCodeClient;
  private validator: HtmlValidator;
  private codeValidator: CodeValidator;
  private webSearch: WebSearchService;
  private localSearch: LocalKnowledgeSearch;
  private refinementLoop: RefinementLoop;
  private options: GenerationOptions;

  constructor(options: Partial<GenerationOptions> = {}) {
    // 初始化AI系统
    initAISystem();
    
    this.client = new OpenCodeClient();
    this.validator = htmlValidator;
    this.codeValidator = codeValidator;
    this.webSearch = webSearchService;
    this.localSearch = localKnowledgeSearch;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    const refinementOptions: Partial<RefinementOptions> = {
      maxRefinementAttempts: this.options.maxRefinementAttempts,
      threshold: this.options.qualityThreshold,
    };
    this.refinementLoop = new RefinementLoop(refinementOptions);
  }

  async generateWithRefinement(
    prompt: string,
    onProgress?: ProgressCallback,
    courseId?: string
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    if (!this.options.enableQualityRefinement) {
      return this.generate(prompt, onProgress, courseId);
    }

    // 使用新的提示词管理系统生成提示词
    const promptParams = {
      user_question: prompt,
      subject: '数学',
      grade_text: '小学',
      difficulty_text: '中等',
      duration_minutes: 25
    };
    
    const refinedPrompt = promptManager.generatePrompt('course-generation', promptParams);

    this.reportProgress({
      stage: 'prompt',
      message: '开始多轮调优生成...',
      timestamp: Date.now(),
      promptPreview: this.getPromptPreview(refinedPrompt),
    });

    const refinementProgressCallback: RefinementProgressCallback = (progress) => {
      const stageMap: Record<RefinementStatus, GenerationProgress['stage']> = {
        [RefinementStatus.IDLE]: 'prompt',
        [RefinementStatus.GENERATING]: 'api_call',
        [RefinementStatus.REVIEWING]: 'review',
        [RefinementStatus.FIXING]: 'refine',
        [RefinementStatus.PASSED]: 'complete',
        [RefinementStatus.FAILED]: 'error',
      };

      if (onProgress) {
        onProgress({
          stage: stageMap[progress.status] || 'validate',
          message: progress.message,
          timestamp: Date.now(),
          retryCount: progress.currentAttempt,
          qualityScore: progress.currentScore ? {
            overall: progress.currentScore.overall,
            passed: progress.currentScore.passed,
            dimensions: progress.currentScore.dimensions,
          } : undefined,
          issues: progress.issues,
        });
      }
    };

    try {
      const result = await this.refinementLoop.execute(refinedPrompt, refinementProgressCallback);

      this.reportProgress({
        stage: 'complete',
        message: `生成完成! 最终得分: ${result.finalScore?.overall || 0}/100`,
        timestamp: Date.now(),
        qualityScore: result.finalScore ? {
          overall: result.finalScore.overall,
          passed: result.finalScore.passed,
          dimensions: result.finalScore.dimensions,
        } : undefined,
        issues: result.finalScore?.issues,
        totalDuration: Date.now() - startTime,
      });

      return {
        success: result.success,
        html: result.html,
        courseId: courseId || this.generateCourseId(prompt),
        qualityScore: result.finalScore,
        attempts: result.context.attempts,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('[CourseAgent] 多轮调优失败:', error);
      return {
        success: false,
        html: '',
        courseId,
        attempts: 1,
        duration: Date.now() - startTime,
        error: new GenerationError(
          `多轮调优失败: ${error.message}`,
          GenerationErrorType.API_ERROR,
          error,
          true
        ),
      };
    }
  }

  async generate(
    prompt: string,
    onProgress?: ProgressCallback,
    courseId?: string
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: GenerationError | undefined;
    let searchResults: SearchResult[] = [];
    let enrichedPrompt = prompt;
    let codeValidationErrors: ValidationError[] = [];
    const originalPrompt = prompt;

    this.reportProgress({
      stage: 'prompt',
      message: '开始生成课件...',
      timestamp: Date.now(),
    });

    if (this.options.enableWebSearch && this.webSearch.isConfigured()) {
      this.reportProgress({
        stage: 'search',
        message: '正在搜索相关教学资料...',
        timestamp: Date.now(),
      });

      const topic = this.extractTopic(prompt);
      searchResults = await this.webSearch.searchEducationalContent(topic);
      
      if (searchResults.length > 0) {
        enrichedPrompt = this.enrichPromptWithSearch(prompt, searchResults);
        this.reportProgress({
          stage: 'search',
          message: `已获取 ${searchResults.length} 条相关资料`,
          timestamp: Date.now(),
        });
      } else {
        this.reportProgress({
          stage: 'search',
          message: '未找到相关资料，使用原始prompt',
          timestamp: Date.now(),
        });
      }
    }

    if (this.options.enableLocalSearch && searchResults.length === 0) {
      this.reportProgress({
        stage: 'search',
        message: '正在本地知识库搜索...',
        timestamp: Date.now(),
      });

      const topic = this.extractTopic(prompt);
      searchResults = this.localSearch.search(topic);

      if (searchResults.length > 0) {
        enrichedPrompt = this.enrichPromptWithSearch(prompt, searchResults);
        this.reportProgress({
          stage: 'search',
          message: `本地知识库找到 ${searchResults.length} 条相关资料`,
          timestamp: Date.now(),
        });
      }
    }

    // 使用新的提示词管理系统生成提示词
    const promptParams = {
      user_question: prompt,
      subject: '数学',
      grade_text: '小学',
      difficulty_text: '中等',
      duration_minutes: 25
    };
    
    let currentPrompt = promptManager.generatePrompt('course-generation', promptParams);

    while (attempts < this.options.maxRetries) {
      attempts++;

      if (attempts > 1 && lastError) {
        currentPrompt = this.enrichPromptWithError(originalPrompt, lastError, codeValidationErrors);
      }

      this.reportProgress({
        stage: 'api_call',
        message: `正在调用AI模型 (第${attempts}次尝试)...`,
        timestamp: Date.now(),
        retryCount: attempts - 1,
      });

      try {
        const rawResponse = await this.client.generateWithPrompt(currentPrompt);
        const duration = Date.now() - startTime;

        this.reportProgress({
          stage: 'parse',
          message: '解析AI响应...',
          timestamp: Date.now(),
        });

        const extractedHtml = this.validator.extractHtml(rawResponse);
        const sanitizedHtml = this.validator.sanitize(extractedHtml);

        if (this.options.enableValidation) {
          this.reportProgress({
            stage: 'validate',
            message: '验证HTML有效性...',
            timestamp: Date.now(),
          });

          const validation = this.validator.validate(sanitizedHtml);

          if (!validation.isValid && attempts < this.options.maxRetries) {
            const errorMessages = validation.errors.map(e => e.message).join('; ');
            lastError = new GenerationError(
              `HTML验证失败: ${errorMessages}`,
              GenerationErrorType.VALIDATION_ERROR,
              undefined,
              true
            );
            console.warn(`[CourseAgent] 验证失败，尝试重试: ${errorMessages}`);
            await this.delay(this.options.retryDelayMs * attempts);
            continue;
          }

          this.reportProgress({
            stage: 'complete',
            message: '生成完成!',
            timestamp: Date.now(),
          });

          return {
            success: true,
            html: sanitizedHtml,
            courseId: courseId || this.generateCourseId(prompt),
            validation,
            attempts,
            duration,
          };
        }

        this.reportProgress({
          stage: 'complete',
          message: '生成完成!',
          timestamp: Date.now(),
        });

        return {
          success: true,
          html: sanitizedHtml,
          courseId: courseId || this.generateCourseId(prompt),
          attempts,
          duration,
        };

      } catch (error: any) {
        lastError = this.classifyError(error);
        
        this.reportProgress({
          stage: 'error',
          message: `错误: ${lastError.message}`,
          timestamp: Date.now(),
          retryCount: attempts,
        });

        if (!lastError.retryable || attempts >= this.options.maxRetries) {
          break;
        }

        const delay = this.options.retryDelayMs * Math.pow(2, attempts - 1);
        console.warn(`[CourseAgent] API错误，等待${delay}ms后重试...`);
        await this.delay(delay);
      }
    }

    return {
      success: false,
      html: '',
      courseId,
      attempts,
      duration: Date.now() - startTime,
      error: lastError || new GenerationError(
        '生成失败: 未知错误',
        GenerationErrorType.UNKNOWN_ERROR
      ),
    };
  }

  private classifyError(error: any): GenerationError {
    const message = error.message || String(error);
    
    if (message.includes('timeout') || message.includes('Timeout')) {
      return new GenerationError(
        `请求超时: ${message}`,
        GenerationErrorType.TIMEOUT_ERROR,
        error,
        true
      );
    }
    
    if (message.includes('401') || message.includes('403') || message.includes('API key')) {
      return new GenerationError(
        `API认证失败: ${message}`,
        GenerationErrorType.API_ERROR,
        error,
        false
      );
    }
    
    if (message.includes('rate') || message.includes('quota')) {
      return new GenerationError(
        `API限流: ${message}`,
        GenerationErrorType.API_ERROR,
        error,
        true
      );
    }

    return GenerationError.fromOriginal(
      error,
      GenerationErrorType.API_ERROR,
      `API调用失败: ${message}`
    );
  }

  private reportProgress(progress: GenerationProgress, callback?: ProgressCallback): void {
    if (callback) {
      callback(progress);
    }
    console.log(`[CourseAgent] [${progress.stage}] ${progress.message}`);
  }

  getPromptPreview(prompt: string, maxLength: number = 200): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateCourseId(prompt: string): string {
    const hash = prompt.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `course_${Math.abs(hash).toString(36)}_${Date.now()}`;
  }

  private extractTopic(prompt: string): string {
    const questionMatch = prompt.match(/[\u4e00-\u9fa5]+[？?]/);
    if (questionMatch) {
      return questionMatch[0].replace(/[？?]/, '');
    }
    
    const words = prompt.split(/[\s,，。.]+/).filter(w => w.length > 2);
    return words[0] || prompt.substring(0, 20);
  }

  private enrichPromptWithSearch(prompt: string, searchResults: SearchResult[]): string {
    const searchContext = searchResults.map((r, i) => 
      `${i + 1}. ${r.title}: ${r.snippet}`
    ).join('\n');

    const enriched = `${prompt}

---
参考信息（来自互联网搜索）：
${searchContext}

请根据以上参考信息生成更加准确和丰富的课件内容。`;

    return enriched;
  }

  private enrichPromptWithError(
    originalPrompt: string, 
    error: GenerationError,
    validationErrors: ValidationError[],
    searchContext?: string
  ): string {
    const basePrompt = searchContext 
      ? `${originalPrompt}\n\n参考信息:\n${searchContext}`
      : originalPrompt;

    const errorContext = `${basePrompt}

---
【上一步生成失败，请修复以下问题后重新生成】

失败原因: ${error.message}

具体错误列表:
${validationErrors.map((e, i) => `${i + 1}. [${e.code}] ${e.message}`).join('\n')}

请确保:
1. HTML结构完整，包含 <!DOCTYPE html>, <html>, <head>, <body> 标签
2. 必须包含三个模块: id="concept"(概念讲解), id="demo"(图形演示), id="exercise"(练习测试)
3. Canvas元素必须有id属性并正确初始化getContext('2d')
4. JavaScript代码放在<script>标签内，且语法正确
5. 不要在<script>标签内放HTML代码

请直接输出完整的HTML代码，不要包含任何解释或markdown代码块标记。`;

    return errorContext;
  }
}

export const courseAgent = new CourseAgent();
