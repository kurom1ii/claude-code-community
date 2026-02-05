/**
 * Claude Code API - Main Export
 * Export tất cả modules của Anthropic API client
 */

// ============================================================================
// Types - Các type definitions
// ============================================================================

export type {
  // Content blocks
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
  ImageSource,
  DocumentBlock,
  DocumentSource,
  ContentBlock,
  ContentDelta,

  // Messages
  MessageRole,
  Message,
  UserMessage,
  AssistantMessage,

  // Tools
  JsonSchema,
  JsonSchemaProperty,
  ToolDefinition,
  ToolChoice,

  // Request/Response
  RequestMetadata,
  SystemPrompt,
  SystemPromptBlock,
  CacheControl,
  ThinkingConfig,
  CreateMessageRequest,
  Usage,
  StopReason,
  CreateMessageResponse,

  // Streaming events
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
  PingEvent,
  ErrorEvent,
  StreamEvent,

  // Errors
  ApiErrorResponse,
  ApiErrorType,

  // Utilities
  PartialMessage,
  ClientOptions,
  ApiHeaders,
} from './types';

// ============================================================================
// Models - Model definitions và utilities
// ============================================================================

export {
  // Model ID constants
  OPUS_MODELS,
  SONNET_MODELS,
  HAIKU_MODELS,

  // Model list
  AVAILABLE_MODELS,
  MODEL_ALIASES,
  CONTEXT_LIMITS,

  // Model utilities
  resolveModelAlias,
  getModelLabel,
  getModelDescription,
  getContextLimit,
  getModelForMode,
  createModelConfig,
  getModelSelectorOptions,
  supportsExtendedThinking,
  supportsVision,
  getModelFamily,

  // Defaults
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
} from './models';

export type {
  ModelOption,
  ModelAlias,
  ModelConfig,
  ModelSelectorOption,
  OperationMode,
} from './models';

// ============================================================================
// Errors - Error classes và utilities
// ============================================================================

export {
  // Error classes
  AnthropicApiError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  RateLimitError,
  InvalidRequestError,
  OverloadedError,
  InternalServerError,
  TimeoutError,
  ConnectionError,
  StreamAbortedError,
  ParseError,

  // Error utilities
  isAnthropicError,
  shouldRetry,
  getRetryDelay,
  formatErrorMessage,
} from './errors';

// ============================================================================
// Streaming - Stream handling utilities
// ============================================================================

export {
  // Stream message builder
  StreamMessageBuilder,

  // SSE parsing
  parseSSELine,
  parseStreamEvent,

  // Stream readers
  readStream,
  streamEvents,
  collectStreamText,

  // Message utilities
  extractTextFromMessage,
  extractToolUsesFromMessage,
} from './streaming';

export type { StreamMessageState, StreamReaderOptions } from './streaming';

// ============================================================================
// Client - Main API client
// ============================================================================

export {
  // Client class
  AnthropicClient,
  ConversationBuilder,

  // Factory functions
  createClient,
  createClientFromEnv,

  // Helper functions
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
} from './client';

// ============================================================================
// Token Utilities - Token counting và estimation
// ============================================================================

export {
  // Token estimation
  estimateTokens,
  estimateMessageTokens,
  estimateContentBlockTokens,
  estimateConversationTokens,
  estimateToolDefinitionTokens,
  estimateSystemPromptTokens,
  estimateRequestTokens,

  // Token formatting
  formatTokenCount,
  formatTokenCountWithUnit,

  // Token limits
  exceedsTokenLimit,
  remainingTokens,
  tokenUsagePercent,

  // Text truncation
  truncateToTokens,
  truncateMiddle,
  smartTruncate,

  // Token budget
  createTokenBudget,
  getAvailableTokens,
  consumeTokens,
  hasTokenBudget,
} from './tokens';

export type { TokenBudget } from './tokens';

// ============================================================================
// Request Caching
// ============================================================================

export {
  // Cache class
  RequestCache,

  // Cache utilities
  isCacheable,
  createCacheKey,
  getGlobalCache,
  clearGlobalCache,
  withCache,
} from './cache';

export type {
  CacheEntry,
  CacheOptions,
  CacheStats,
} from './cache';

// ============================================================================
// Usage Tracking
// ============================================================================

export {
  // Usage tracker
  UsageTracker,
  getGlobalUsageTracker,
  clearGlobalUsageTracker,

  // Cost utilities
  formatCost,
  getModelPricing,
  hasKnownPricing,
} from './usage';

export type {
  UsageRecord,
  UsageSummary,
  ModelUsageSummary,
  CostEstimate,
  ModelPricing,
} from './usage';

// ============================================================================
// Rate Limiting
// ============================================================================

export {
  // Rate limiter
  RateLimiter,
  getGlobalRateLimiter,
  resetGlobalRateLimiter,

  // Rate limit utilities
  withRateLimit,
  checkRateLimit,
  ClientRateLimitError,
} from './rate-limiter';

export type {
  RateLimitConfig,
  RateLimitState,
} from './rate-limiter';

// ============================================================================
// Message Builder Utilities
// ============================================================================

export {
  // Message creation
  userMessage,
  userMessageBlocks,
  assistantMessage,
  assistantMessageBlocks,

  // Content blocks
  textBlock,
  toolUseBlock,
  toolResultBlock,
  toolResultMessage,
  toolResultsMessage,
  imageBlockBase64,
  imageBlockUrl,
  documentBlockPdf,

  // System prompt
  systemPrompt,
  systemPromptWithCache,
  systemPromptParts,
  combineSystemPrompts,

  // Tool definitions
  toolDefinition,
  simpleToolDefinition,

  // Message builder
  MessageBuilder,
  createMessageBuilder,

  // Conversation utilities
  getLastAssistantText,
  extractToolUses,
  needsToolResult,
  getPendingToolUses,
  validateMessages,
} from './message-builder';
