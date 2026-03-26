export enum GenerationErrorType {
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class GenerationError extends Error {
  constructor(
    message: string,
    public type: GenerationErrorType,
    public originalError?: Error,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'GenerationError';
  }

  static fromOriginal(error: Error, type: GenerationErrorType, message: string): GenerationError {
    return new GenerationError(message, type, error, type === GenerationErrorType.API_ERROR || type === GenerationErrorType.TIMEOUT_ERROR);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      retryable: this.retryable,
      stack: this.stack,
    };
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  position?: { line: number; column: number };
}

export interface GenerationProgress {
  stage: 'prompt' | 'search' | 'api_call' | 'parse' | 'validate' | 'complete' | 'error' | 'retry' | 'refine' | 'review';
  message: string;
  timestamp: number;
  retryCount?: number;
  qualityScore?: {
    overall: number;
    passed: boolean;
  };
}

export type ProgressCallback = (progress: GenerationProgress) => void;

export interface GenerationOptions {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  enableValidation: boolean;
  enableFallback: boolean;
  enableWebSearch: boolean;
  enableLocalSearch: boolean;
  enableCodeValidation: boolean;
  searchResultCount: number;
  enableQualityRefinement: boolean;
  qualityThreshold?: {
    overall: number;
    pedagogy: number;
    content: number;
    interaction: number;
    safety: number;
    format: number;
  };
  maxRefinementAttempts: number;
}
