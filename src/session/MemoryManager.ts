/**
 * Memory Manager
 * Quản lý context window và tối ưu hóa bộ nhớ cho long sessions
 */

import type { ConversationMessage, SimpleMessage } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Default token limits */
const DEFAULT_MAX_CONTEXT_TOKENS = 200000;
const DEFAULT_COMPACT_THRESHOLD = 0.75; // 75% of max context triggers compaction
const DEFAULT_SUMMARY_THRESHOLD = 0.85; // 85% triggers summarization

/** Approximate characters per token for estimation */
const CHARS_PER_TOKEN = 4;

/** Minimum messages to keep after compaction */
const MIN_MESSAGES_AFTER_COMPACT = 10;

/** Maximum messages to summarize at once */
const MAX_MESSAGES_TO_SUMMARIZE = 50;

// ============================================================================
// Types
// ============================================================================

/**
 * Memory manager options
 */
export interface MemoryManagerOptions {
  /** Maximum context window tokens */
  maxContextTokens?: number;

  /** Threshold ratio for compaction (0-1) */
  compactThreshold?: number;

  /** Threshold ratio for summarization (0-1) */
  summaryThreshold?: number;

  /** Custom token counter function */
  tokenCounter?: (text: string) => number;
}

/**
 * Token usage statistics
 */
export interface TokenUsageStats {
  /** Total tokens used */
  totalTokens: number;

  /** Maximum available tokens */
  maxTokens: number;

  /** Usage percentage (0-100) */
  usagePercent: number;

  /** Tokens remaining */
  tokensRemaining: number;

  /** Should compact flag */
  shouldCompact: boolean;

  /** Should summarize flag */
  shouldSummarize: boolean;
}

/**
 * Compaction result
 */
export interface CompactionResult {
  /** Original message count */
  originalCount: number;

  /** Compacted message count */
  compactedCount: number;

  /** Tokens saved */
  tokensSaved: number;

  /** Whether summarization was used */
  usedSummarization: boolean;
}

/**
 * Summary result
 */
export interface SummaryResult {
  /** Generated summary text */
  summary: string;

  /** Number of messages summarized */
  messagesSummarized: number;

  /** Approximate tokens in summary */
  summaryTokens: number;
}

// ============================================================================
// MemoryManager Class
// ============================================================================

export class MemoryManager {
  private options: Required<MemoryManagerOptions>;
  private currentTokens: number = 0;
  private tokenHistory: number[] = [];

  constructor(options?: MemoryManagerOptions) {
    this.options = {
      maxContextTokens: options?.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      compactThreshold: options?.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD,
      summaryThreshold: options?.summaryThreshold ?? DEFAULT_SUMMARY_THRESHOLD,
      tokenCounter: options?.tokenCounter ?? this.defaultTokenCounter.bind(this),
    };
  }

  // --------------------------------------------------------------------------
  // Token Tracking
  // --------------------------------------------------------------------------

  /**
   * Track token usage for a message or operation
   */
  trackTokenUsage(tokens: number): void {
    this.currentTokens += tokens;
    this.tokenHistory.push(tokens);
  }

  /**
   * Set current token count directly
   */
  setTokenCount(tokens: number): void {
    this.currentTokens = tokens;
  }

  /**
   * Get current token usage
   */
  getCurrentTokens(): number {
    return this.currentTokens;
  }

  /**
   * Get token usage statistics
   */
  getTokenUsageStats(): TokenUsageStats {
    const usagePercent = (this.currentTokens / this.options.maxContextTokens) * 100;
    const tokensRemaining = this.options.maxContextTokens - this.currentTokens;

    return {
      totalTokens: this.currentTokens,
      maxTokens: this.options.maxContextTokens,
      usagePercent: Math.round(usagePercent * 100) / 100,
      tokensRemaining: Math.max(0, tokensRemaining),
      shouldCompact: this.shouldCompact(),
      shouldSummarize: this.shouldSummarize(),
    };
  }

  /**
   * Reset token tracking
   */
  reset(): void {
    this.currentTokens = 0;
    this.tokenHistory = [];
  }

  // --------------------------------------------------------------------------
  // Compaction Decisions
  // --------------------------------------------------------------------------

  /**
   * Check if history should be compacted
   */
  shouldCompact(): boolean {
    const threshold = this.options.maxContextTokens * this.options.compactThreshold;
    return this.currentTokens >= threshold;
  }

