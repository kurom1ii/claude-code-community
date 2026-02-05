/**
 * ContextWindowManager
 * Manage context window usage and compaction
 */

import {
  ConversationMessage,
  ContextWindowConfig,
  CompactionResult,
  TextContent,
  ToolUseContent,
  ToolResultContent,
} from './types';
import { TokenCounter } from './TokenCounter';
import { randomUUID } from 'crypto';

/**
 * Default context window configuration
 */
const DEFAULT_CONFIG: ContextWindowConfig = {
  maxTokens: 200000,
  compactionThreshold: 0.8, // Compact at 80% usage
  reservedTokens: 8192, // Reserve for response
  minMessagesToPreserve: 4, // Always keep last 4 messages
};

/**
 * Manages context window and compaction strategies
 */
export class ContextWindowManager {
  private config: ContextWindowConfig;
  private tokenCounter: TokenCounter;

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Get current context usage
   */
  getCurrentUsage(messages: ConversationMessage[]): number {
    return this.tokenCounter.countMessagesTokens(messages);
  }

  /**
   * Get available tokens for new content
   */
  getAvailableTokens(messages: ConversationMessage[]): number {
    const used = this.getCurrentUsage(messages);
    return this.config.maxTokens - used - this.config.reservedTokens;
  }

  /**
   * Check if compaction is needed
   */
  shouldCompact(messages: ConversationMessage[]): boolean {
    const used = this.getCurrentUsage(messages);
    const threshold = this.config.maxTokens * this.config.compactionThreshold;
    return used >= threshold;
  }

  /**
   * Get usage percentage
   */
  getUsagePercentage(messages: ConversationMessage[]): number {
    const used = this.getCurrentUsage(messages);
    return (used / this.config.maxTokens) * 100;
  }

  /**
   * Compact the conversation by summarizing older messages
   */
  async compact(
    messages: ConversationMessage[],
    model: string
  ): Promise<CompactionResult> {
    if (messages.length <= this.config.minMessagesToPreserve) {
      return {
        summary: '',
        preservedMessages: messages,
        tokensRemoved: 0,
        tokensSaved: 0,
      };
    }

    // Calculate how many messages to preserve
    const preserveCount = Math.max(
      this.config.minMessagesToPreserve,
      Math.ceil(messages.length * 0.25) // Keep at least 25% of messages
    );

    // Split messages
    const messagesToSummarize = messages.slice(0, -preserveCount);
    const preservedMessages = messages.slice(-preserveCount);

    // Calculate original tokens
    const originalTokens = this.tokenCounter.countMessagesTokens(messagesToSummarize);

    // Generate summary
    const summary = this.generateSummary(messagesToSummarize);

    // Calculate summary tokens
    const summaryTokens = this.tokenCounter.countText(summary);

    return {
      summary,
      preservedMessages,
      tokensRemoved: originalTokens,
      tokensSaved: originalTokens - summaryTokens,
    };
  }

  /**
   * Generate a summary of messages
   * In production, this would use an API call to Claude
   */
  private generateSummary(messages: ConversationMessage[]): string {
    const sections: string[] = [];

    // Group messages by topic/context
    let currentContext = '';
    let contextItems: string[] = [];

    for (const message of messages) {
      const content = this.extractTextContent(message);

      if (message.role === 'user') {
        // User messages often indicate topic changes
        if (contextItems.length > 0) {
          sections.push(this.summarizeContext(currentContext, contextItems));
        }
        currentContext = content.slice(0, 100);
        contextItems = [content];
      } else if (message.role === 'assistant') {
        // Track tool uses
        const toolUses = message.content.filter(
          (c) => c.type === 'tool_use'
        ) as ToolUseContent[];

        if (toolUses.length > 0) {
          const toolNames = toolUses.map((t) => t.name).join(', ');
          contextItems.push(`Used tools: ${toolNames}`);
        }

        // Add text summary
        if (content) {
          contextItems.push(`Response: ${content.slice(0, 200)}...`);
        }
      }
    }

    // Add final context
    if (contextItems.length > 0) {
      sections.push(this.summarizeContext(currentContext, contextItems));
    }

    return sections.join('\n\n');
  }

