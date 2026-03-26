import {
  QualityScore,
  QualityThreshold,
  RefinementContext,
  RefinementStep,
  RefinementOptions,
  RefinementStatus,
  RefinementProgress,
  DEFAULT_REFINEMENT_OPTIONS,
} from '../types/refinement';
import { OpenCodeClient } from './opencode';
import { htmlValidator } from '../utils/htmlValidator';
import { CourseReviewer, courseReviewer } from './courseReviewer';
import { buildRefinementPrompt } from '../skills/coursePrompt';

export type RefinementProgressCallback = (progress: RefinementProgress) => void;

export interface RefinementResult {
  success: boolean;
  html: string;
  finalScore?: QualityScore;
  context: RefinementContext;
  output: string;
}

export class RefinementLoop {
  private client: OpenCodeClient;
  private reviewer: CourseReviewer;
  private validator: typeof htmlValidator;
  private options: RefinementOptions;

  constructor(
    options: Partial<RefinementOptions> = {},
    reviewer?: CourseReviewer
  ) {
    this.client = new OpenCodeClient();
    this.reviewer = reviewer || courseReviewer;
    this.validator = htmlValidator;
    this.options = { ...DEFAULT_REFINEMENT_OPTIONS, ...options };
  }

  async execute(
    prompt: string,
    onProgress?: RefinementProgressCallback
  ): Promise<RefinementResult> {
    const context: RefinementContext = {
      originalPrompt: prompt,
      attempts: 0,
      maxAttempts: this.options.maxRefinementAttempts + 1,
      history: [],
    };

    let currentHtml = '';
    let currentScore: QualityScore | undefined;
    let allIssues: RefinementContext['history'][0]['issues'] = [];

    this.reportProgress(onProgress, {
      status: RefinementStatus.GENERATING,
      currentAttempt: 1,
      maxAttempts: context.maxAttempts,
      message: '开始第 1 轮生成...',
      issues: [],
    });

    const startTime = Date.now();

    while (context.attempts < context.maxAttempts) {
      context.attempts++;
      const attemptStartTime = Date.now();

      try {
        let generationPrompt = prompt;
        if (context.attempts > 1 && this.options.enableAutoFix) {
          generationPrompt = this.reviewer.generateFixPrompt(currentHtml, currentScore!);
        }

        this.reportProgress(onProgress, {
          status: RefinementStatus.GENERATING,
          currentAttempt: context.attempts,
          maxAttempts: context.maxAttempts,
          currentScore,
          message: `正在生成 (第 ${context.attempts} 轮)...`,
          issues: allIssues,
        });

        const rawResponse = await this.client.generateWithPrompt(generationPrompt);
        const extractedHtml = this.validator.extractHtml(rawResponse);
        const sanitizedHtml = this.validator.sanitize(extractedHtml);

        this.reportProgress(onProgress, {
          status: RefinementStatus.REVIEWING,
          currentAttempt: context.attempts,
          maxAttempts: context.maxAttempts,
          message: '正在审查质量...',
          issues: allIssues,
        });

        currentScore = this.reviewer.review(sanitizedHtml, prompt);
        allIssues = currentScore.issues;

        context.history.push({
          attempt: context.attempts,
          timestamp: Date.now(),
          score: currentScore,
          issues: currentScore.issues,
          action: context.attempts > 1 ? 'fix' : 'generate',
          duration: Date.now() - attemptStartTime,
        });

        if (currentScore.passed) {
          this.reportProgress(onProgress, {
            status: RefinementStatus.PASSED,
            currentAttempt: context.attempts,
            maxAttempts: context.maxAttempts,
            currentScore,
            previousScore: context.history.length > 1 
              ? context.history[context.history.length - 2].score 
              : undefined,
            message: `✅ 质量检查通过！得分: ${currentScore.overall}/100`,
            issues: currentScore.issues,
          });

          return {
            success: true,
            html: sanitizedHtml,
            finalScore: currentScore,
            context,
            output: rawResponse,
          };
        }

        this.reportProgress(onProgress, {
          status: RefinementStatus.REVIEWING,
          currentAttempt: context.attempts,
          maxAttempts: context.maxAttempts,
          currentScore,
          message: `⚠️ 质量检查未通过 (${currentScore.overall}/100)，准备修复...`,
          issues: currentScore.issues,
        });

        if (!this.options.enableAutoFix) {
          break;
        }

        if (context.attempts < context.maxAttempts) {
          currentHtml = sanitizedHtml;
          this.reportProgress(onProgress, {
            status: RefinementStatus.FIXING,
            currentAttempt: context.attempts + 1,
            maxAttempts: context.maxAttempts,
            currentScore,
            previousScore: currentScore,
            message: `开始第 ${context.attempts + 1} 轮修复...`,
            issues: currentScore.issues,
          });
        }

      } catch (error: any) {
        console.error(`[RefinementLoop] 第 ${context.attempts} 轮生成失败:`, error.message);
        
        context.history.push({
          attempt: context.attempts,
          timestamp: Date.now(),
          issues: [{
            severity: 'critical',
            category: 'format',
            message: `生成失败: ${error.message}`,
          }],
          action: 'generate',
          duration: Date.now() - attemptStartTime,
        });

        if (context.attempts >= context.maxAttempts) {
          break;
        }

        await this.delay(1000 * context.attempts);
      }
    }

    const bestScore = this.getBestScore(context.history);
    const bestHtml = this.getBestHtml(context.history, currentHtml);

    this.reportProgress(onProgress, {
      status: RefinementStatus.FAILED,
      currentAttempt: context.attempts,
      maxAttempts: context.maxAttempts,
      currentScore: bestScore,
      message: bestScore 
        ? `已达到最大迭代次数，最终得分: ${bestScore.overall}/100`
        : '所有生成尝试均失败',
      issues: allIssues,
    });

    if (bestScore && bestScore.overall >= this.options.threshold.overall * 0.8) {
      return {
        success: true,
        html: bestHtml,
        finalScore: bestScore,
        context,
        output: '',
      };
    }

    return {
      success: false,
      html: bestHtml,
      finalScore: bestScore,
      context,
      output: '',
    };
  }

