/**
 * Claude Code - Default Configuration
 * Sensible default values for all configuration options
 */

import type { Settings } from './schemas';
import type { ClaudeConfig, ProjectConfig } from './types';
import { DEFAULT_MODEL, DEFAULT_CONTEXT_LIMIT, DEFAULT_MAX_TOKENS } from './index';

// ============================================================================
// Legacy Default Settings (backward compatibility)
// ============================================================================

/**
 * Default settings khi không có config nào
 * @deprecated Use DEFAULT_CONFIG instead for new code
 */
export const DEFAULT_SETTINGS: Partial<Settings> = {
  // Model defaults
  model: undefined, // Will use DEFAULT_MODEL from index.ts

  // Permissions defaults
  permissions: {
    defaultMode: 'ask',
  },

  // UI defaults
  spinnerTipsEnabled: true,
  syntaxHighlightingDisabled: false,
  promptSuggestionEnabled: true,
  prefersReducedMotion: false,

  // Behavior defaults
  alwaysThinkingEnabled: true,
  respectGitignore: true,

  // Hooks
  disableAllHooks: false,
  allowManagedHooksOnly: false,
  allowManagedPermissionRulesOnly: false,

  // MCP
  enableAllProjectMcpServers: false,

  // Other
  skipWebFetchPreflight: false,
};

// ============================================================================
// Default Configuration (New Enhanced Config)
// ============================================================================

/**
 * Default configuration with sensible values for all options
 */
export const DEFAULT_CONFIG: ClaudeConfig = {
  // ========== API Settings ==========

  /**
   * API key is not set by default - must be provided via environment or config
   */
  apiKey: undefined,

  /**
   * Use the latest Sonnet model by default for good balance of speed/quality
   */
  model: DEFAULT_MODEL,

  /**
   * Default max tokens for output
   */
  maxTokens: DEFAULT_MAX_TOKENS,

  /**
   * Default context window limit (200k tokens)
   */
  contextLimit: DEFAULT_CONTEXT_LIMIT,

  // ========== Behavior Settings ==========

  /**
   * Always confirm dangerous actions like file deletion, git push, etc.
   */
  confirmDangerousActions: true,

  /**
   * Automatically compact conversation when approaching context limit
   */
  autoCompact: true,

  /**
   * Start compaction when reaching 80% of context limit
   */
  compactThreshold: 0.8,

  /**
   * Enable extended thinking by default for better reasoning
   */
  thinkingEnabled: true,

  /**
   * Budget 10000 tokens for thinking
   */
  thinkingBudget: 10000,

  // ========== Directory Settings ==========

  /**
   * Only allow access to current working directory by default
   */
  allowedDirs: [],

  /**
   * No directories blocked by default
   */
  blockedDirs: [],

  /**
   * No additional directories by default
   */
  additionalDirectories: [],

  /**
   * Respect .gitignore files for file operations
   */
  respectGitignore: true,

  // ========== Tool Settings ==========

  /**
   * All tools enabled by default
   */
  enabledTools: [],

  /**
   * No tools disabled by default
   */
  disabledTools: [],

  /**
   * No specific tool permissions by default
   */
  toolPermissions: {},

  /**
   * Ask for confirmation by default for tool usage
   */
  defaultPermissionMode: 'ask',

  // ========== UI Settings ==========

  /**
   * Dark theme by default
   */
  theme: 'dark',

  /**
   * Show token usage to help users understand costs
   */
  showTokenUsage: true,

  /**
   * Don't show timing info by default
   */
  showTimings: false,

  /**
   * Normal verbosity level
   */
  verbosity: 'normal',

  /**
   * Enable syntax highlighting for better code readability
   */
  syntaxHighlighting: true,

  /**
   * Show spinner tips for educational value
   */
  spinnerTipsEnabled: true,

  /**
   * Enable prompt suggestions for discoverability
   */
  promptSuggestionEnabled: true,

  /**
   * Don't reduce motion by default
   */
  prefersReducedMotion: false,

  // ========== Session Settings ==========

  /**
   * No session timeout by default
   */
  sessionTimeout: 0,

  /**
   * Auto-save every 60 seconds
   */
  autoSaveInterval: 60000,

  /**
   * Keep up to 1000 messages in history
   */
  maxHistoryLength: 1000,

  /**
   * Clean up sessions older than 30 days
   */
  cleanupPeriodDays: 30,

  // ========== MCP Settings ==========

  /**
   * No MCP servers configured by default
   */
  mcpServers: [],

  /**
   * Don't auto-enable project MCP servers for security
   */
  enableAllProjectMcpServers: false,

  /**
   * 30 second timeout for MCP connections
   */
  mcpConnectionTimeout: 30000,

  /**
   * Connect to 3 MCP servers at a time
   */
  mcpBatchSize: 3,

  // ========== Hooks ==========

  /**
   * No hooks configured by default
   */
  hooks: [],

  /**
   * Hooks enabled by default
   */
  disableAllHooks: false,

  // ========== Sandbox Settings ==========

  /**
   * No sandbox by default
   */
  sandbox: undefined,

  // ========== Language & Locale ==========

  /**
   * No specific language preference
   */
  language: undefined,

  /**
   * No specific output style
   */
  outputStyle: undefined,

  // ========== Custom Settings ==========

  /**
   * No custom settings by default
   */
  custom: {},
};

