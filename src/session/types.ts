/**
 * Session Types
 * Định nghĩa các kiểu dữ liệu cho session management
 */

import type { Message as BaseMessage, ContentBlock } from '../types';

// ============================================================================
// Session Types
// ============================================================================

/** Session ID - UUID v4 */
export type SessionId = string;

/** Session status */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

// ============================================================================
// Core Session Interface (Simplified)
// ============================================================================

/**
 * Simple Session interface for basic session management
 * Use SessionMetadata for extended session data
 */
export interface SimpleSession {
  id: string;
  projectPath: string;
  createdAt: Date;
  lastActiveAt: Date;
  conversationId?: string;
  parentSessionId?: string;
}

/**
 * Session state containing messages and context
 */
export interface SessionState {
  messages: SimpleMessage[];
  context: SessionContext;
  settings: SimpleSessionSettings;
}

/**
 * Session context with environment information
 */
export interface SessionContext {
  workingDirectory: string;
  environment: Record<string, string>;
  gitBranch?: string;
  activeFiles: string[];
}

/**
 * Simple session settings
 */
export interface SimpleSessionSettings {
  model: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Simple message interface
 */
export interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolUses?: ToolUse[];
}

/**
 * Tool use record for messages
 */
export interface ToolUse {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'success' | 'error';
}

/**
 * Session storage interface for persistence
 */
export interface ISessionStorage {
  save(session: SimpleSession, state: SessionState): Promise<void>;
  load(sessionId: string): Promise<{ session: SimpleSession; state: SessionState } | null>;
  list(projectPath?: string): Promise<SimpleSession[]>;
  delete(sessionId: string): Promise<void>;
}

// ============================================================================
// Extended Session Types (Original)
// ============================================================================

/** Session metadata */
export interface SessionMetadata {
  /** Unique session ID */
  id: SessionId;

  /** Session creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  updatedAt: Date;

  /** Project directory path */
  projectPath: string;

  /** Project name (derived from path) */
  projectName: string;

  /** Git branch name (if in git repo) */
  gitBranch?: string;

  /** Current session status */
  status: SessionStatus;

  /** Session title/summary (auto-generated or user-defined) */
  title?: string;

  /** Tags for searching/filtering */
  tags: string[];

  /** Parent session ID (for forked sessions) */
  parentSessionId?: SessionId;

  /** Number of messages in session */
  messageCount: number;

  /** Total tokens used */
  totalTokens: number;

  /** Model used in session */
  model: string;
}

/** Full session data */
export interface Session extends SessionMetadata {
  /** Conversation history */
  messages: ConversationMessage[];

  /** Session-specific context/notes */
  context?: string;

  /** Custom session settings */
  settings?: SessionSettings;
}

/** Session settings */
export interface SessionSettings {
  /** Auto-save enabled */
  autoSave: boolean;

  /** Auto-save interval in ms */
  autoSaveInterval: number;

  /** Max messages to keep in memory */
  maxMessagesInMemory: number;

  /** Enable thinking mode */
  thinkingEnabled: boolean;
}

// ============================================================================
// Conversation Types
// ============================================================================

/** Extended message with session metadata */
export interface ConversationMessage {
  /** Unique message ID */
  id: string;

  /** Message role */
  role: 'user' | 'assistant' | 'system';

  /** Message content */
  content: ContentBlock[] | string;

  /** Message timestamp */
  timestamp: Date;

  /** Token count for this message */
  tokens?: number;

  /** Model used for this message (for assistant) */
  model?: string;

  /** Thinking content (if thinking enabled) */
  thinking?: string;

  /** Tool calls made in this message */
  toolCalls?: ToolCallRecord[];

  /** Is this message from a resumed session */
  isFromHistory?: boolean;
}

/** Record of a tool call */
export interface ToolCallRecord {
  /** Tool call ID */
  id: string;

  /** Tool name */
  name: string;

  /** Tool input */
  input: Record<string, unknown>;

  /** Tool result */
  result?: string;

  /** Was the tool call successful */
  success?: boolean;

  /** Duration in ms */
  duration?: number;
}

/** Conversation state */
export interface ConversationState {
  /** Current messages */
  messages: ConversationMessage[];

  /** Pending tool calls */
  pendingToolCalls: string[];

  /** Is currently streaming */
  isStreaming: boolean;

  /** Last error */
  lastError?: string;
}

// ============================================================================
// Session List Types
// ============================================================================

/** Session summary for listing */
export interface SessionSummary {
  id: SessionId;
  title?: string;
  projectPath: string;
  projectName: string;
  gitBranch?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  tags: string[];
  status: SessionStatus;
  /** Preview of last message */
  lastMessagePreview?: string;
}

/** Session list filter options */
export interface SessionFilter {
  /** Filter by project path */
  projectPath?: string;

  /** Filter by status */
  status?: SessionStatus | SessionStatus[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by date range */
  dateRange?: {
    from?: Date;
    to?: Date;
  };

  /** Search in title/messages */
  searchQuery?: string;
}

/** Session list sort options */
export interface SessionSort {
  /** Sort field */
  field: 'createdAt' | 'updatedAt' | 'messageCount' | 'title';

  /** Sort direction */
  direction: 'asc' | 'desc';
}

/** Paginated session list */
export interface SessionListResult {
  /** Sessions in current page */
  sessions: SessionSummary[];

  /** Total count */
  total: number;

  /** Current page (0-indexed) */
  page: number;

  /** Page size */
  pageSize: number;

  /** Has more pages */
  hasMore: boolean;
}

// ============================================================================
// Session Events
// ============================================================================

/** Session event types */
export type SessionEventType =
  | 'session:created'
  | 'session:resumed'
  | 'session:forked'
  | 'session:saved'
  | 'session:completed'
  | 'session:archived'
  | 'message:added'
  | 'message:updated'
  | 'error:save'
  | 'error:load';

/** Session event */
export interface SessionEvent {
  type: SessionEventType;
  sessionId: SessionId;
  timestamp: Date;
  data?: unknown;
}

/** Session event handler */
export type SessionEventHandler = (event: SessionEvent) => void;

// ============================================================================
// Session Storage Types
// ============================================================================

/** Storage format for sessions */
export interface StoredSession {
  version: number;
  metadata: SessionMetadata;
  messages: ConversationMessage[];
  context?: string;
  settings?: SessionSettings;
}

/** Session file info */
export interface SessionFileInfo {
  id: SessionId;
  filePath: string;
  summaryPath?: string;
  size: number;
  lastModified: Date;
}

// ============================================================================
// Fork Types
// ============================================================================

/** Fork options */
export interface ForkOptions {
  /** New title for forked session */
  title?: string;

  /** Fork from specific message index (default: all) */
  fromMessageIndex?: number;

  /** Additional tags for forked session */
  tags?: string[];

  /** Copy context */
  copyContext?: boolean;
}

/** Fork result */
export interface ForkResult {
  /** Original session ID */
  originalSessionId: SessionId;

  /** New forked session ID */
  forkedSessionId: SessionId;

  /** Number of messages copied */
  messagesCopied: number;
}
