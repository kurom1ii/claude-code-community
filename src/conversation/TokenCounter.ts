/**
 * TokenCounter
 * Token counting utilities for Claude Code Community
 */

import {
  ConversationMessage,
  MessageContent,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  ThinkingContent,
  TokenUsage,
} from './types';

/**
 * Token counting constants
 * These are approximations based on Claude's tokenization
 */
const CHARS_PER_TOKEN = 4; // Average characters per token
const TOKEN_OVERHEAD_PER_MESSAGE = 4; // Overhead for message structure
const TOKEN_OVERHEAD_PER_TOOL_USE = 10; // Overhead for tool use structure
const TOKEN_OVERHEAD_PER_TOOL_RESULT = 8; // Overhead for tool result structure

/**
 * Utility class for counting and estimating tokens
 */
export class TokenCounter {
  private cumulativeUsage: TokenUsage;

  constructor() {
    this.cumulativeUsage = {
      input: 0,
      output: 0,
      total: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
  }

  /**
   * Count tokens for a text string
   * This is an approximation - actual count may vary
   */
  countText(text: string): number {
    if (!text) return 0;
    // Use character count / 4 as approximation
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Count tokens for message content
   */
  countContent(content: MessageContent): number {
    switch (content.type) {
      case 'text':
        return this.countText((content as TextContent).text);

      case 'tool_use': {
        const toolUse = content as ToolUseContent;
        const nameTokens = this.countText(toolUse.name);
        const inputTokens = this.countText(JSON.stringify(toolUse.input));
        return nameTokens + inputTokens + TOKEN_OVERHEAD_PER_TOOL_USE;
      }

      case 'tool_result': {
        const toolResult = content as ToolResultContent;
        return this.countText(toolResult.content) + TOKEN_OVERHEAD_PER_TOOL_RESULT;
      }

      case 'thinking':
        return this.countText((content as ThinkingContent).thinking);

      default:
        return 0;
    }
  }

  /**
   * Count tokens for a message
   */
  countMessageTokens(message: Pick<ConversationMessage, 'role' | 'content'>): number {
    let total = TOKEN_OVERHEAD_PER_MESSAGE;

    for (const content of message.content) {
      total += this.countContent(content);
    }

    return total;
  }

  /**
   * Count tokens for multiple messages
   */
  countMessagesTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => {
      return sum + (msg.tokenCount ?? this.countMessageTokens(msg));
    }, 0);
  }

  /**
   * Estimate tokens for an API call
   */
  estimateApiCallTokens(
    systemPrompt: string | undefined,
    messages: ConversationMessage[],
    tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
  ): number {
    let total = 0;

    // System prompt tokens
    if (systemPrompt) {
      total += this.countText(systemPrompt) + TOKEN_OVERHEAD_PER_MESSAGE;
    }

    // Message tokens
    total += this.countMessagesTokens(messages);

    // Tool definitions tokens
    if (tools) {
      for (const tool of tools) {
        total += this.countText(tool.name);
        total += this.countText(tool.description);
        total += this.countText(JSON.stringify(tool.input_schema));
        total += TOKEN_OVERHEAD_PER_TOOL_USE;
      }
    }

    return total;
  }

  /**
   * Update cumulative usage from API response
   */
  updateFromApiResponse(usage: TokenUsage): void {
    this.cumulativeUsage.input += usage.input;
    this.cumulativeUsage.output += usage.output;
    this.cumulativeUsage.total += usage.total;

    if (usage.cacheRead !== undefined) {
      this.cumulativeUsage.cacheRead = (this.cumulativeUsage.cacheRead || 0) + usage.cacheRead;
    }
    if (usage.cacheWrite !== undefined) {
      this.cumulativeUsage.cacheWrite = (this.cumulativeUsage.cacheWrite || 0) + usage.cacheWrite;
    }
  }

  /**
   * Get cumulative token usage
   */
  getCumulativeUsage(): TokenUsage {
    return { ...this.cumulativeUsage };
  }

  /**
   * Reset cumulative usage
   */
  resetCumulativeUsage(): void {
    this.cumulativeUsage = {
      input: 0,
      output: 0,
      total: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
  }

  /**
   * Check if token count exceeds limit
   */
  exceedsLimit(tokens: number, limit: number): boolean {
    return tokens >= limit;
  }

  /**
   * Calculate percentage of context used
   */
  contextUsagePercentage(currentTokens: number, maxTokens: number): number {
    return (currentTokens / maxTokens) * 100;
  }

  /**
   * Estimate remaining tokens in context
   */
  remainingTokens(currentTokens: number, maxTokens: number): number {
    return Math.max(0, maxTokens - currentTokens);
  }

  /**
   * Estimate cost based on token usage
   * Prices are approximations and may not reflect current API pricing
   */
  estimateCost(usage: TokenUsage, model: string): number {
    // Pricing per million tokens (approximate)
    const pricing: Record<string, { input: number; output: number; cacheRead?: number }> = {
      'claude-opus-4-20250514': { input: 15, output: 75, cacheRead: 1.5 },
      'claude-sonnet-4-20250514': { input: 3, output: 15, cacheRead: 0.3 },
      'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheRead: 0.3 },
      'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheRead: 0.08 },
    };

    const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];

    const inputCost = (usage.input / 1_000_000) * modelPricing.input;
    const outputCost = (usage.output / 1_000_000) * modelPricing.output;
    const cacheReadCost = usage.cacheRead
      ? (usage.cacheRead / 1_000_000) * (modelPricing.cacheRead || modelPricing.input * 0.1)
      : 0;

    return inputCost + outputCost + cacheReadCost;
  }

  /**
   * Format token usage for display
   */
  formatUsage(usage: TokenUsage): string {
    let result = `In: ${this.formatNumber(usage.input)}, Out: ${this.formatNumber(usage.output)}, Total: ${this.formatNumber(usage.total)}`;

    if (usage.cacheRead && usage.cacheRead > 0) {
      result += `, Cache Read: ${this.formatNumber(usage.cacheRead)}`;
    }
    if (usage.cacheWrite && usage.cacheWrite > 0) {
      result += `, Cache Write: ${this.formatNumber(usage.cacheWrite)}`;
    }

    return result;
  }

  /**
   * Format a number with K/M suffix for readability
   */
  private formatNumber(num: number): string {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toString();
  }

  /**
   * Split text to fit within token limit
   */
  splitToFitLimit(text: string, maxTokens: number): string[] {
    const chunks: string[] = [];
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxChars) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (end of sentence or word)
      let splitPoint = maxChars;

      // Try to split at sentence boundary
      const sentenceEnd = remaining.lastIndexOf('.', maxChars);
      if (sentenceEnd > maxChars * 0.5) {
        splitPoint = sentenceEnd + 1;
      } else {
        // Try to split at word boundary
        const wordEnd = remaining.lastIndexOf(' ', maxChars);
        if (wordEnd > maxChars * 0.5) {
          splitPoint = wordEnd;
        }
      }

      chunks.push(remaining.slice(0, splitPoint).trim());
      remaining = remaining.slice(splitPoint).trim();
    }

    return chunks;
  }
}

/**
 * Create a singleton token counter instance
 */
let sharedCounter: TokenCounter | null = null;

export function getSharedTokenCounter(): TokenCounter {
  if (!sharedCounter) {
    sharedCounter = new TokenCounter();
  }
  return sharedCounter;
}

/**
 * Quick token count for text
 */
export function countTokens(text: string): number {
  return getSharedTokenCounter().countText(text);
}
