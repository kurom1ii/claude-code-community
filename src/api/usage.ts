/**
 * Claude Code API - Usage Tracking
 * Track API usage, costs, and statistics
 */

import type { Usage, CreateMessageResponse } from './types';

// ============================================================================
// Types
// ============================================================================

export interface UsageRecord {
  /** Timestamp of the request */
  timestamp: Date;
  /** Model used */
  model: string;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Cache creation tokens (if using prompt caching) */
  cacheCreationTokens: number;
  /** Cache read tokens (if using prompt caching) */
  cacheReadTokens: number;
  /** Request ID */
  requestId?: string;
  /** Request duration in ms */
  durationMs?: number;
  /** Whether request was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export interface UsageSummary {
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total cache creation tokens */
  totalCacheCreationTokens: number;
  /** Total cache read tokens */
  totalCacheReadTokens: number;
  /** Average input tokens per request */
  avgInputTokens: number;
  /** Average output tokens per request */
  avgOutputTokens: number;
  /** Average duration per request (ms) */
  avgDurationMs: number;
  /** Estimated cost (USD) */
  estimatedCostUsd: number;
  /** Usage by model */
  byModel: Map<string, ModelUsageSummary>;
}

export interface ModelUsageSummary {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cachingCost: number;
  totalCost: number;
}

// ============================================================================
// Pricing (as of knowledge cutoff - may need updates)
// ============================================================================

export interface ModelPricing {
  inputPer1M: number;  // USD per 1M input tokens
  outputPer1M: number; // USD per 1M output tokens
  cacheWritePer1M?: number;  // USD per 1M cache write tokens
  cacheReadPer1M?: number;   // USD per 1M cache read tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus models
  'claude-opus-4-5-20251101': { inputPer1M: 15, outputPer1M: 75, cacheWritePer1M: 18.75, cacheReadPer1M: 1.5 },
  'claude-opus-4-1-20250805': { inputPer1M: 15, outputPer1M: 75, cacheWritePer1M: 18.75, cacheReadPer1M: 1.5 },
  'claude-opus-4-20250514': { inputPer1M: 15, outputPer1M: 75, cacheWritePer1M: 18.75, cacheReadPer1M: 1.5 },
  'claude-3-opus-20240229': { inputPer1M: 15, outputPer1M: 75, cacheWritePer1M: 18.75, cacheReadPer1M: 1.5 },

  // Sonnet models
  'claude-sonnet-4-5-20250929': { inputPer1M: 3, outputPer1M: 15, cacheWritePer1M: 3.75, cacheReadPer1M: 0.3 },
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15, cacheWritePer1M: 3.75, cacheReadPer1M: 0.3 },
  'claude-3-7-sonnet-20250219': { inputPer1M: 3, outputPer1M: 15, cacheWritePer1M: 3.75, cacheReadPer1M: 0.3 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3, outputPer1M: 15, cacheWritePer1M: 3.75, cacheReadPer1M: 0.3 },
  'claude-3-5-sonnet-20240620': { inputPer1M: 3, outputPer1M: 15, cacheWritePer1M: 3.75, cacheReadPer1M: 0.3 },

  // Haiku models
  'claude-3-5-haiku-20241022': { inputPer1M: 0.8, outputPer1M: 4, cacheWritePer1M: 1, cacheReadPer1M: 0.08 },
  'claude-3-haiku-20240307': { inputPer1M: 0.25, outputPer1M: 1.25, cacheWritePer1M: 0.3, cacheReadPer1M: 0.03 },
};

// Default pricing for unknown models
const DEFAULT_PRICING: ModelPricing = { inputPer1M: 3, outputPer1M: 15 };

// ============================================================================
// Usage Tracker Class
// ============================================================================

export class UsageTracker {
  private records: UsageRecord[] = [];
  private readonly maxRecords: number;

