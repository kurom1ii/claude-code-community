/**
 * CLI Types
 * Type definitions for the interactive CLI system
 */

import type { Session, ConversationMessage, SessionSettings } from '../session/types';
import type { ClaudeConfig } from '../config/types';
import type { ConversationHistory } from '../session/ConversationHistory';

// ============================================================================
// CLI Options
// ============================================================================

/**
 * Options for initializing the CLI
 */
export interface CLIOptions {
  /** Model to use for completions */
  model?: string;

  /** Custom system prompt */
  systemPrompt?: string;

  /** Append to default system prompt */
  appendSystemPrompt?: string;

  /** Allowed directories for file operations */
  allowedDirs?: string[];

  /** Allowed tool names */
  allowedTools?: string[];

  /** Disallowed tool names */
  disallowedTools?: string[];

  /** One-shot mode - print response and exit */
  print?: boolean;

  /** Resume session by ID */
  resume?: string;

  /** Continue most recent session */
  continue?: boolean;

  /** Fork session when resuming */
  forkSession?: boolean;

  /** Specific session ID to use */
  sessionId?: string;

  /** Enable verbose output */
  verbose?: boolean;

  /** Enable debug mode */
  debug?: boolean;

  /** API key for Anthropic */
  apiKey?: string;

  /** Output format for print mode */
  outputFormat?: 'text' | 'json' | 'stream-json';

  /** Input format for print mode */
  inputFormat?: 'text' | 'stream-json';

  /** Permission mode */
  permissionMode?: 'default' | 'plan' | 'bypassPermissions';

  /** Maximum turns in non-interactive mode */
  maxTurns?: number;

  /** Maximum thinking tokens */
  maxThinkingTokens?: number;

  /** Agent to use */
  agent?: string;

  /** MCP configuration files or strings */
  mcpConfig?: string[];

  /** Initial prompt to execute */
  initialPrompt?: string;
}

// ============================================================================
// CLI Context
// ============================================================================

/**
 * Runtime context for the CLI session
 */
export interface CLIContext {
  /** Current working directory */
  cwd: string;

  /** Current session */
  session: Session | null;

  /** Loaded configuration */
  config: ClaudeConfig;

  /** Conversation history manager */
  conversation: ConversationHistory;

  /** Whether running in interactive mode */
  isInteractive: boolean;

  /** Current model being used */
  model: string;

  /** API key */
  apiKey: string;

  /** Whether currently processing a request */
  isProcessing: boolean;

  /** Last error message */
  lastError?: string;
}

// ============================================================================
// Input Modes
// ============================================================================

/**
 * Input mode for the CLI
 */
export type InputMode = 'normal' | 'multiline' | 'vim' | 'emacs';

/**
 * Input state tracking
 */
export interface InputState {
  /** Current input value */
  value: string;

  /** Cursor position in the input */
  cursorPosition: number;

  /** Input history */
  history: string[];

  /** Current history index (-1 = current input) */
  historyIndex: number;

  /** Current input mode */
  mode: InputMode;

  /** Whether in multiline input mode */
  isMultiline: boolean;

  /** Accumulated multiline content */
  multilineBuffer: string[];

  /** Whether input is active/focused */
  isActive: boolean;
}

// ============================================================================
// Key Bindings
// ============================================================================

/**
 * Key binding action type
 */
export type KeyAction =
  | 'submit'
  | 'cancel'
  | 'clear'
  | 'historyUp'
  | 'historyDown'
  | 'cursorLeft'
  | 'cursorRight'
  | 'cursorHome'
  | 'cursorEnd'
  | 'deleteChar'
  | 'deleteWord'
  | 'deleteLine'
  | 'multilineToggle'
  | 'multilineSubmit'
  | 'complete'
  | 'interrupt'
  | 'suspend'
  | 'exit';

/**
 * Key binding definition
 */
export interface KeyBinding {
  /** Key or key combination */
  key: string;

  /** Modifier keys */
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };

  /** Action to perform */
  action: KeyAction;

  /** Description for help */
  description?: string;
}

/**
 * Key bindings configuration
 */
export interface KeyBindingsConfig {
  /** Custom key bindings */
  bindings: KeyBinding[];

  /** Whether to use vim-style bindings */
  vimMode?: boolean;

  /** Whether to use emacs-style bindings */
  emacsMode?: boolean;
}

// ============================================================================
// Completion
// ============================================================================

/**
 * Completion item
 */
export interface CompletionItem {
  /** The completion text */
  value: string;

  /** Display label */
  label?: string;

  /** Description */
  description?: string;

  /** Type of completion */
  type: 'command' | 'file' | 'directory' | 'tool' | 'history' | 'model' | 'option';

  /** Icon for display */
  icon?: string;
}

/**
 * Completion provider interface
 */
