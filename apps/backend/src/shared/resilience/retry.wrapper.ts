/**
 * @file src/shared/resilience/retry.wrapper.ts
 * @module shared/resilience
 * @description Retry wrapper for resilient async operations
 * @author BharatERP
 * @created 2026-02-19
 */

export interface RetryOptions {
  /** Max number of attempts (default 3) */
  maxAttempts?: number;
  /** Base delay in ms between retries (default 1000) */
  baseDelayMs?: number;
  /** Backoff multiplier (default 2) */
  backoffMultiplier?: number;
  /** Predicate to determine if error is retryable */
  isRetryable?: (err: unknown) => boolean;
}

const defaultIsRetryable = (): boolean => true;

/**
 * Execute an async function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    backoffMultiplier = 2,
    isRetryable = defaultIsRetryable,
  } = options;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
