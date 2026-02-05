/**
 * Claude Code API - Rate Limiter
 * Client-side rate limiting to prevent hitting API limits
 */

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute?: number;
  /** Maximum tokens per minute */
  tokensPerMinute?: number;
  /** Maximum concurrent requests */
  maxConcurrent?: number;
}

export interface RateLimitState {
  /** Requests in the current window */
  requestsInWindow: number;
  /** Tokens in the current window */
  tokensInWindow: number;
  /** Current concurrent requests */
  concurrentRequests: number;
  /** Window start time */
  windowStart: number;
  /** Whether rate limited */
  isLimited: boolean;
  /** Time until reset (ms) */
  resetIn: number;
}

interface QueuedRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  execute: () => Promise<T>;
  estimatedTokens: number;
}

// ============================================================================
// Default Limits (conservative estimates based on API docs)
// ============================================================================

const DEFAULT_LIMITS: Required<RateLimitConfig> = {
  requestsPerMinute: 50,  // Conservative default
  tokensPerMinute: 100000, // 100k tokens per minute
  maxConcurrent: 5,
};

// Window size in milliseconds
const WINDOW_SIZE = 60 * 1000; // 1 minute

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

/**
 * Client-side rate limiter using sliding window
 */
export class RateLimiter {
  private readonly config: Required<RateLimitConfig>;
  private requestTimestamps: number[] = [];
  private tokenCounts: Array<{ timestamp: number; tokens: number }> = [];
  private concurrentRequests = 0;
  private queue: Array<QueuedRequest<unknown>> = [];
  private processing = false;

  constructor(config: RateLimitConfig = {}) {
    this.config = {
      ...DEFAULT_LIMITS,
      ...config,
    };
  }

  /**
   * Check if a request can proceed
   */
  canProceed(estimatedTokens: number = 0): boolean {
    this.cleanupOldEntries();

    // Check concurrent requests
    if (this.concurrentRequests >= this.config.maxConcurrent) {
      return false;
    }

    // Check requests per minute
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      return false;
    }