/**
 * Default project configuration
 */
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  projectName: undefined,
  ignorePatterns: [],
  customPrompt: undefined,
  env: {},
  plansDirectory: undefined,
  attribution: {
    commit: 'Co-Authored-By: Claude <noreply@anthropic.com>',
    pr: '🤖 Generated with Claude Code',
  },
  fileSuggestion: undefined,
};

// ============================================================================
// Configuration Presets
// ============================================================================

/**
 * Minimal configuration for quick/simple tasks
 */
export const MINIMAL_CONFIG: Partial<ClaudeConfig> = {
  thinkingEnabled: false,
  autoCompact: false,
  showTokenUsage: false,
  spinnerTipsEnabled: false,
  verbosity: 'quiet',
};

/**
 * Maximum security configuration
 */
export const SECURE_CONFIG: Partial<ClaudeConfig> = {
  confirmDangerousActions: true,
  defaultPermissionMode: 'ask',
  enableAllProjectMcpServers: false,
  disableAllHooks: true,
  sandbox: {
    enabled: true,
    type: 'docker',
  },
};

/**
 * Development configuration with verbose output
 */
export const DEV_CONFIG: Partial<ClaudeConfig> = {
  verbosity: 'debug',
  showTokenUsage: true,
  showTimings: true,
  thinkingEnabled: true,
  spinnerTipsEnabled: true,
};

/**
 * Performance-optimized configuration
 */
export const PERFORMANCE_CONFIG: Partial<ClaudeConfig> = {
  model: 'claude-3-5-haiku-20241022',
  thinkingEnabled: false,
  autoCompact: true,
  compactThreshold: 0.7,
  maxTokens: 4096,
};

// ============================================================================
// Environment Variable Defaults
// ============================================================================

/**
 * Default values that can be overridden by environment variables
 */
