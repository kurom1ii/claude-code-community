/**
 * Claude Code - Configuration Validator
 * Validate configuration and provide helpful error messages
 */

import { z } from 'zod';
import type {
  ClaudeConfig,
  ProjectConfig,
  ConfigValidationError,
  ConfigValidationResult,
  PermissionLevel,
  HookEvent,
  MigrationDefinition,
  ConfigVersion,
} from './types';
import { isPermissionLevel, isHookEvent, isTheme, isVerbosity } from './types';
import { DEFAULT_CONFIG, DEFAULT_PROJECT_CONFIG } from './defaults';
import { AVAILABLE_MODELS, MODEL_ALIASES } from './index';

// ============================================================================
// Zod Schemas for New Config Types
// ============================================================================

/**
 * Permission level schema
 */
const PermissionLevelSchema = z.enum(['allow', 'ask', 'deny']);

/**
 * MCP Server config schema
 */
const MCPServerConfigSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().optional().default(true),
  timeout: z.number().positive().optional(),
  description: z.string().optional(),
});

/**
 * Hook config schema
 */
const HookConfigSchema = z.object({
  event: z.enum(['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionStart', 'PromptSubmit']),
  matcher: z.object({
    tool: z.string().optional(),
    toolInput: z.record(z.string()).optional(),
  }).optional(),
  command: z.string().min(1, 'Hook command is required'),
  timeout: z.number().positive().optional(),
  workingDirectory: z.string().optional(),
  enabled: z.boolean().optional().default(true),
});

/**
 * Sandbox config schema
 */
const SandboxConfigSchema = z.object({
  enabled: z.boolean().optional(),
  type: z.enum(['docker', 'firejail', 'none']).optional(),
  container: z.string().optional(),
  image: z.string().optional(),
}).optional();

/**
 * Complete ClaudeConfig schema
 */
const ClaudeConfigSchema = z.object({
  // API Settings
  apiKey: z.string().optional(),
  model: z.string(),
  maxTokens: z.number().positive().int(),
  contextLimit: z.number().positive().int(),

  // Behavior Settings
  confirmDangerousActions: z.boolean(),
  autoCompact: z.boolean(),
  compactThreshold: z.number().min(0).max(1),
  thinkingEnabled: z.boolean(),
  thinkingBudget: z.number().positive().int(),

  // Directory Settings
  allowedDirs: z.array(z.string()),
  blockedDirs: z.array(z.string()),
  additionalDirectories: z.array(z.string()),
  respectGitignore: z.boolean(),

  // Tool Settings
  enabledTools: z.array(z.string()),
  disabledTools: z.array(z.string()),
  toolPermissions: z.record(PermissionLevelSchema),
  defaultPermissionMode: PermissionLevelSchema,

  // UI Settings
  theme: z.enum(['dark', 'light', 'auto']),
  showTokenUsage: z.boolean(),
  showTimings: z.boolean(),
  verbosity: z.enum(['quiet', 'normal', 'verbose', 'debug']),
  syntaxHighlighting: z.boolean(),
  spinnerTipsEnabled: z.boolean(),
  promptSuggestionEnabled: z.boolean(),
  prefersReducedMotion: z.boolean(),

  // Session Settings
  sessionTimeout: z.number().nonnegative().int(),
  autoSaveInterval: z.number().positive().int(),
  maxHistoryLength: z.number().positive().int(),
  cleanupPeriodDays: z.number().nonnegative().int(),

  // MCP Settings
  mcpServers: z.array(MCPServerConfigSchema),
  enableAllProjectMcpServers: z.boolean(),
  mcpConnectionTimeout: z.number().positive().int(),
  mcpBatchSize: z.number().positive().int(),

  // Hooks
  hooks: z.array(HookConfigSchema),
  disableAllHooks: z.boolean(),

  // Sandbox
  sandbox: SandboxConfigSchema,

  // Language & Locale
  language: z.string().optional(),
  outputStyle: z.string().optional(),

  // Custom Settings
  custom: z.record(z.unknown()),
}).passthrough();

/**
 * Project config schema
 */
const ProjectConfigSchema = ClaudeConfigSchema.partial().extend({
  projectName: z.string().optional(),
  ignorePatterns: z.array(z.string()).optional(),
  customPrompt: z.string().optional(),
  env: z.record(z.string()).optional(),
  plansDirectory: z.string().optional(),
  attribution: z.object({
    commit: z.string().optional(),
    pr: z.string().optional(),
  }).optional(),
  fileSuggestion: z.object({
    type: z.literal('command'),
    command: z.string(),
  }).optional(),
}).passthrough();

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a ClaudeConfig object
 */
