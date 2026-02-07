/**
 * Token Bucket Rate Limiter
 *
 * Implements the token bucket algorithm for rate limiting.
 * Tokens are added at a steady rate and consumed per request.
 */

export interface TokenBucketConfig {
  tokensPerSecond: number; // Refill rate
  bucketSize: number; // Maximum tokens (burst capacity)
  backpressureStrategy: "wait" | "drop" | "error";
}

export interface TokenBucketStats {
  availableTokens: number;
  totalConsumed: number;
  totalDropped: number;
  totalWaitTimeMs: number;
  waitCount: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private config: TokenBucketConfig;
  private totalConsumed = 0;
  private totalDropped = 0;
  private totalWaitTimeMs = 0;
  private waitCount = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: TokenBucketConfig) {
    this.config = config;
    this.tokens = config.bucketSize;
    this.lastRefill = Date.now();
  }

  /**
   * Attempt to acquire a token. Behavior depends on backpressure strategy.
   * - "wait": waits until a token is available
   * - "drop": returns false if no token available
   * - "error": throws if no token available
   */
  async acquire(count = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      this.totalConsumed += count;
      return true;
    }

    switch (this.config.backpressureStrategy) {
      case "wait":
        await this.waitForTokens(count);
        return true;

      case "drop":
        this.totalDropped += count;
        return false;

      case "error":
        throw new RateLimitError(
          `Rate limit exceeded. Available: ${Math.floor(this.tokens)}, requested: ${count}`
        );
    }
  }

  /**
   * Wait until the requested number of tokens are available
   */
  private async waitForTokens(count: number): Promise<void> {
    const startWait = Date.now();

    // Calculate how long we need to wait for tokens to refill
    const deficit = count - this.tokens;
    const waitMs = (deficit / this.config.tokensPerSecond) * 1000;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.refill();
        this.tokens -= count;
        this.totalConsumed += count;
        resolve();
      }, Math.ceil(waitMs));
    });

    const waited = Date.now() - startWait;
    this.totalWaitTimeMs += waited;
    this.waitCount++;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.tokensPerSecond;

    this.tokens = Math.min(this.config.bucketSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current stats
   */
  getStats(): TokenBucketStats {
    this.refill();
    return {
      availableTokens: Math.floor(this.tokens),
      totalConsumed: this.totalConsumed,
      totalDropped: this.totalDropped,
      totalWaitTimeMs: this.totalWaitTimeMs,
      waitCount: this.waitCount,
    };
  }

  /**
   * Reset the bucket to full capacity
   */
  reset(): void {
    this.tokens = this.config.bucketSize;
    this.lastRefill = Date.now();
    this.totalConsumed = 0;
    this.totalDropped = 0;
    this.totalWaitTimeMs = 0;
    this.waitCount = 0;
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}
