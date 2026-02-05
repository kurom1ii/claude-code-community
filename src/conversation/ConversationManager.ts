/**
 * ConversationManager
 * Core conversation handling for Claude Code Community
 */

import { randomUUID } from 'crypto';
import {
  Conversation,
  ConversationMessage,
  ConversationMetadata,
  MessageContent,
  TokenUsage,
  ApiMessage,
  ApiMessageContent,
  TextContent,
  ToolUseContent,
  ToolResultContent,
} from './types';
import { TokenCounter } from './TokenCounter';
import { ContextWindowManager } from './ContextWindowManager';

/**
 * Default model to use
 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Manages conversation state and history
 */
export class ConversationManager {
  private conversation: Conversation;
  private tokenCounter: TokenCounter;
  private contextWindowManager: ContextWindowManager;

  constructor(
    model: string = DEFAULT_MODEL,
    maxContextTokens: number = 200000
  ) {
    this.tokenCounter = new TokenCounter();
    this.contextWindowManager = new ContextWindowManager({
      maxTokens: maxContextTokens,
      compactionThreshold: 0.8,
      reservedTokens: 8192,
      minMessagesToPreserve: 4,
    });
    this.conversation = this.createEmptyConversation(model);
  }

  /**
   * Create a new conversation
   */
  create(systemPrompt?: string): Conversation {
    this.conversation = this.createEmptyConversation(
      this.conversation.metadata.model,
      systemPrompt
    );
    return this.conversation;
  }

  /**
   * Create an empty conversation structure
   */
  private createEmptyConversation(
    model: string,
    systemPrompt?: string
  ): Conversation {
    const now = new Date();
    return {
      id: randomUUID(),
      messages: [],
      metadata: {
        model,
        systemPrompt,
        createdAt: now,
        lastActiveAt: now,
      },
      tokenUsage: {
        input: 0,
        output: 0,
        total: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    };
  }

  /**
   * Add a message to the conversation
   */
  addMessage(
    role: 'user' | 'assistant' | 'system',
    content: MessageContent[]
  ): ConversationMessage {
    const tokenCount = this.tokenCounter.countMessageTokens({ role, content });

    const message: ConversationMessage = {
      id: randomUUID(),
      role,
      content,
      timestamp: new Date(),
      tokenCount,
    };

    this.conversation.messages.push(message);
    this.conversation.metadata.lastActiveAt = new Date();

    // Update token usage
    if (role === 'user' || role === 'system') {
      this.conversation.tokenUsage.input += tokenCount;
    } else {
      this.conversation.tokenUsage.output += tokenCount;
    }
    this.conversation.tokenUsage.total += tokenCount;

    return message;
  }

  /**
   * Add a user text message (convenience method)
   */
  addUserMessage(text: string): ConversationMessage {
    return this.addMessage('user', [{ type: 'text', text }]);
  }

  /**
   * Add an assistant text message (convenience method)
   */
  addAssistantMessage(text: string): ConversationMessage {
    return this.addMessage('assistant', [{ type: 'text', text }]);
  }

  /**
   * Add a tool result message
   */
  addToolResult(
    toolUseId: string,
    result: string,
    isError: boolean = false
  ): ConversationMessage {
    return this.addMessage('user', [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result,
        is_error: isError,
      },
    ]);
  }

  /**
   * Get all messages in the conversation
   */
  getMessages(): ConversationMessage[] {
    return [...this.conversation.messages];
  }

  /**
   * Get the current conversation
   */
  getConversation(): Conversation {
    return { ...this.conversation };
  }

  /**
   * Get current token usage
   */
  getTokenUsage(): TokenUsage {
    return { ...this.conversation.tokenUsage };
  }

  /**
   * Update token usage from API response
   */
  updateTokenUsage(usage: Partial<TokenUsage>): void {
    if (usage.input !== undefined) {
      this.conversation.tokenUsage.input = usage.input;
    }
    if (usage.output !== undefined) {
      this.conversation.tokenUsage.output = usage.output;
    }
    if (usage.total !== undefined) {
      this.conversation.tokenUsage.total = usage.total;
    }
    if (usage.cacheRead !== undefined) {
      this.conversation.tokenUsage.cacheRead = usage.cacheRead;
    }
    if (usage.cacheWrite !== undefined) {
      this.conversation.tokenUsage.cacheWrite = usage.cacheWrite;
    }
  }

  /**
   * Check if conversation should be compacted
   */
  shouldCompact(): boolean {
    return this.contextWindowManager.shouldCompact(this.conversation.messages);
  }

  /**
   * Compact the conversation to reduce token usage
   */
  async compact(): Promise<void> {
    const result = await this.contextWindowManager.compact(
      this.conversation.messages,
      this.conversation.metadata.model
    );

    // Replace messages with compacted version
    this.conversation.messages = result.preservedMessages;

    // Add summary as a system message if there is one
    if (result.summary) {
      const summaryMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'system',
        content: [
          {
            type: 'text',
            text: `[Conversation Summary]\n${result.summary}`,
          },
        ],
        timestamp: new Date(),
        tokenCount: this.tokenCounter.countText(result.summary),
      };

      // Insert summary at the beginning
      this.conversation.messages.unshift(summaryMessage);
    }