export const ENV_DEFAULTS: Record<string, { key: keyof ClaudeConfig; envVar: string; type: 'string' | 'number' | 'boolean' }> = {
  model: { key: 'model', envVar: 'CLAUDE_CODE_MODEL', type: 'string' },
  maxTokens: { key: 'maxTokens', envVar: 'CLAUDE_MAX_TOKENS', type: 'number' },
  contextLimit: { key: 'contextLimit', envVar: 'CLAUDE_CODE_CONTEXT_LIMIT', type: 'number' },
  thinkingEnabled: { key: 'thinkingEnabled', envVar: 'CLAUDE_CODE_THINKING_ENABLED', type: 'boolean' },
  verbosity: { key: 'verbosity', envVar: 'CLAUDE_CODE_VERBOSITY', type: 'string' },
  theme: { key: 'theme', envVar: 'CLAUDE_CODE_THEME', type: 'string' },
  respectGitignore: { key: 'respectGitignore', envVar: 'CLAUDE_CODE_RESPECT_GITIGNORE', type: 'boolean' },
  disableAllHooks: { key: 'disableAllHooks', envVar: 'CLAUDE_CODE_DISABLE_ALL_HOOKS', type: 'boolean' },
  enableAllProjectMcpServers: { key: 'enableAllProjectMcpServers', envVar: 'CLAUDE_CODE_ENABLE_ALL_PROJECT_MCP_SERVERS', type: 'boolean' },
  cleanupPeriodDays: { key: 'cleanupPeriodDays', envVar: 'CLAUDE_CODE_CLEANUP_PERIOD_DAYS', type: 'number' },
  syntaxHighlighting: { key: 'syntaxHighlighting', envVar: 'CLAUDE_CODE_SYNTAX_HIGHLIGHTING', type: 'boolean' },
  spinnerTipsEnabled: { key: 'spinnerTipsEnabled', envVar: 'CLAUDE_CODE_SPINNER_TIPS_ENABLED', type: 'boolean' },
  promptSuggestionEnabled: { key: 'promptSuggestionEnabled', envVar: 'CLAUDE_CODE_PROMPT_SUGGESTION_ENABLED', type: 'boolean' },
  prefersReducedMotion: { key: 'prefersReducedMotion', envVar: 'CLAUDE_CODE_REDUCED_MOTION', type: 'boolean' },
};

// ============================================================================
// Default Value Accessors (Legacy - backward compatibility)
// ============================================================================

/**
 * Get default value for a setting
 * @deprecated Use DEFAULT_CONFIG instead
 */
export function getDefaultValue<K extends keyof Settings>(key: K): Settings[K] | undefined {
  return DEFAULT_SETTINGS[key] as Settings[K] | undefined;
}

/**
 * Apply default values to settings
 * @deprecated Use withDefaults instead
 */
export function applyDefaults(settings: Settings): Settings {
  const result = { ...settings };

  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (result[key as keyof Settings] === undefined && defaultValue !== undefined) {
      (result as any)[key] = defaultValue;
    }
  }

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a deep copy of the default configuration
 */
export function getDefaultConfig(): ClaudeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/**
 * Get a deep copy of the default project configuration
 */
export function getDefaultProjectConfig(): ProjectConfig {
  return JSON.parse(JSON.stringify(DEFAULT_PROJECT_CONFIG));
}

/**
 * Merge partial config with defaults
 */
export function withDefaults(partial: Partial<ClaudeConfig>): ClaudeConfig {
  const defaults = getDefaultConfig();
  return {
    ...defaults,
    ...partial,
    // Deep merge objects
    toolPermissions: { ...defaults.toolPermissions, ...partial.toolPermissions },
    custom: { ...defaults.custom, ...partial.custom },
    sandbox: partial.sandbox ? { ...defaults.sandbox, ...partial.sandbox } : defaults.sandbox,
  };
}

/**
 * Apply a preset to the default configuration
 */
export function applyPreset(preset: Partial<ClaudeConfig>): ClaudeConfig {
  return withDefaults(preset);
}

// ============================================================================
// Thinking Verbs - Các động từ hiển thị khi thinking
// ============================================================================

export const DEFAULT_THINKING_VERBS = [
  'Thinking',
  'Pondering',
  'Considering',
  'Analyzing',
  'Processing',
  'Evaluating',
  'Reflecting',
  'Reasoning',
  'Contemplating',
  'Deliberating',
];

/**
 * Get thinking verbs (with custom verbs support)
 */
export function getThinkingVerbs(spinnerVerbs?: Settings['spinnerVerbs']): string[] {
  if (!spinnerVerbs) {
    return DEFAULT_THINKING_VERBS;
  }

  if (spinnerVerbs.mode === 'replace') {
    return spinnerVerbs.verbs;
  }

  // mode === 'append'
  return [...DEFAULT_THINKING_VERBS, ...spinnerVerbs.verbs];
}

/**
 * Get random thinking verb
 */
export function getRandomThinkingVerb(spinnerVerbs?: Settings['spinnerVerbs']): string {
  const verbs = getThinkingVerbs(spinnerVerbs);
  return verbs[Math.floor(Math.random() * verbs.length)];
}
