export interface QualityScore {
  overall: number;
  dimensions: {
    pedagogy: number;
    content: number;
    interaction: number;
    safety: number;
    format: number;
  };
  issues: QualityIssue[];
  passed: boolean;
}

export interface QualityIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'pedagogy' | 'content' | 'interaction' | 'safety' | 'format';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface QualityThreshold {
  overall: number;
  pedagogy: number;
  content: number;
  interaction: number;
  safety: number;
  format: number;
}

export const DEFAULT_QUALITY_THRESHOLD: QualityThreshold = {
  overall: 75,
  pedagogy: 70,
  content: 70,
  interaction: 60,
  safety: 100,
  format: 80,
};

export interface RefinementContext {
  originalPrompt: string;
  attempts: number;
  maxAttempts: number;
  history: RefinementStep[];
  currentScore?: QualityScore;
}

export interface RefinementStep {
  attempt: number;
  timestamp: number;
  score?: QualityScore;
  issues: QualityIssue[];
  action: 'generate' | 'review' | 'fix';
  duration: number;
}

export interface RefinementOptions {
  maxRefinementAttempts: number;
  threshold: QualityThreshold;
  enableAutoFix: boolean;
  strictMode: boolean;
}

export const DEFAULT_REFINEMENT_OPTIONS: RefinementOptions = {
  maxRefinementAttempts: 3,
  threshold: DEFAULT_QUALITY_THRESHOLD,
  enableAutoFix: true,
  strictMode: false,
};

export enum RefinementStatus {
  IDLE = 'idle',
  GENERATING = 'generating',
  REVIEWING = 'reviewing',
  FIXING = 'fixing',
  PASSED = 'passed',
  FAILED = 'failed',
}

export interface RefinementProgress {
  status: RefinementStatus;
  currentAttempt: number;
  maxAttempts: number;
  currentScore?: QualityScore;
  previousScore?: QualityScore;
  message: string;
  issues: QualityIssue[];
}