export function validateClaudeConfig(config: unknown): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: ConfigValidationError[] = [];

  // First, try Zod validation
  const zodResult = ClaudeConfigSchema.safeParse(config);

  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      const path = issue.path.join('.');
      errors.push({
        path,
        message: issue.message,
        value: getValueAtPath(config, issue.path),
        suggestion: getSuggestion(path, issue.code),
      });
    }
  }

  // Additional semantic validations
  if (typeof config === 'object' && config !== null) {
    const cfg = config as Partial<ClaudeConfig>;

    // Validate model exists
    if (cfg.model) {
      const modelExists = AVAILABLE_MODELS.some(m => m.id === cfg.model) ||
                         MODEL_ALIASES.some(a => a.alias === cfg.model);
      if (!modelExists) {
        warnings.push({
          path: 'model',
          message: `Unknown model: ${cfg.model}`,
          value: cfg.model,
          suggestion: `Valid models: ${AVAILABLE_MODELS.map(m => m.id).join(', ')}`,
        });
      }
    }

    // Validate compactThreshold is sensible
    if (cfg.compactThreshold !== undefined) {
      if (cfg.compactThreshold < 0.5) {
        warnings.push({
          path: 'compactThreshold',
          message: 'Compact threshold below 0.5 may cause excessive compaction',
          value: cfg.compactThreshold,
          suggestion: 'Consider a value between 0.7 and 0.9',
        });
      }
    }

    // Validate maxTokens vs contextLimit
    if (cfg.maxTokens && cfg.contextLimit) {
      if (cfg.maxTokens > cfg.contextLimit) {
        errors.push({
          path: 'maxTokens',
          message: 'maxTokens cannot exceed contextLimit',
          value: cfg.maxTokens,
          suggestion: `Set maxTokens to a value less than ${cfg.contextLimit}`,
        });
      }
    }

    // Validate thinkingBudget
    if (cfg.thinkingBudget && cfg.maxTokens) {
      if (cfg.thinkingBudget > cfg.maxTokens) {
        warnings.push({
          path: 'thinkingBudget',
          message: 'thinkingBudget exceeds maxTokens',
          value: cfg.thinkingBudget,
          suggestion: 'thinkingBudget should typically be less than maxTokens',
        });
      }
    }

    // Validate conflicting directory settings
    if (cfg.allowedDirs && cfg.blockedDirs) {
      const overlap = cfg.allowedDirs.filter(d => cfg.blockedDirs!.includes(d));
      if (overlap.length > 0) {
        errors.push({
          path: 'allowedDirs/blockedDirs',
          message: 'Directories cannot be both allowed and blocked',
          value: overlap,
          suggestion: 'Remove conflicting directories from one of the lists',
        });
      }
    }

    // Validate conflicting tool settings
    if (cfg.enabledTools && cfg.disabledTools) {
      const overlap = cfg.enabledTools.filter(t => cfg.disabledTools!.includes(t));
      if (overlap.length > 0) {
        errors.push({
          path: 'enabledTools/disabledTools',
          message: 'Tools cannot be both enabled and disabled',
          value: overlap,
          suggestion: 'Remove conflicting tools from one of the lists',
        });
      }
    }

    // Validate MCP server names are unique
    if (cfg.mcpServers) {
      const names = cfg.mcpServers.map(s => s.name);
      const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
      if (duplicates.length > 0) {
        errors.push({
          path: 'mcpServers',
          message: 'Duplicate MCP server names found',
          value: duplicates,
          suggestion: 'Each MCP server must have a unique name',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a ProjectConfig object
 */
export function validateProjectConfig(config: unknown): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: ConfigValidationError[] = [];

  const zodResult = ProjectConfigSchema.safeParse(config);

  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      const path = issue.path.join('.');
      errors.push({
        path,
        message: issue.message,
        value: getValueAtPath(config, issue.path),
        suggestion: getSuggestion(path, issue.code),
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and potentially migrate configuration
 */
export function validateAndMigrate(config: unknown): ConfigValidationResult {
  // Check if migration is needed
  const migratedConfig = migrateConfig(config);

  // Validate migrated config
  const result = validateClaudeConfig(migratedConfig);

  if (migratedConfig !== config) {
    result.migratedConfig = migratedConfig as Record<string, unknown>;
  }

  return result;
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Configuration migrations
 */
const MIGRATIONS: MigrationDefinition[] = [
  {
    fromVersion: { major: 1, minor: 0, patch: 0 },
    toVersion: { major: 2, minor: 0, patch: 0 },
    description: 'Migrate from v1 to v2 config format',
    migrate: (config) => {
      const migrated = { ...config };

      // Migrate old 'syntaxHighlightingDisabled' to 'syntaxHighlighting'
      if ('syntaxHighlightingDisabled' in migrated) {
        migrated.syntaxHighlighting = !(migrated.syntaxHighlightingDisabled as boolean);
        delete migrated.syntaxHighlightingDisabled;
      }

      // Migrate 'alwaysThinkingEnabled' to 'thinkingEnabled'
      if ('alwaysThinkingEnabled' in migrated) {
        migrated.thinkingEnabled = migrated.alwaysThinkingEnabled;
        delete migrated.alwaysThinkingEnabled;
      }

      // Migrate old permission format
      if ('permissions' in migrated && typeof migrated.permissions === 'object') {
        const perms = migrated.permissions as Record<string, unknown>;
        if ('allow' in perms && Array.isArray(perms.allow)) {
          migrated.toolPermissions = migrated.toolPermissions || {};
          for (const rule of perms.allow) {
            if (typeof rule === 'string') {
              const toolMatch = rule.match(/^(\w+)\(/);
              if (toolMatch) {
                (migrated.toolPermissions as Record<string, string>)[toolMatch[1]] = 'allow';
              }
            }
          }
        }
        if ('defaultMode' in perms) {
          migrated.defaultPermissionMode = perms.defaultMode;
        }
      }

      // Migrate old mcpServers format (object to array)
      if ('mcpServers' in migrated && typeof migrated.mcpServers === 'object' && !Array.isArray(migrated.mcpServers)) {
        const oldServers = migrated.mcpServers as Record<string, unknown>;
        migrated.mcpServers = Object.entries(oldServers).map(([name, serverConfig]) => ({
          name,
          ...(serverConfig as object),
        }));
      }

      // Migrate old hooks format
      if ('hooks' in migrated && typeof migrated.hooks === 'object' && !Array.isArray(migrated.hooks)) {
        const oldHooks = migrated.hooks as Record<string, unknown>;
        const newHooks: unknown[] = [];

        for (const [event, entries] of Object.entries(oldHooks)) {
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              if (typeof entry === 'object' && entry !== null) {
                const entryObj = entry as Record<string, unknown>;
                if ('hooks' in entryObj && Array.isArray(entryObj.hooks)) {
                  for (const hook of entryObj.hooks) {
                    newHooks.push({
                      event,
                      matcher: entryObj.matcher,
                      ...hook,
                    });
                  }
                }
              }
            }
          }
        }

        migrated.hooks = newHooks;
      }

      return migrated;
    },
  },
];

/**
 * Detect config version
 */
function detectVersion(config: unknown): ConfigVersion {
  if (typeof config !== 'object' || config === null) {
    return { major: 1, minor: 0, patch: 0 };
  }

  const cfg = config as Record<string, unknown>;

  // Check for v2 indicators
  if (
    Array.isArray(cfg.mcpServers) ||
    'syntaxHighlighting' in cfg ||
    'thinkingEnabled' in cfg
  ) {
    return { major: 2, minor: 0, patch: 0 };
  }

  // Default to v1
  return { major: 1, minor: 0, patch: 0 };
}

/**
 * Migrate config to latest version
 */
export function migrateConfig(config: unknown): unknown {
  if (typeof config !== 'object' || config === null) {
    return config;
  }

  const currentVersion = detectVersion(config);
  let result = { ...config as object };

  // Apply migrations in order
  for (const migration of MIGRATIONS) {
    if (compareVersions(currentVersion, migration.fromVersion) <= 0) {
      result = migration.migrate(result as Record<string, unknown>);
    }
  }

  return result;
}

/**
 * Compare version numbers
 */
function compareVersions(a: ConfigVersion, b: ConfigVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get value at path in object
 */
function getValueAtPath(obj: unknown, path: (string | number)[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/**
 * Get suggestion for a validation error
 */
function getSuggestion(path: string, code: string): string | undefined {
  const suggestions: Record<string, Record<string, string>> = {
    model: {
      invalid_type: 'Model should be a string like "claude-sonnet-4-5-20250929" or an alias like "sonnet"',
    },
    maxTokens: {
      invalid_type: 'maxTokens should be a positive integer',
      too_small: 'maxTokens should be at least 1',
    },
    theme: {
      invalid_enum_value: 'Theme must be one of: "dark", "light", or "auto"',
    },
    verbosity: {
      invalid_enum_value: 'Verbosity must be one of: "quiet", "normal", "verbose", or "debug"',
    },
    compactThreshold: {
      too_small: 'compactThreshold must be between 0 and 1',
      too_big: 'compactThreshold must be between 0 and 1',
    },
  };

  return suggestions[path]?.[code];
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ConfigValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('Configuration Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error.path}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`    Suggestion: ${error.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Configuration Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning.path}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`    Suggestion: ${warning.suggestion}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Quick check if config is valid (no detailed errors)
 */
export function isValidConfig(config: unknown): config is ClaudeConfig {
  return validateClaudeConfig(config).valid;
}

/**
 * Quick check if project config is valid
 */
export function isValidProjectConfig(config: unknown): config is ProjectConfig {
  return validateProjectConfig(config).valid;
}
