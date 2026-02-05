/**
 * Conversation History Manager
 * Quản lý message history với context window optimization
 */

import type { Message, ContentBlock } from '../types';
import type { ConversationMessage, ConversationState, ToolCallRecord } from './types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_MAX_TOKENS = 100000;
const SUMMARY_TRIGGER_THRESHOLD = 0.8; // Trigger summarization at 80% capacity

// ============================================================================
// ConversationHistory Class
// ============================================================================

export class ConversationHistory {
  private messages: ConversationMessage[] = [];
  private maxMessages: number;
  private maxTokens: number;
  private currentTokens: number = 0;
  private pendingToolCalls: Map<string, ToolCallRecord> = new Map();
  private isStreaming: boolean = false;

  constructor(options?: {
    maxMessages?: number;
    maxTokens?: number;
  }) {
    this.maxMessages = options?.maxMessages || DEFAULT_MAX_MESSAGES;
    this.maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
  }

  // --------------------------------------------------------------------------
  // Message Operations
  // --------------------------------------------------------------------------

  /**
   * Thêm message vào history
   */
  addMessage(message: ConversationMessage): void {
    this.messages.push(message);

    if (message.tokens) {
      this.currentTokens += message.tokens;
    }

    // Kiểm tra và cleanup nếu cần
    this.checkAndCleanup();
  }

  /**
   * Thêm user message
   */
  addUserMessage(content: string | ContentBlock[], tokens?: number): ConversationMessage {
    const message: ConversationMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
      tokens,
    };