  /**
   * Check if summarization should be triggered
   */
  shouldSummarize(): boolean {
    const threshold = this.options.maxContextTokens * this.options.summaryThreshold;
    return this.currentTokens >= threshold;
  }

  // --------------------------------------------------------------------------
  // History Compaction
  // --------------------------------------------------------------------------

  /**
   * Compact message history to reduce token usage
   * Removes older messages while preserving recent context and system messages
   */
  compactHistory(messages: ConversationMessage[]): ConversationMessage[] {
    if (!this.shouldCompact() && messages.length <= MIN_MESSAGES_AFTER_COMPACT * 2) {
      return messages;
    }

    // Separate system messages (always keep)
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate how many messages to keep
    const targetTokens = this.options.maxContextTokens * 0.5; // Aim for 50% capacity
    let currentTokens = this.countMessagesTokens(systemMessages);
    const messagesToKeep: ConversationMessage[] = [];

    // Add messages from newest to oldest until we hit target
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = this.countMessageTokens(msg);

      if (currentTokens + msgTokens <= targetTokens ||
          messagesToKeep.length < MIN_MESSAGES_AFTER_COMPACT) {
        messagesToKeep.unshift(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    // Update token count
    const oldTokens = this.currentTokens;
    this.currentTokens = currentTokens;

    return [...systemMessages, ...messagesToKeep];
  }

  /**
   * Compact simple messages (for SessionState)
   */
  compactSimpleHistory(messages: SimpleMessage[]): SimpleMessage[] {
    if (messages.length <= MIN_MESSAGES_AFTER_COMPACT * 2) {
      return messages;
    }

    // Separate system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate target
    const targetTokens = this.options.maxContextTokens * 0.5;
    let currentTokens = this.countSimpleMessagesTokens(systemMessages);
    const messagesToKeep: SimpleMessage[] = [];

    // Add from newest to oldest
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = this.options.tokenCounter(msg.content);

      if (currentTokens + msgTokens <= targetTokens ||
          messagesToKeep.length < MIN_MESSAGES_AFTER_COMPACT) {
        messagesToKeep.unshift(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    this.currentTokens = currentTokens;
    return [...systemMessages, ...messagesToKeep];
  }

  // --------------------------------------------------------------------------
  // Summarization
  // --------------------------------------------------------------------------

  /**
   * Create a summary of message history
   * Note: This is a simple text-based summary. For AI-powered summarization,
   * use an external AI service.
   */
  createSummary(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    const parts: string[] = [];

    // Add header
    parts.push('## Conversation Summary\n');

    // Group messages by exchange
    let currentExchange: string[] = [];
    let exchangeCount = 0;

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Start new exchange
        if (currentExchange.length > 0) {
          exchangeCount++;
          parts.push(`### Exchange ${exchangeCount}`);
          parts.push(currentExchange.join('\n'));
          parts.push('');
        }
        currentExchange = [];

        const content = this.extractTextContent(msg.content);
        const preview = this.truncateText(content, 200);
        currentExchange.push(`**User:** ${preview}`);
      } else if (msg.role === 'assistant') {
        const content = this.extractTextContent(msg.content);
        const preview = this.truncateText(content, 300);
        currentExchange.push(`**Assistant:** ${preview}`);

        // Add tool call summary if present
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolNames = msg.toolCalls.map(t => t.name).join(', ');
          currentExchange.push(`  - Tools used: ${toolNames}`);
        }
      }
    }

    // Add last exchange
    if (currentExchange.length > 0) {
      exchangeCount++;
      parts.push(`### Exchange ${exchangeCount}`);
      parts.push(currentExchange.join('\n'));
    }

    // Add statistics
    parts.push('\n---');
    parts.push(`Total exchanges: ${exchangeCount}`);
    parts.push(`Messages: ${messages.length}`);

    return parts.join('\n');
  }

  /**
   * Create a concise summary for simple messages
   */
  createSimpleSummary(messages: SimpleMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    const parts: string[] = [];
    parts.push('## Session Summary\n');

    let exchangeCount = 0;
    let userMessage: string | null = null;

    for (const msg of messages) {
      if (msg.role === 'user') {
        userMessage = this.truncateText(msg.content, 150);
      } else if (msg.role === 'assistant' && userMessage) {
        exchangeCount++;
        const assistantPreview = this.truncateText(msg.content, 200);
        parts.push(`${exchangeCount}. User: ${userMessage}`);
        parts.push(`   Assistant: ${assistantPreview}\n`);
        userMessage = null;
      }
    }

    parts.push(`\n---\nTotal exchanges: ${exchangeCount}`);

    return parts.join('\n');
  }

  // --------------------------------------------------------------------------
  // Advanced Compaction
  // --------------------------------------------------------------------------

  /**
   * Perform intelligent compaction with optional summarization
   */
  intelligentCompact(
    messages: ConversationMessage[],
    options?: { includeSummary?: boolean }
  ): { messages: ConversationMessage[]; summary?: string } {
    const shouldSummarize = options?.includeSummary ?? this.shouldSummarize();

    // If we should summarize, create summary of older messages
    if (shouldSummarize && messages.length > MAX_MESSAGES_TO_SUMMARIZE) {
      const oldMessages = messages.slice(0, -MIN_MESSAGES_AFTER_COMPACT);
      const recentMessages = messages.slice(-MIN_MESSAGES_AFTER_COMPACT);
      const summary = this.createSummary(oldMessages);

      // Create system message with summary
      const summaryMessage: ConversationMessage = {
        id: `summary_${Date.now()}`,
        role: 'system',
        content: `[Previous conversation summary]\n${summary}`,
        timestamp: new Date(),
        tokens: this.options.tokenCounter(summary),
      };

      // Keep system messages from recent
      const systemMessages = recentMessages.filter(m => m.role === 'system');
      const nonSystemRecent = recentMessages.filter(m => m.role !== 'system');

      const compactedMessages = [summaryMessage, ...systemMessages, ...nonSystemRecent];

      // Update token count
      this.currentTokens = this.countMessagesTokens(compactedMessages);

      return {
        messages: compactedMessages,
        summary,
      };
    }

    // Otherwise just compact
    return {
      messages: this.compactHistory(messages),
    };
  }

  // --------------------------------------------------------------------------
  // Token Estimation
  // --------------------------------------------------------------------------

  /**
   * Default token counter (character-based estimation)
   */
  private defaultTokenCounter(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Count tokens for a single message
   */
  countMessageTokens(message: ConversationMessage): number {
    let tokenCount = 0;

    if (typeof message.content === 'string') {
      tokenCount += this.options.tokenCounter(message.content);
    } else {
      for (const block of message.content) {
        if ('text' in block) {
          tokenCount += this.options.tokenCounter(block.text);
        } else if ('thinking' in block) {
          tokenCount += this.options.tokenCounter(block.thinking);
        }
      }
    }

    // Add overhead for message structure
    tokenCount += 4; // Role + structure tokens

    return tokenCount;
  }

  /**
   * Count tokens for multiple messages
   */
  countMessagesTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.countMessageTokens(msg), 0);
  }

