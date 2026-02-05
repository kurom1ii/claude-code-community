/**
 * Conversation Types
 * Type definitions for conversation management in Claude Code Community
 */

/**
 * Represents a complete conversation with Claude
 */
export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  metadata: ConversationMetadata;
  tokenUsage: TokenUsage;
}

/**
 * A single message in a conversation
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: MessageContent[];
  timestamp: Date;
  tokenCount?: number;
}

/**
 * Union type for all possible message content types
 */
export type MessageContent =
  | TextContent
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent;

/**
 * Plain text content
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Tool use request from the assistant
 */
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Result of a tool execution
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Extended thinking content
 */
export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Conversation metadata
 */
export interface ConversationMetadata {
  model: string;
  systemPrompt?: string;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * Streaming event types from the API
 */
export interface StreamEvent {
  type:
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop'
    | 'error';
  data: unknown;
}

/**
 * API message format for sending to Claude
 */
export interface ApiMessage {
  role: 'user' | 'assistant';
  content: ApiMessageContent[];
}

/**
 * API message content format
 */
export type ApiMessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Tool definition for the API
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Compaction result after summarizing conversation
 */
export interface CompactionResult {
  summary: string;
  preservedMessages: ConversationMessage[];
  tokensRemoved: number;
  tokensSaved: number;
}

/**
 * Context window configuration
 */
export interface ContextWindowConfig {
  maxTokens: number;
  compactionThreshold: number; // Percentage of max tokens to trigger compaction
  reservedTokens: number; // Tokens reserved for response
  minMessagesToPreserve: number;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  toolUseId: string;
  content: string;
  isError: boolean;
  duration: number;
}

/**
 * Parallel tool execution options
 */
export interface ParallelExecutionOptions {
  maxConcurrent: number;
  timeout: number;
  continueOnError: boolean;
}
