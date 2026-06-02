/** 通用重试工具 - 支持指数退避+抖动 */
import { logger } from './logger';

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    /** 开启指数退避: delayMs × 2^(attempt-1) + 25% jitter, 上限 32s */
    exponentialBackoff?: boolean;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 500,
    exponentialBackoff = false,
    shouldRetry = () => true,
  } = options;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      const result = await fn();
      if (attempt > 1) {
        const totalMs = Date.now() - attemptStart;
        logger.info(`重试 ${attempt}/${maxAttempts} 成功, 本轮耗时 ${totalMs}ms`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;
      const code = error?.code || '';
      const errMsg = error?.message || '未知错误';
      const failedMs = Date.now() - attemptStart;
      if (attempt < maxAttempts && shouldRetry(error)) {
        let waitMs: number;
        if (exponentialBackoff) {
          const base = Math.min(delayMs * Math.pow(2, attempt - 1), 32000);
          const jitter = Math.random() * 0.25 * base;
          waitMs = base + jitter;
        } else {
          waitMs = delayMs * attempt;
        }
        logger.info(`重试 ${attempt}/${maxAttempts} 失败: code=${code}, status=${status || '-'}, msg=${errMsg}, 请求耗时 ${failedMs}ms, 等待 ${(waitMs / 1000).toFixed(1)}s`);
        await delay(waitMs);
      } else if (attempt >= maxAttempts) {
        logger.error(`重试耗尽 ${maxAttempts}/${maxAttempts}: code=${code}, msg=${errMsg}, 本轮耗时 ${failedMs}ms`);
      }
    }
  }

  throw lastError;
}

/** 带超时的 Promise 包装 */
export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message || `操作超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    fn()
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(error => { clearTimeout(timer); reject(error); });
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