    // Check tokens per minute
    const totalTokens = this.getCurrentTokenUsage();
    if (totalTokens + estimatedTokens > this.config.tokensPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Wait until a request can proceed
   */
  async waitForSlot(estimatedTokens: number = 0): Promise<void> {
    while (!this.canProceed(estimatedTokens)) {
      const waitTime = this.getWaitTime(estimatedTokens);
      await this.sleep(Math.max(100, waitTime));
    }
  }

  /**
   * Record that a request started
   */
  recordRequestStart(): void {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.concurrentRequests++;
  }

  /**
   * Record that a request completed
   */
  recordRequestEnd(tokens: number): void {
    this.concurrentRequests = Math.max(0, this.concurrentRequests - 1);
    this.tokenCounts.push({
      timestamp: Date.now(),
      tokens,
    });
    this.processQueue();
  }

  /**
   * Record a failed request
   */
  recordRequestFailure(): void {
    this.concurrentRequests = Math.max(0, this.concurrentRequests - 1);
    this.processQueue();
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(
    fn: () => Promise<T>,
    estimatedTokens: number = 0
  ): Promise<T> {
    await this.waitForSlot(estimatedTokens);
    this.recordRequestStart();

    try {
      const result = await fn();
      this.recordRequestEnd(estimatedTokens);
      return result;
    } catch (error) {
      this.recordRequestFailure();
      throw error;
    }
  }

  /**
   * Queue a request for execution
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    estimatedTokens: number = 0
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        resolve: resolve as (value: unknown) => void,
        reject,
        execute: fn as () => Promise<unknown>,
        estimatedTokens,
      });
      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue[0];
      if (!request) break;

      if (!this.canProceed(request.estimatedTokens)) {
        const waitTime = this.getWaitTime(request.estimatedTokens);
        await this.sleep(Math.max(100, waitTime));
        continue;
      }

      this.queue.shift();
      this.recordRequestStart();

      try {
        const result = await request.execute();
        this.recordRequestEnd(request.estimatedTokens);
        request.resolve(result);
      } catch (error) {
        this.recordRequestFailure();
        request.reject(error as Error);
      }
    }

    this.processing = false;
  }

  /**
   * Get current state
   */
  getState(): RateLimitState {
    this.cleanupOldEntries();

    const now = Date.now();
    const windowStart = now - WINDOW_SIZE;

    const isLimited = !this.canProceed(0);
    const resetIn = this.getWaitTime(0);

    return {
      requestsInWindow: this.requestTimestamps.length,
      tokensInWindow: this.getCurrentTokenUsage(),
      concurrentRequests: this.concurrentRequests,
      windowStart,
      isLimited,
      resetIn,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requestTimestamps = [];
    this.tokenCounts = [];
    this.concurrentRequests = 0;
    this.queue = [];
    this.processing = false;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    Object.assign(this.config, config);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private cleanupOldEntries(): void {
    const cutoff = Date.now() - WINDOW_SIZE;

    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > cutoff);
    this.tokenCounts = this.tokenCounts.filter(tc => tc.timestamp > cutoff);
  }

  private getCurrentTokenUsage(): number {
    return this.tokenCounts.reduce((sum, tc) => sum + tc.tokens, 0);
  }

  private getWaitTime(estimatedTokens: number): number {
    if (this.canProceed(estimatedTokens)) {
      return 0;
    }

    const now = Date.now();
    let waitTime = 0;

    // Check concurrent requests
    if (this.concurrentRequests >= this.config.maxConcurrent) {
      // Need to wait for a slot, estimate 1 second
      waitTime = Math.max(waitTime, 1000);
    }

    // Check requests per minute
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      const oldestRequest = this.requestTimestamps[0];
      if (oldestRequest) {
        const expiry = oldestRequest + WINDOW_SIZE;
        waitTime = Math.max(waitTime, expiry - now);
      }
    }

    // Check tokens per minute
    const totalTokens = this.getCurrentTokenUsage();
    if (totalTokens + estimatedTokens > this.config.tokensPerMinute) {
      // Find when enough tokens will expire
      let tokensToFree = totalTokens + estimatedTokens - this.config.tokensPerMinute;
      for (const tc of this.tokenCounts) {
        tokensToFree -= tc.tokens;
        if (tokensToFree <= 0) {
          const expiry = tc.timestamp + WINDOW_SIZE;
          waitTime = Math.max(waitTime, expiry - now);
          break;
        }
      }
    }

    return waitTime;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRateLimiter: RateLimiter | null = null;

/**
 * Get or create global rate limiter
 */
export function getGlobalRateLimiter(config?: RateLimitConfig): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(config);
  }
  return globalRateLimiter;
}

/**
 * Reset global rate limiter
 */
export function resetGlobalRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.reset();
  }
}

// ============================================================================
// Decorator for rate-limited functions
// ============================================================================

/**
 * Wrap a function with rate limiting
 */
export function withRateLimit<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  limiter?: RateLimiter,
  estimateTokens?: (...args: T) => number
): (...args: T) => Promise<R> {
  const rateLimiter = limiter ?? getGlobalRateLimiter();

  return async (...args: T): Promise<R> => {
    const tokens = estimateTokens ? estimateTokens(...args) : 0;
    return rateLimiter.execute(() => fn(...args), tokens);
  };
}

// ============================================================================
// Rate Limit Error
// ============================================================================

/**
 * Error thrown when rate limit is exceeded
 */
export class ClientRateLimitError extends Error {
  public readonly retryAfter: number;
  public readonly state: RateLimitState;

  constructor(state: RateLimitState) {
    super(`Client-side rate limit exceeded. Retry after ${Math.ceil(state.resetIn / 1000)} seconds.`);
    this.name = 'ClientRateLimitError';
    this.retryAfter = state.resetIn;
    this.state = state;
  }
}

/**
 * Check rate limit and throw if exceeded (non-blocking check)
 */
export function checkRateLimit(
  limiter?: RateLimiter,
  estimatedTokens: number = 0
): void {
  const rateLimiter = limiter ?? getGlobalRateLimiter();

  if (!rateLimiter.canProceed(estimatedTokens)) {
    throw new ClientRateLimitError(rateLimiter.getState());
  }
}