  private getBestScore(history: RefinementStep[]): QualityScore | undefined {
    if (history.length === 0) return undefined;
    return history.reduce((best, step) => {
      if (!step.score) return best;
      if (!best) return step.score;
      return step.score.overall > best.overall ? step.score : best;
    }, undefined as QualityScore | undefined);
  }

  private getBestHtml(history: RefinementStep[], fallback: string): string {
    const successfulSteps = history.filter(s => s.score && s.score.passed);
    return successfulSteps.length > 0 ? fallback : history.length > 0 ? fallback : '';
  }

  private reportProgress(
    callback: RefinementProgressCallback | undefined,
    progress: RefinementProgress
  ): void {
    if (callback) {
      callback(progress);
    }
    const statusEmoji = {
      [RefinementStatus.IDLE]: '⏳',
      [RefinementStatus.GENERATING]: '🎯',
      [RefinementStatus.REVIEWING]: '🔍',
      [RefinementStatus.FIXING]: '🔧',
      [RefinementStatus.PASSED]: '✅',
      [RefinementStatus.FAILED]: '❌',
    };
    console.log(`[RefinementLoop] [${progress.status}] ${progress.message}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getScoreHistory(context: RefinementContext): { attempt: number; score: number }[] {
    return context.history
      .filter(step => step.score)
      .map(step => ({
        attempt: step.attempt,
        score: step.score!.overall,
      }));
  }

  static formatScoreReport(score: QualityScore): string {
    const passed = score.passed ? '✅ 通过' : '❌ 未通过';
    
    let report = `
═══════════════════════════════════════
           课件质量评分报告
═══════════════════════════════════════
总分: ${score.overall}/100 ${passed}

【各维度得分】
├─ 教学设计: ${score.dimensions.pedagogy}/100
├─ 内容质量: ${score.dimensions.content}/100
├─ 交互设计: ${score.dimensions.interaction}/100
├─ 安全合规: ${score.dimensions.safety}/100
└─ 格式规范: ${score.dimensions.format}/100

【问题列表】
`;

    const critical = score.issues.filter(i => i.severity === 'critical');
    const warnings = score.issues.filter(i => i.severity === 'warning');
    const infos = score.issues.filter(i => i.severity === 'info');

    if (critical.length > 0) {
      report += `\n🔴 严重问题 (${critical.length}):\n`;
      critical.forEach((issue, i) => {
        report += `   ${i + 1}. [${issue.category}] ${issue.message}\n`;
        if (issue.suggestion) {
          report += `      → ${issue.suggestion}\n`;
        }
      });
    }

    if (warnings.length > 0) {
      report += `\n🟡 警告问题 (${warnings.length}):\n`;
      warnings.forEach((issue, i) => {
        report += `   ${i + 1}. [${issue.category}] ${issue.message}\n`;
      });
    }

    if (infos.length > 0) {
      report += `\n🔵 建议 (${infos.length}):\n`;
      infos.forEach((issue, i) => {
        report += `   ${i + 1}. [${issue.category}] ${issue.message}\n`;
      });
    }

    if (score.issues.length === 0) {
      report += '\n✅ 没有发现问题！\n';
    }

    report += '═══════════════════════════════════════\n';

    return report;
  }
}

export const refinementLoop = new RefinementLoop();
