/**
 * Claude Code - Configuration Types
 * Type definitions for configuration management
 */

import type { Settings, Hooks, MCPServerConfig as MCPServerSchemaConfig, Sandbox, Permissions } from './schemas';

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Permission level for tools
 * - 'allow': Tool can be used without confirmation
 * - 'ask': Tool requires user confirmation before use
 * - 'deny': Tool is blocked from use
 */
export type PermissionLevel = 'allow' | 'ask' | 'deny';

/**
 * Tool permission configuration
 */
export interface ToolPermission {
  /** Tool name or pattern */
  tool: string;
  /** Permission level */
  level: PermissionLevel;
  /** Optional description for permission */
  description?: string;
}

// ============================================================================
// MCP Server Types
// ============================================================================

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** Unique server name */
  name: string;
  /** Command to start the server */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether the server is enabled */
  enabled?: boolean;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Server description */
  description?: string;
}

/**
 * Convert from schema MCPServerConfig to our MCPServerConfig
 */
export function fromSchemaMCPServerConfig(name: string, config: MCPServerSchemaConfig): MCPServerConfig {
  return {
    name,
    command: config.command,
    args: config.args,
    env: config.env as Record<string, string> | undefined,
    enabled: !config.disabled,
  };
}

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Hook event types
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SessionStart'
  | 'PromptSubmit';

/**
 * Hook configuration
 */
export interface HookConfig {
  /** Hook event type */
  event: HookEvent;
  /** Tool matcher pattern (optional) */
  matcher?: {
    tool?: string;
    toolInput?: Record<string, string>;
  };
  /** Command to execute */
  command: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Working directory */
  workingDirectory?: string;
  /** Whether hook is enabled */
  enabled?: boolean;
}

/**
 * Convert from schema Hooks to HookConfig array
 */
export function fromSchemaHooks(hooks: Hooks): HookConfig[] {
  const result: HookConfig[] = [];
  const events: HookEvent[] = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionStart', 'PromptSubmit'];

  for (const event of events) {
    const entries = hooks[event];
    if (!entries) continue;

    for (const entry of entries) {
      for (const hook of entry.hooks) {
        result.push({
          event,
          matcher: entry.matcher,
          command: hook.command,
          timeout: hook.timeout,
          workingDirectory: hook.workingDirectory,
          enabled: true,
        });
      }
    }
  }

  return result;
}

// ============================================================================
// Main Configuration Type
// ============================================================================

/**
 * Complete Claude Code configuration
 */
export interface ClaudeConfig {
  // ========== API Settings ==========

  /**
   * Anthropic API key
   * Can also be set via ANTHROPIC_API_KEY environment variable
   */
  apiKey?: string;

  /**
   * Model to use for completions
   * @default 'claude-sonnet-4-5-20250929'
   */
  model: string;

  /**
   * Maximum tokens for output
   * @default 8096
   */
  maxTokens: number;

  /**
   * Context window limit
   * @default 200000
   */
  contextLimit: number;

  // ========== Behavior Settings ==========

  /**
   * Confirm dangerous actions before execution
   * @default true
   */
  confirmDangerousActions: boolean;

  /**
   * Automatically compact conversation when approaching context limit
   * @default true
   */
  autoCompact: boolean;

  /**
   * Token threshold for auto-compaction (percentage of context limit)
   * @default 0.8
   */
  compactThreshold: number;

  /**
   * Enable extended thinking mode
   * @default true
   */
  thinkingEnabled: boolean;

  /**
   * Budget tokens for thinking
   * @default 10000
   */
  thinkingBudget: number;

  // ========== Directory Settings ==========

  /**
   * Directories allowed for file operations
   * @default [process.cwd()]
   */
  allowedDirs: string[];

  /**
   * Directories blocked from file operations
   * @default []
   */
  blockedDirs: string[];

  /**
   * Additional directories to include
   */
  additionalDirectories: string[];

  /**
   * Respect .gitignore files
   * @default true
   */
  respectGitignore: boolean;

  // ========== Tool Settings ==========

  /**
   * List of enabled tool names
   * If empty, all tools are enabled
   */
  enabledTools: string[];

  /**
   * List of disabled tool names
   */
  disabledTools: string[];

  /**
   * Permission levels for specific tools
   */
  toolPermissions: Record<string, PermissionLevel>;

  /**
   * Default permission mode for tools
   * @default 'ask'
   */
  defaultPermissionMode: PermissionLevel;

  // ========== UI Settings ==========

  /**
   * Color theme
   * @default 'dark'
   */
  theme: 'dark' | 'light' | 'auto';

  /**
   * Show token usage in output
   * @default true
   */
  showTokenUsage: boolean;

  /**
   * Show timing information
   * @default false
   */
  showTimings: boolean;

