/**
 * Session Module
 * Module quản lý session cho claude-code-community
 *
 * Cung cấp:
 * - Session creation, resumption, forking
 * - Message history management
 * - Session storage to ~/.claude/projects/
 * - Memory management for long sessions
 * - Interactive session picker
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Session ID type
  SessionId,
  SessionStatus,

  // Simple Session types (for basic usage)
  SimpleSession,
  SessionState,
  SessionContext,
  SimpleSessionSettings,
  SimpleMessage,
  ToolUse,
  ISessionStorage,

  // Extended Session types
  SessionMetadata,
  Session,
  SessionSettings,

  // Conversation types
  ConversationMessage,
  ToolCallRecord,
  ConversationState,

  // Session list types
  SessionSummary,
  SessionFilter,
  SessionSort,
  SessionListResult,

  // Event types
  SessionEventType,
  SessionEvent,
  SessionEventHandler,

  // Storage types
  StoredSession,
  SessionFileInfo,

  // Fork types
  ForkOptions,
  ForkResult,
} from './types';

// ============================================================================
// Class Exports
// ============================================================================

// Core classes
export { SessionStorage, sessionStorage } from './SessionStorage';
export { SessionManager, sessionManager } from './SessionManager';
export { ConversationHistory, createConversationHistory } from './ConversationHistory';
export {
  MemoryManager,
  memoryManager,
  createMemoryManager,
  type MemoryManagerOptions,
  type TokenUsageStats,
  type CompactionResult,
  type SummaryResult,
} from './MemoryManager';

// Session picker
export {
  SessionPicker,
  sessionPicker,
  getResumableSessions,
  findSession,
  type SessionPickerOptions,
  type SessionPickerResult,
  type FormattedSessionItem,
  type MenuItemData,
} from './SessionPicker';

// ============================================================================
// Default Export
// ============================================================================

import { sessionManager } from './SessionManager';
import { sessionStorage } from './SessionStorage';
import { memoryManager } from './MemoryManager';
import { sessionPicker } from './SessionPicker';

export default {
  manager: sessionManager,
  storage: sessionStorage,
  memory: memoryManager,
  picker: sessionPicker,
};