    this.addMessage(message);
    return message;
  }

  /**
   * Thêm assistant message
   */
  addAssistantMessage(
    content: ContentBlock[],
    options?: {
      tokens?: number;
      model?: string;
      thinking?: string;
      toolCalls?: ToolCallRecord[];
    }
  ): ConversationMessage {
    const message: ConversationMessage = {
      id: this.generateId(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      tokens: options?.tokens,
      model: options?.model,
      thinking: options?.thinking,
      toolCalls: options?.toolCalls,
    };

    this.addMessage(message);
    return message;
  }

  /**
   * Thêm system message
   */
  addSystemMessage(content: string): ConversationMessage {
    const message: ConversationMessage = {
      id: this.generateId(),
      role: 'system',
      content,
      timestamp: new Date(),
    };

    this.addMessage(message);
    return message;
  }

  /**
   * Update message cuối cùng (cho streaming)
   */
  updateLastMessage(updates: Partial<ConversationMessage>): boolean {
    if (this.messages.length === 0) {
      return false;
    }

    const lastIndex = this.messages.length - 1;
    this.messages[lastIndex] = {
      ...this.messages[lastIndex],
      ...updates,
    };

    return true;
  }

  /**
   * Xóa message theo ID
   */
  removeMessage(messageId: string): boolean {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index === -1) {
      return false;
    }

    const removed = this.messages.splice(index, 1)[0];
    if (removed.tokens) {
      this.currentTokens -= removed.tokens;
    }

    return true;
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.currentTokens = 0;
    this.pendingToolCalls.clear();
  }

  // --------------------------------------------------------------------------
  // Tool Call Tracking
  // --------------------------------------------------------------------------

  /**
   * Register pending tool call
   */
  registerToolCall(toolCall: ToolCallRecord): void {
    this.pendingToolCalls.set(toolCall.id, toolCall);
  }

  /**
   * Complete tool call với result
   */
  completeToolCall(
    toolCallId: string,
    result: string,
    success: boolean = true,
    duration?: number
  ): void {
    const toolCall = this.pendingToolCalls.get(toolCallId);
    if (toolCall) {
      toolCall.result = result;
      toolCall.success = success;
      toolCall.duration = duration;
      this.pendingToolCalls.delete(toolCallId);
    }
  }

  /**
   * Get pending tool calls
   */
  getPendingToolCalls(): ToolCallRecord[] {
    return Array.from(this.pendingToolCalls.values());
  }

  /**
   * Has pending tool calls
   */
  hasPendingToolCalls(): boolean {
    return this.pendingToolCalls.size > 0;
  }

  // --------------------------------------------------------------------------
  // Message Access
  // --------------------------------------------------------------------------

  /**
   * Lấy tất cả messages
   */
  getMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Lấy messages cho API request (convert to Message format)
   */
  getMessagesForAPI(): Message[] {
    return this.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Lấy N messages gần nhất
   */
  getRecentMessages(count: number): ConversationMessage[] {
    return this.messages.slice(-count);
  }

  /**
   * Lấy message theo ID
   */
  getMessage(messageId: string): ConversationMessage | undefined {
    return this.messages.find(m => m.id === messageId);
  }

  /**
   * Lấy message cuối cùng
   */
  getLastMessage(): ConversationMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * Lấy message cuối của role cụ thể
   */
  getLastMessageByRole(role: 'user' | 'assistant' | 'system'): ConversationMessage | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === role) {
        return this.messages[i];
      }
    }
    return undefined;
  }

  /**
   * Đếm số messages
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    return this.currentTokens;
  }

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  /**
   * Set streaming state
   */
  setStreaming(isStreaming: boolean): void {
    this.isStreaming = isStreaming;
  }

  /**
   * Get current state
   */
  getState(): ConversationState {
    return {
      messages: this.getMessages(),
      pendingToolCalls: Array.from(this.pendingToolCalls.keys()),
      isStreaming: this.isStreaming,
    };
  }

  /**
   * Restore state
   */
  restoreState(state: ConversationState): void {
    this.messages = state.messages;
    this.currentTokens = this.messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
  }

  // --------------------------------------------------------------------------
  // Context Window Management
  // --------------------------------------------------------------------------

  /**
   * Kiểm tra và cleanup nếu vượt quá limit
   */
  private checkAndCleanup(): void {
    // Check message count
    if (this.messages.length > this.maxMessages) {
      this.trimOldMessages();
    }

    // Check token count
    if (this.currentTokens > this.maxTokens * SUMMARY_TRIGGER_THRESHOLD) {
      this.compressHistory();
    }
  }

  /**
   * Trim old messages để giữ trong limit
   */
  private trimOldMessages(): void {
    const excess = this.messages.length - this.maxMessages;
    if (excess <= 0) return;

    // Giữ system messages
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const nonSystemMessages = this.messages.filter(m => m.role !== 'system');

    // Remove oldest non-system messages
    const removed = nonSystemMessages.splice(0, excess);
    removed.forEach(m => {
      if (m.tokens) {
        this.currentTokens -= m.tokens;
      }
    });

    // Reconstruct
    this.messages = [...systemMessages, ...nonSystemMessages];
  }

  /**
   * Compress history để tiết kiệm tokens
   * TODO: Implement actual summarization với AI
   */
  private compressHistory(): void {
    // Hiện tại chỉ trim, sau này có thể implement summarization
    const keepCount = Math.floor(this.maxMessages * 0.5);
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const nonSystemMessages = this.messages.filter(m => m.role !== 'system');

    const toKeep = nonSystemMessages.slice(-keepCount);
    const removed = nonSystemMessages.slice(0, -keepCount);

    removed.forEach(m => {
      if (m.tokens) {
        this.currentTokens -= m.tokens;
      }
    });

    this.messages = [...systemMessages, ...toKeep];
  }

  /**
   * Get messages that fit within token budget
   */
  getMessagesWithinBudget(tokenBudget: number): ConversationMessage[] {
    const result: ConversationMessage[] = [];
    let tokenCount = 0;

    // Iterate from newest to oldest
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      const msgTokens = msg.tokens || this.estimateTokens(msg);

      if (tokenCount + msgTokens <= tokenBudget) {
        result.unshift(msg);
        tokenCount += msgTokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Estimate tokens for a message (rough estimate)
   */
  private estimateTokens(message: ConversationMessage): number {
    let text = '';

    if (typeof message.content === 'string') {
      text = message.content;
    } else {
      text = message.content
        .map(block => {
          if ('text' in block) return block.text;
          if ('thinking' in block) return block.thinking;
          return '';
        })
        .join(' ');
    }

    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // --------------------------------------------------------------------------
  // Import/Export
  // --------------------------------------------------------------------------

  /**
   * Export messages to JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.messages, null, 2);
  }

  /**
   * Import messages from JSON
   */
  importFromJSON(json: string): void {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid JSON format: expected array');
    }

    this.clear();
    parsed.forEach((msg: ConversationMessage) => {
      this.addMessage({
        ...msg,
        timestamp: new Date(msg.timestamp),
      });
    });
  }

  /**
   * Load từ conversation messages (e.g., từ session)
   */
  loadFromMessages(messages: ConversationMessage[]): void {
    this.clear();
    messages.forEach(msg => this.addMessage(msg));
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if history is empty
   */
  isEmpty(): boolean {
    return this.messages.length === 0;
  }

  /**
   * Get statistics
   */
  getStats(): {
    messageCount: number;
    tokenCount: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
  } {
    const userMessages = this.messages.filter(m => m.role === 'user').length;
    const assistantMessages = this.messages.filter(m => m.role === 'assistant').length;
    const systemMessages = this.messages.filter(m => m.role === 'system').length;

    return {
      messageCount: this.messages.length,
      tokenCount: this.currentTokens,
      userMessages,
      assistantMessages,
      systemMessages,
    };
  }
}

// ============================================================================
// Export factory function
// ============================================================================

export function createConversationHistory(options?: {
  maxMessages?: number;
  maxTokens?: number;
}): ConversationHistory {
  return new ConversationHistory(options);
}
