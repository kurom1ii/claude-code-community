/**
 * Claude Code API - Request Caching
 * Simple in-memory cache for API responses
 */

import type { CreateMessageRequest, CreateMessageResponse } from './types';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp when cached */
  cachedAt: number;
  /** Time-to-live in ms */
  ttl: number;
  /** Cache key */
  key: string;
  /** Hit count */
  hits: number;
}

export interface CacheOptions {
  /** Default TTL in milliseconds */
  defaultTtl?: number;
  /** Maximum cache size */
  maxSize?: number;
  /** Whether to enable caching */
  enabled?: boolean;
}

export interface CacheStats {
  /** Total hits */
  hits: number;
  /** Total misses */
  misses: number;
  /** Current size */
  size: number;
  /** Max size */
  maxSize: number;
  /** Hit rate percentage */
  hitRate: number;
}

// ============================================================================
// Cache Implementation
// ============================================================================

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 100;

/**
 * Simple LRU cache for API responses
 */
export class RequestCache<T = CreateMessageResponse> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly defaultTtl: number;
  private readonly maxSize: number;
  private enabled: boolean;
  private hits = 0;
  private misses = 0;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.defaultTtl ?? DEFAULT_TTL;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Generate cache key from request
   */
  private generateKey(request: CreateMessageRequest): string {
    // Create a deterministic key from request parameters
    const keyParts = [
      request.model,
      request.max_tokens,
      JSON.stringify(request.messages),
      request.system ? JSON.stringify(request.system) : '',
      request.tools ? JSON.stringify(request.tools) : '',
      request.temperature?.toString() ?? '',
      request.top_p?.toString() ?? '',
    ];

    return simpleHash(keyParts.join('|'));
  }

  /**
   * Get cached response
   */
  get(request: CreateMessageRequest): T | undefined {
    if (!this.enabled) {
      this.misses++;
      return undefined;
    }

    const key = this.generateKey(request);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.cachedAt + entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update hit count and move to end (LRU)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;

    return entry.value;
  }

  /**
   * Cache a response
   */
  set(request: CreateMessageRequest, response: T, ttl?: number): void {
    if (!this.enabled) return;

    const key = this.generateKey(request);

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }

    this.cache.set(key, {
      value: response,
      cachedAt: Date.now(),
      ttl: ttl ?? this.defaultTtl,
      key,
      hits: 0,
    });
  }

  /**
   * Check if request is cached
   */
  has(request: CreateMessageRequest): boolean {
    if (!this.enabled) return false;

    const key = this.generateKey(request);
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check expiration
    if (Date.now() > entry.cachedAt + entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate cached entry
   */
  invalidate(request: CreateMessageRequest): boolean {
    const key = this.generateKey(request);
    return this.cache.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
    };
  }

  /**
   * Remove expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now > entry.cachedAt + entry.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get all cache entries (for debugging)
   */
  entries(): CacheEntry<T>[] {
    return Array.from(this.cache.values());
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple string hash function
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if a request should be cached
 * Streaming requests and certain configurations should not be cached
 */
export function isCacheable(request: CreateMessageRequest): boolean {
  // Don't cache streaming requests
  if (request.stream) {
    return false;
  }

  // Don't cache requests with tool_choice = any or specific tool
  if (request.tool_choice) {
    const choice = request.tool_choice as { type: string };
    if (choice.type === 'any' || choice.type === 'tool') {
      return false;
    }
  }

  return true;
}

/**
 * Create a cache key from request (for external use)
 */
export function createCacheKey(request: CreateMessageRequest): string {
  const keyParts = [
    request.model,
    request.max_tokens,
    JSON.stringify(request.messages),
    request.system ? JSON.stringify(request.system) : '',
  ];
  return simpleHash(keyParts.join('|'));
}

// ============================================================================
// Singleton Cache Instance
// ============================================================================

let globalCache: RequestCache | null = null;

/**
 * Get or create global cache instance
 */
export function getGlobalCache(options?: CacheOptions): RequestCache {
  if (!globalCache) {
    globalCache = new RequestCache(options);
  }
  return globalCache;
}

/**
 * Clear global cache
 */
export function clearGlobalCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
}

// ============================================================================
// Cache Decorator
// ============================================================================

/**
 * Wrapper to add caching to an API function
 */
export function withCache<T extends CreateMessageResponse>(
  fn: (request: CreateMessageRequest) => Promise<T>,
  cache?: RequestCache<T>,
  options?: { ttl?: number }
): (request: CreateMessageRequest) => Promise<T> {
  const cacheInstance = cache ?? (getGlobalCache() as RequestCache<T>);

  return async (request: CreateMessageRequest): Promise<T> => {
    // Check if cacheable
    if (!isCacheable(request)) {
      return fn(request);
    }

    // Try to get from cache
    const cached = cacheInstance.get(request);
    if (cached) {
      return cached;
    }

    // Execute and cache
    const response = await fn(request);
    cacheInstance.set(request, response, options?.ttl);
    return response;
  };
}