  /**
   * Output verbosity level
   * @default 'normal'
   */
  verbosity: 'quiet' | 'normal' | 'verbose' | 'debug';

  /**
   * Enable syntax highlighting
   * @default true
   */
  syntaxHighlighting: boolean;

  /**
   * Show spinner tips
   * @default true
   */
  spinnerTipsEnabled: boolean;

  /**
   * Enable prompt suggestions
   * @default true
   */
  promptSuggestionEnabled: boolean;

  /**
   * Prefer reduced motion for accessibility
   * @default false
   */
  prefersReducedMotion: boolean;

  // ========== Session Settings ==========

  /**
   * Session timeout in milliseconds (0 = no timeout)
   * @default 0
   */
  sessionTimeout: number;

  /**
   * Auto-save interval in milliseconds
   * @default 60000
   */
  autoSaveInterval: number;

  /**
   * Maximum conversation history length
   * @default 1000
   */
  maxHistoryLength: number;

  /**
   * Cleanup period for old sessions in days
   * @default 30
   */
  cleanupPeriodDays: number;

  // ========== MCP Settings ==========

  /**
   * MCP server configurations
   */
  mcpServers: MCPServerConfig[];

  /**
   * Enable all project MCP servers without prompting
   * @default false
   */
  enableAllProjectMcpServers: boolean;

  /**
   * MCP connection timeout in milliseconds
   * @default 30000
   */
  mcpConnectionTimeout: number;

  /**
   * MCP server connection batch size
   * @default 3
   */
  mcpBatchSize: number;

  // ========== Hooks ==========

  /**
   * Hook configurations
   */
  hooks: HookConfig[];

  /**
   * Disable all hooks
   * @default false
   */
  disableAllHooks: boolean;

  // ========== Sandbox Settings ==========

  /**
   * Sandbox configuration
   */
  sandbox?: {
    enabled?: boolean;
    type?: 'docker' | 'firejail' | 'none';
    container?: string;
    image?: string;
  };

  // ========== Language & Locale ==========

  /**
   * Preferred language for responses
   */
  language?: string;

  /**
   * Output style preference
   */
  outputStyle?: string;

  // ========== Custom Settings ==========

  /**
   * Custom user-defined settings
   */
  custom: Record<string, unknown>;
}

// ============================================================================
// Project Configuration Type
// ============================================================================

/**
 * Project-specific configuration
 * Extends ClaudeConfig with project-specific options
 */
export interface ProjectConfig extends Partial<ClaudeConfig> {
  /**
   * Project name
   */
  projectName?: string;

  /**
   * File patterns to ignore
   */
  ignorePatterns?: string[];

  /**
   * Custom prompt/instructions for this project
   */
  customPrompt?: string;

  /**
   * Project-specific environment variables
   */
  env?: Record<string, string>;

  /**
   * Plans directory for this project
   */
  plansDirectory?: string;

  /**
   * Attribution settings
   */
  attribution?: {
    commit?: string;
    pr?: string;
  };

  /**
   * File suggestion configuration
   */
  fileSuggestion?: {
    type: 'command';
    command: string;
  };
}

// ============================================================================
// Configuration Source Types
// ============================================================================

/**
 * Source of configuration values
 */
export type ConfigSource =
  | 'default'
  | 'managed'
  | 'user'
  | 'project'
  | 'local'
  | 'environment';

/**
 * Configuration value with source tracking
 */
export interface ConfigValue<T> {
  value: T;
  source: ConfigSource;
}

/**
 * Tracked configuration - each value knows where it came from
 */
export type TrackedConfig = {
  [K in keyof ClaudeConfig]: ConfigValue<ClaudeConfig[K]>;
};

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Configuration version for migration
 */
export interface ConfigVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Migration function type
 */
export type ConfigMigration = (config: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration definition
 */
export interface MigrationDefinition {
  fromVersion: ConfigVersion;
  toVersion: ConfigVersion;
  migrate: ConfigMigration;
  description: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
  suggestion?: string;
}

/**
 * Validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationError[];
  migratedConfig?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is a valid PermissionLevel
 */
export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return value === 'allow' || value === 'ask' || value === 'deny';
}

/**
 * Check if value is a valid HookEvent
 */
export function isHookEvent(value: unknown): value is HookEvent {
  return ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionStart', 'PromptSubmit'].includes(value as string);
}

/**
 * Check if value is a valid theme
 */
export function isTheme(value: unknown): value is 'dark' | 'light' | 'auto' {
  return value === 'dark' || value === 'light' || value === 'auto';
}

/**
 * Check if value is a valid verbosity level
 */
export function isVerbosity(value: unknown): value is ClaudeConfig['verbosity'] {
  return ['quiet', 'normal', 'verbose', 'debug'].includes(value as string);
}