  /**
   * Count tokens for simple messages
   */
  countSimpleMessagesTokens(messages: SimpleMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.options.tokenCounter(msg.content) + 4, 0);
  }

  /**
   * Estimate tokens for text
   */
  estimateTokens(text: string): number {
    return this.options.tokenCounter(text);
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Extract text content from message content
   */
  private extractTextContent(content: ConversationMessage['content']): string {
    if (typeof content === 'string') {
      return content;
    }

    const texts: string[] = [];
    for (const block of content) {
      if ('text' in block) {
        texts.push(block.text);
      }
    }

    return texts.join('\n');
  }

  /**
   * Truncate text to max length with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    const cleaned = text.replace(/\n+/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return cleaned.slice(0, maxLength - 3) + '...';
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Update memory manager options
   */
  updateOptions(options: Partial<MemoryManagerOptions>): void {
    if (options.maxContextTokens !== undefined) {
      this.options.maxContextTokens = options.maxContextTokens;
    }
    if (options.compactThreshold !== undefined) {
      this.options.compactThreshold = options.compactThreshold;
    }
    if (options.summaryThreshold !== undefined) {
      this.options.summaryThreshold = options.summaryThreshold;
    }
    if (options.tokenCounter !== undefined) {
      this.options.tokenCounter = options.tokenCounter;
    }
  }

  /**
   * Get current options
   */
  getOptions(): MemoryManagerOptions {
    return { ...this.options };
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Create a new MemoryManager instance
 */
export function createMemoryManager(options?: MemoryManagerOptions): MemoryManager {
  return new MemoryManager(options);
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const memoryManager = new MemoryManager();
