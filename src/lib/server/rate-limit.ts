/**
 * A small in-memory token-bucket rate limiter.
 *
 * Each key (an IP address or a player id) owns a bucket that refills
 * continuously. The map is bounded so a flood of unique keys cannot exhaust
 * memory: when full, the oldest bucket is evicted.
 */
export interface RateLimiterOptions {
  /** Burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
  /** Maximum number of tracked keys. */
  maxKeys?: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.capacity = options.capacity;
    this.refillPerMs = options.refillPerSecond / 1000;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  /** Tries to spend one token. Returns false when the caller must back off. */
  take(key: string): boolean {
    const now = this.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.evictOldest();
      bucket = { tokens: this.capacity, updatedAt: now };
    } else {
      this.buckets.delete(key); // re-insert below to keep Map order = recency
      bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs);
      bucket.updatedAt = now;
    }

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }

  get size(): number {
    return this.buckets.size;
  }

  private evictOldest(): void {
    const oldest = this.buckets.keys().next();
    if (!oldest.done) this.buckets.delete(oldest.value);
  }
}