  /**
   * Extract text content from a message
   */
  private extractTextContent(message: ConversationMessage): string {
    const textParts: string[] = [];

    for (const content of message.content) {
      if (content.type === 'text') {
        textParts.push((content as TextContent).text);
      } else if (content.type === 'tool_result') {
        textParts.push((content as ToolResultContent).content);
      }
    }

    return textParts.join('\n');
  }

  /**
   * Summarize a context section
   */
  private summarizeContext(context: string, items: string[]): string {
    return `Topic: ${context}\n- ${items.join('\n- ')}`;
  }

  /**
   * Identify important messages that should be preserved
   */
  identifyImportantMessages(messages: ConversationMessage[]): Set<string> {
    const important = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      // Preserve messages with tool calls (context-dependent)
      const hasToolUse = message.content.some((c) => c.type === 'tool_use');
      if (hasToolUse) {
        important.add(message.id);

        // Also preserve the corresponding tool result
        if (i + 1 < messages.length) {
          const nextMessage = messages[i + 1];
          const hasToolResult = nextMessage.content.some(
            (c) => c.type === 'tool_result'
          );
          if (hasToolResult) {
            important.add(nextMessage.id);
          }
        }
      }

      // Preserve the first message (context setup)
      if (i === 0) {
        important.add(message.id);
      }

      // Preserve messages with important keywords
      const text = this.extractTextContent(message).toLowerCase();
      const importantKeywords = [
        'important',
        'critical',
        'remember',
        'key point',
        'summary',
        'conclusion',
        'error',
        'bug',
        'fix',
      ];

      for (const keyword of importantKeywords) {
        if (text.includes(keyword)) {
          important.add(message.id);
          break;
        }
      }
    }

    return important;
  }

  /**
   * Smart compaction that preserves important messages
   */
  async smartCompact(
    messages: ConversationMessage[],
    model: string
  ): Promise<CompactionResult> {
    const importantIds = this.identifyImportantMessages(messages);

    // Separate important and non-important messages
    const messagesToSummarize: ConversationMessage[] = [];
    const preservedMessages: ConversationMessage[] = [];

    for (const message of messages) {
      if (importantIds.has(message.id)) {
        preservedMessages.push(message);
      } else {
        messagesToSummarize.push(message);
      }
    }

    // Also preserve last N messages
    const lastMessages = messages.slice(-this.config.minMessagesToPreserve);
    for (const msg of lastMessages) {
      if (!preservedMessages.includes(msg)) {
        preservedMessages.push(msg);
      }
    }

    // Sort preserved messages by original order
    preservedMessages.sort((a, b) => {
      const aIndex = messages.findIndex((m) => m.id === a.id);
      const bIndex = messages.findIndex((m) => m.id === b.id);
      return aIndex - bIndex;
    });

    // Calculate original tokens
    const originalTokens = this.tokenCounter.countMessagesTokens(messagesToSummarize);

    // Generate summary
    const summary = messagesToSummarize.length > 0
      ? this.generateSummary(messagesToSummarize)
      : '';

    // Calculate summary tokens
    const summaryTokens = summary ? this.tokenCounter.countText(summary) : 0;

    return {
      summary,
      preservedMessages,
      tokensRemoved: originalTokens,
      tokensSaved: originalTokens - summaryTokens,
    };
  }

  /**
   * Create a compaction summary message
   */
  createSummaryMessage(summary: string): ConversationMessage {
    return {
      id: randomUUID(),
      role: 'system',
      content: [
        {
          type: 'text',
          text: `[Previous Conversation Summary]\n${summary}`,
        },
      ],
      timestamp: new Date(),
      tokenCount: this.tokenCounter.countText(summary),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set max tokens based on model
   */
  setModelContextLimit(model: string): void {
    const limits: Record<string, number> = {
      'claude-opus-4-20250514': 200000,
      'claude-sonnet-4-20250514': 200000,
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-haiku-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
    };

    this.config.maxTokens = limits[model] || 200000;
  }

  /**
   * Calculate optimal message window size
   */
  calculateOptimalWindowSize(
    averageTokensPerMessage: number,
    targetUtilization: number = 0.7
  ): number {
    const availableTokens = this.config.maxTokens * targetUtilization - this.config.reservedTokens;
    return Math.floor(availableTokens / averageTokensPerMessage);
  }
}
