/**
 * Claude Code API - Token Utilities
 * Token counting, estimation và management
 */

// ============================================================================
// Constants
// ============================================================================

/** Average characters per token (approximation) */
const CHARS_PER_TOKEN = 4;

/** Token overhead for message structure */
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Token overhead for tool definition */
const TOOL_DEFINITION_OVERHEAD = 10;

/** Token overhead for tool use */
const TOOL_USE_OVERHEAD = 20;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count from text
 * Uses character-based approximation (1 token ~= 4 characters)
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for a message
 * Accounts for role overhead and content
 */
export function estimateMessageTokens(message: {
  role: string;
  content: string | unknown[];
}): number {
  let tokens = MESSAGE_OVERHEAD_TOKENS;

  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      tokens += estimateContentBlockTokens(block);
    }
  }

  return tokens;
}

/**
 * Estimate tokens for a content block
 */
export function estimateContentBlockTokens(block: unknown): number {
  if (!block || typeof block !== 'object') return 0;

  const b = block as Record<string, unknown>;

  switch (b.type) {
    case 'text':
      return estimateTokens(b.text as string);

    case 'thinking':
      return estimateTokens(b.thinking as string);

    case 'tool_use':
      return TOOL_USE_OVERHEAD + estimateTokens(JSON.stringify(b.input));

    case 'tool_result':
      if (typeof b.content === 'string') {
        return estimateTokens(b.content);
      }
      return estimateTokens(JSON.stringify(b.content));

    case 'image':
      // Images use significant tokens based on resolution
      // Approximation: ~85 tokens per 512x512 tile
      return 85;

    case 'document':
      // PDF documents - rough estimate
      return 500;

    default:
      return estimateTokens(JSON.stringify(block));
  }
}

/**
 * Estimate tokens for an array of messages
 */
export function estimateConversationTokens(
  messages: Array<{ role: string; content: string | unknown[] }>
): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * Estimate tokens for tool definitions
 */
export function estimateToolDefinitionTokens(tools: unknown[]): number {
  if (!tools || tools.length === 0) return 0;

  return tools.reduce<number>((sum, tool) => {
    return sum + TOOL_DEFINITION_OVERHEAD + estimateTokens(JSON.stringify(tool));
  }, 0);
}

/**
 * Estimate tokens for system prompt
 */
export function estimateSystemPromptTokens(
  system: string | unknown[] | undefined
): number {
  if (!system) return 0;

  if (typeof system === 'string') {
    return estimateTokens(system);
  }

  if (Array.isArray(system)) {
    return system.reduce<number>((sum, block) => {
      if (typeof block === 'object' && block !== null && 'text' in block) {
        return sum + estimateTokens((block as { text: string }).text);
      }
      return sum + estimateTokens(JSON.stringify(block));
    }, 0);
  }

  return 0;
}

/**
 * Estimate total request tokens
 */
export function estimateRequestTokens(request: {
  messages: Array<{ role: string; content: string | unknown[] }>;
  system?: string | unknown[];
  tools?: unknown[];
}): number {
  let total = 0;

  // System prompt
  total += estimateSystemPromptTokens(request.system);

  // Messages
  total += estimateConversationTokens(request.messages);

  // Tools
  if (request.tools) {
    total += estimateToolDefinitionTokens(request.tools);
  }

  return total;
}

// ============================================================================
// Token Formatting
// ============================================================================

/**
 * Format token count for display
 * @param count - Token count
 * @param roundTo - Round to nearest value (e.g., 100 for rounding to hundreds)
 */
export function formatTokenCount(count: number, roundTo?: number): string {
  if (roundTo && roundTo > 1) {
    count = Math.round(count / roundTo) * roundTo;
  }

  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * Format token count with units
 */
export function formatTokenCountWithUnit(count: number): string {
  return `${formatTokenCount(count)} tokens`;
}

// ============================================================================
// Token Limits & Validation
// ============================================================================

/**
 * Check if content exceeds token limit
 */
export function exceedsTokenLimit(
  tokens: number,
  limit: number,
  buffer: number = 0
): boolean {
  return tokens > limit - buffer;
}

/**
 * Calculate remaining tokens
 */
export function remainingTokens(
  used: number,
  limit: number,
  buffer: number = 0
): number {
  return Math.max(0, limit - used - buffer);
}

/**
 * Calculate token usage percentage
 */
export function tokenUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, (used / limit) * 100);
}