export interface CompletionProvider {
  /** Get completions for the given input */
  getCompletions(input: string, cursorPosition: number): Promise<CompletionItem[]>;

  /** Trigger characters that activate completion */
  triggerCharacters?: string[];
}

// ============================================================================
// Output Types
// ============================================================================

/**
 * Output entry type
 */
export type OutputType =
  | 'text'
  | 'code'
  | 'tool'
  | 'error'
  | 'warning'
  | 'info'
  | 'success'
  | 'thinking'
  | 'system';

/**
 * Output entry for display
 */
export interface OutputEntry {
  /** Entry type */
  type: OutputType;

  /** Content to display */
  content: string;

  /** Optional metadata */
  metadata?: {
    language?: string;
    toolName?: string;
    duration?: number;
    tokens?: number;
  };

  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// Signal Handling
// ============================================================================

/**
 * Signal types that can be handled
 */
export type SignalType = 'SIGINT' | 'SIGTERM' | 'SIGTSTP' | 'SIGHUP';

/**
 * Signal handler function
 */
export type SignalHandler = (signal: SignalType) => void | Promise<void>;

/**
 * Signal handling options
 */
export interface SignalOptions {
  /** Handler for SIGINT (Ctrl+C) */
  onInterrupt?: SignalHandler;

  /** Handler for SIGTERM */
  onTerminate?: SignalHandler;

  /** Handler for SIGTSTP (Ctrl+Z) */
  onSuspend?: SignalHandler;

  /** Whether to allow graceful shutdown */
  gracefulShutdown?: boolean;

  /** Shutdown timeout in ms */
  shutdownTimeout?: number;
}

// ============================================================================
// History
// ============================================================================

/**
 * History entry
 */
export interface HistoryEntry {
  /** The input text */
  input: string;

  /** When this was entered */
  timestamp: Date;

  /** Session ID when entered */
  sessionId?: string;

  /** Working directory when entered */
  cwd?: string;
}

/**
 * History manager options
 */
export interface HistoryOptions {
  /** Maximum entries to keep in memory */
  maxEntries?: number;

  /** Path to history file */
  historyFile?: string;

  /** Whether to persist history */
  persist?: boolean;

  /** Whether to deduplicate consecutive entries */
  deduplicate?: boolean;
}

// ============================================================================
// CLI Events
// ============================================================================

/**
 * CLI event types
 */
export type CLIEventType =
  | 'input:submitted'
  | 'input:cancelled'
  | 'output:added'
  | 'session:started'
  | 'session:ended'
  | 'processing:started'
  | 'processing:ended'
  | 'error:occurred'
  | 'signal:received'
  | 'shutdown:initiated';

/**
 * CLI event
 */
export interface CLIEvent {
  type: CLIEventType;
  timestamp: Date;
  data?: unknown;
}

/**
 * CLI event handler
 */
export type CLIEventHandler = (event: CLIEvent) => void | Promise<void>;

// ============================================================================
// Render Options
// ============================================================================

/**
 * Options for rendering output
 */
export interface RenderOptions {
  /** Enable markdown rendering */
  markdown?: boolean;

  /** Enable syntax highlighting */
  syntaxHighlight?: boolean;

  /** Enable line numbers for code */
  lineNumbers?: boolean;

  /** Maximum width for output */
  maxWidth?: number;

  /** Theme for syntax highlighting */
  theme?: 'dark' | 'light';

  /** Show timestamps */
  showTimestamps?: boolean;

  /** Show token usage */
  showTokens?: boolean;
}

// ============================================================================
// App State (for React/Ink)
// ============================================================================

/**
 * Application state for the Ink components
 */
export interface AppState {
  /** Current input value */
  input: string;

  /** Messages in the conversation */
  messages: ConversationMessage[];

  /** Whether currently processing */
  isProcessing: boolean;

  /** Current thinking verb for spinner */
  thinkingVerb: string;

  /** Current model */
  model: string;

  /** Current mode (code, plan, bash) */
  mode: 'code' | 'plan' | 'bash';

  /** Last error */
  error: string | null;

  /** Whether showing help */
  showHelp: boolean;

  /** Whether showing session picker */
  showSessionPicker: boolean;

  /** Token usage statistics */
  tokenUsage: {
    input: number;
    output: number;
    cache?: number;
  };

  /** Current session ID */
  sessionId: string | null;
}

// ============================================================================
// Print Mode Options
// ============================================================================

/**
 * Options specific to print/non-interactive mode
 */
export interface PrintModeOptions {
  /** Output format */
  format: 'text' | 'json' | 'stream-json';

  /** Input format */
  inputFormat: 'text' | 'stream-json';

  /** Maximum turns before exiting */
  maxTurns?: number;

  /** Whether to include metadata in output */
  includeMetadata?: boolean;

  /** Whether to include tool outputs */
  includeToolOutputs?: boolean;
}