    // Recalculate token usage
    this.recalculateTokenUsage();
  }

  /**
   * Recalculate token usage from messages
   */
  private recalculateTokenUsage(): void {
    let input = 0;
    let output = 0;

    for (const message of this.conversation.messages) {
      const tokens = message.tokenCount ?? this.tokenCounter.countMessageTokens(message);
      if (message.role === 'user' || message.role === 'system') {
        input += tokens;
      } else {
        output += tokens;
      }
    }

    this.conversation.tokenUsage.input = input;
    this.conversation.tokenUsage.output = output;
    this.conversation.tokenUsage.total = input + output;
  }

  /**
   * Clear the conversation
   */
  clear(): void {
    this.conversation = this.createEmptyConversation(
      this.conversation.metadata.model,
      this.conversation.metadata.systemPrompt
    );
  }

  /**
   * Convert conversation to API format
   */
  toApiFormat(): ApiMessage[] {
    const apiMessages: ApiMessage[] = [];

    for (const message of this.conversation.messages) {
      // Skip system messages - they're handled separately in the API
      if (message.role === 'system') {
        continue;
      }

      const apiContent: ApiMessageContent[] = [];

      for (const content of message.content) {
        switch (content.type) {
          case 'text':
            apiContent.push({
              type: 'text',
              text: (content as TextContent).text,
            });
            break;
          case 'tool_use':
            const toolUse = content as ToolUseContent;
            apiContent.push({
              type: 'tool_use',
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
            });
            break;
          case 'tool_result':
            const toolResult = content as ToolResultContent;
            apiContent.push({
              type: 'tool_result',
              tool_use_id: toolResult.tool_use_id,
              content: toolResult.content,
              is_error: toolResult.is_error,
            });
            break;
          case 'thinking':
            // Thinking blocks are not sent back to the API
            break;
        }
      }

      if (apiContent.length > 0) {
        apiMessages.push({
          role: message.role as 'user' | 'assistant',
          content: apiContent,
        });
      }
    }

    return apiMessages;
  }

  /**
   * Get system prompt if set
   */
  getSystemPrompt(): string | undefined {
    return this.conversation.metadata.systemPrompt;
  }

  /**
   * Set or update system prompt
   */
  setSystemPrompt(systemPrompt: string): void {
    this.conversation.metadata.systemPrompt = systemPrompt;
  }

  /**
   * Get conversation metadata
   */
  getMetadata(): ConversationMetadata {
    return { ...this.conversation.metadata };
  }

  /**
   * Get the last message
   */
  getLastMessage(): ConversationMessage | undefined {
    return this.conversation.messages[this.conversation.messages.length - 1];
  }

  /**
   * Get the last assistant message
   */
  getLastAssistantMessage(): ConversationMessage | undefined {
    for (let i = this.conversation.messages.length - 1; i >= 0; i--) {
      if (this.conversation.messages[i].role === 'assistant') {
        return this.conversation.messages[i];
      }
    }
    return undefined;
  }

  /**
   * Check if there are pending tool calls (no results yet)
   */
  hasPendingToolCalls(): boolean {
    const lastAssistant = this.getLastAssistantMessage();
    if (!lastAssistant) return false;

    const toolUses = lastAssistant.content.filter(
      (c) => c.type === 'tool_use'
    ) as ToolUseContent[];

    if (toolUses.length === 0) return false;

    // Check if all tool uses have corresponding results
    const toolResultIds = new Set<string>();
    for (const message of this.conversation.messages) {
      for (const content of message.content) {
        if (content.type === 'tool_result') {
          toolResultIds.add((content as ToolResultContent).tool_use_id);
        }
      }
    }

    return toolUses.some((tu) => !toolResultIds.has(tu.id));
  }

  /**
   * Get pending tool calls
   */
  getPendingToolCalls(): ToolUseContent[] {
    const lastAssistant = this.getLastAssistantMessage();
    if (!lastAssistant) return [];

    const toolUses = lastAssistant.content.filter(
      (c) => c.type === 'tool_use'
    ) as ToolUseContent[];

    // Get IDs of already processed tool results
    const toolResultIds = new Set<string>();
    for (const message of this.conversation.messages) {
      for (const content of message.content) {
        if (content.type === 'tool_result') {
          toolResultIds.add((content as ToolResultContent).tool_use_id);
        }
      }
    }

    return toolUses.filter((tu) => !toolResultIds.has(tu.id));
  }

  /**
   * Estimate tokens for the next API call
   */
  estimateNextCallTokens(): number {
    const systemPromptTokens = this.conversation.metadata.systemPrompt
      ? this.tokenCounter.countText(this.conversation.metadata.systemPrompt)
      : 0;

    const messageTokens = this.conversation.messages.reduce((sum, msg) => {
      return sum + (msg.tokenCount ?? this.tokenCounter.countMessageTokens(msg));
    }, 0);

    return systemPromptTokens + messageTokens;
  }

  /**
   * Export conversation for persistence
   */
  export(): string {
    return JSON.stringify(this.conversation, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2);
  }

  /**
   * Import conversation from persisted data
   */
  import(data: string): void {
    const parsed = JSON.parse(data, (key, value) => {
      if (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
      ) {
        return new Date(value);
      }
      return value;
    });

    this.conversation = parsed;
  }
}