  constructor(options: { maxRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 1000;
  }

  /**
   * Record a successful API call
   */
  recordSuccess(
    model: string,
    usage: Usage,
    options: {
      requestId?: string;
      durationMs?: number;
    } = {}
  ): void {
    this.addRecord({
      timestamp: new Date(),
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      requestId: options.requestId,
      durationMs: options.durationMs,
      success: true,
    });
  }

  /**
   * Record from a response object
   */
  recordResponse(
    response: CreateMessageResponse,
    options: {
      requestId?: string;
      durationMs?: number;
    } = {}
  ): void {
    this.recordSuccess(response.model, response.usage, options);
  }

  /**
   * Record a failed API call
   */
  recordFailure(
    model: string,
    error: string,
    options: {
      requestId?: string;
      durationMs?: number;
      estimatedInputTokens?: number;
    } = {}
  ): void {
    this.addRecord({
      timestamp: new Date(),
      model,
      inputTokens: options.estimatedInputTokens ?? 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      requestId: options.requestId,
      durationMs: options.durationMs,
      success: false,
      error,
    });
  }

  /**
   * Add a record and maintain max size
   */
  private addRecord(record: UsageRecord): void {
    this.records.push(record);

    // Remove oldest records if over limit
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  /**
   * Get usage summary
   */
  getSummary(options: {
    since?: Date;
    until?: Date;
    model?: string;
  } = {}): UsageSummary {
    let filtered = this.records;

    // Apply filters
    if (options.since) {
      filtered = filtered.filter(r => r.timestamp >= options.since!);
    }
    if (options.until) {
      filtered = filtered.filter(r => r.timestamp <= options.until!);
    }
    if (options.model) {
      filtered = filtered.filter(r => r.model === options.model);
    }

    const successful = filtered.filter(r => r.success);
    const failed = filtered.filter(r => !r.success);

    // Calculate totals
    const totalInputTokens = filtered.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = filtered.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalCacheCreationTokens = filtered.reduce((sum, r) => sum + r.cacheCreationTokens, 0);
    const totalCacheReadTokens = filtered.reduce((sum, r) => sum + r.cacheReadTokens, 0);

    // Calculate averages
    const avgInputTokens = successful.length > 0
      ? totalInputTokens / successful.length
      : 0;
    const avgOutputTokens = successful.length > 0
      ? totalOutputTokens / successful.length
      : 0;

    const recordsWithDuration = successful.filter(r => r.durationMs !== undefined);
    const avgDurationMs = recordsWithDuration.length > 0
      ? recordsWithDuration.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / recordsWithDuration.length
      : 0;

    // Calculate by model
    const byModel = new Map<string, ModelUsageSummary>();
    for (const record of filtered) {
      const existing = byModel.get(record.model);
      if (existing) {
        existing.requests++;
        existing.inputTokens += record.inputTokens;
        existing.outputTokens += record.outputTokens;
      } else {
        byModel.set(record.model, {
          model: record.model,
          requests: 1,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          estimatedCostUsd: 0,
        });
      }
    }

    // Calculate costs per model
    let totalCost = 0;
    const summaries = Array.from(byModel.values());
    for (const summary of summaries) {
      summary.estimatedCostUsd = this.estimateCost(
        summary.model,
        summary.inputTokens,
        summary.outputTokens
      ).totalCost;
      totalCost += summary.estimatedCostUsd;
    }

    return {
      totalRequests: filtered.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens,
      avgInputTokens,
      avgOutputTokens,
      avgDurationMs,
      estimatedCostUsd: totalCost,
      byModel,
    };
  }

  /**
   * Estimate cost for token usage
   */
  estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number = 0,
    cacheReadTokens: number = 0
  ): CostEstimate {
    const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;

    const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
    const cachingCost =
      ((cacheCreationTokens / 1_000_000) * (pricing.cacheWritePer1M ?? 0)) +
      ((cacheReadTokens / 1_000_000) * (pricing.cacheReadPer1M ?? 0));

    return {
      inputCost,
      outputCost,
      cachingCost,
      totalCost: inputCost + outputCost + cachingCost,
    };
  }

  /**
   * Get recent records
   */
  getRecords(limit?: number): UsageRecord[] {
    if (limit) {
      return this.records.slice(-limit);
    }
    return [...this.records];
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Export records as JSON
   */
  export(): string {
    return JSON.stringify(this.records, null, 2);
  }

  /**
   * Import records from JSON
   */
  import(json: string): void {
    const imported = JSON.parse(json) as UsageRecord[];
    for (const record of imported) {
      record.timestamp = new Date(record.timestamp);
      this.records.push(record);
    }

    // Maintain max size
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalTracker: UsageTracker | null = null;

/**
 * Get or create global usage tracker
 */
export function getGlobalUsageTracker(options?: { maxRecords?: number }): UsageTracker {
  if (!globalTracker) {
    globalTracker = new UsageTracker(options);
  }
  return globalTracker;
}

/**
 * Clear global usage tracker
 */
export function clearGlobalUsageTracker(): void {
  if (globalTracker) {
    globalTracker.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

/**
 * Check if model has known pricing
 */
export function hasKnownPricing(model: string): boolean {
  return model in MODEL_PRICING;
}