// ============================================================================
// Text Truncation
// ============================================================================

/**
 * Truncate text to fit within token limit
 * @param text - Text to truncate
 * @param maxTokens - Maximum tokens
 * @param suffix - Suffix to append when truncated (default: '...')
 */
export function truncateToTokens(
  text: string,
  maxTokens: number,
  suffix: string = '...'
): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const suffixChars = suffix.length;

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars - suffixChars) + suffix;
}

/**
 * Truncate text from the middle
 * Useful for preserving beginning and end context
 */
export function truncateMiddle(
  text: string,
  maxTokens: number,
  separator: string = '\n... [truncated] ...\n'
): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) {
    return text;
  }

  const separatorChars = separator.length;
  const availableChars = maxChars - separatorChars;
  const halfChars = Math.floor(availableChars / 2);

  return text.slice(0, halfChars) + separator + text.slice(-halfChars);
}

/**
 * Smart truncate - tries to break at natural boundaries
 */
export function smartTruncate(
  text: string,
  maxTokens: number,
  options: {
    suffix?: string;
    breakAt?: 'sentence' | 'paragraph' | 'line' | 'word';
  } = {}
): string {
  const { suffix = '...', breakAt = 'sentence' } = options;
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) {
    return text;
  }

  const targetChars = maxChars - suffix.length;

  // Find break point
  let breakPoint = targetChars;
  const textPortion = text.slice(0, targetChars + 100); // Look a bit further

  switch (breakAt) {
    case 'paragraph': {
      const lastParagraph = textPortion.lastIndexOf('\n\n', targetChars);
      if (lastParagraph > targetChars * 0.5) {
        breakPoint = lastParagraph;
      }
      break;
    }
    case 'line': {
      const lastLine = textPortion.lastIndexOf('\n', targetChars);
      if (lastLine > targetChars * 0.7) {
        breakPoint = lastLine;
      }
      break;
    }
    case 'sentence': {
      // Look for sentence endings
      const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
      let lastSentence = -1;
      for (const end of sentenceEnds) {
        const idx = textPortion.lastIndexOf(end, targetChars);
        if (idx > lastSentence) {
          lastSentence = idx + 1; // Include the punctuation
        }
      }
      if (lastSentence > targetChars * 0.5) {
        breakPoint = lastSentence;
      }
      break;
    }
    case 'word': {
      const lastSpace = textPortion.lastIndexOf(' ', targetChars);
      if (lastSpace > targetChars * 0.8) {
        breakPoint = lastSpace;
      }
      break;
    }
  }

  return text.slice(0, breakPoint).trimEnd() + suffix;
}

// ============================================================================
// Token Budget Management
// ============================================================================

export interface TokenBudget {
  /** Total available tokens */
  total: number;
  /** Tokens used so far */
  used: number;
  /** Reserved tokens (e.g., for response) */
  reserved: number;
}

/**
 * Create a token budget
 */
export function createTokenBudget(
  total: number,
  reserved: number = 0
): TokenBudget {
  return {
    total,
    used: 0,
    reserved,
  };
}

/**
 * Get available tokens from budget
 */
export function getAvailableTokens(budget: TokenBudget): number {
  return Math.max(0, budget.total - budget.used - budget.reserved);
}

/**
 * Consume tokens from budget
 */
export function consumeTokens(budget: TokenBudget, tokens: number): TokenBudget {
  return {
    ...budget,
    used: budget.used + tokens,
  };
}

/**
 * Check if budget has enough tokens
 */
export function hasTokenBudget(budget: TokenBudget, needed: number): boolean {
  return getAvailableTokens(budget) >= needed;
}
