/**
 * Claude Code - Configuration Loader
 * Load và parse settings từ nhiều sources
 */

import { existsSync, readFileSync, statSync, realpathSync } from 'fs';
import { dirname, resolve } from 'path';
import type { Settings } from './schemas';
import { SettingsSchema, validateSettings } from './schemas';
import {
  type SettingsSource,
  getSettingsFilePath,
  getSettingsSourceDescription,
  getManagedSettingsPath,
  getLegacyManagedSettingsPath,
} from './paths';

// ============================================================================
// Types
// ============================================================================

/** Result của việc load settings */
export interface LoadSettingsResult {
  settings: Settings | null;
  errors: string[];
  filePath: string | null;
}

/** Cached settings entry */
interface CachedSettings {
  settings: Settings | null;
  errors: string[];
  mtime: number;
}

// ============================================================================
// Cache - LRU cache cho settings đã load
// ============================================================================

const settingsCache = new Map<string, CachedSettings>();
const fileMtimeCache = new Map<string, number>();

/**
 * Clear settings cache
 */
export function clearSettingsCache(): void {
  settingsCache.clear();
  fileMtimeCache.clear();
}

/**
 * Mark a settings file as modified (invalidate cache)
 */
export function invalidateSettingsCache(filePath: string): void {
  fileMtimeCache.set(filePath, Date.now());
}

// ============================================================================
// File Reading - Đọc file với xử lý symlinks
// ============================================================================

/**
 * Resolve symlink và get real path
 */
function resolveFilePath(filePath: string): { resolvedPath: string; isSymlink: boolean } {
  try {
    const stat = statSync(filePath, { throwIfNoEntry: false });
    if (!stat) {
      return { resolvedPath: filePath, isSymlink: false };
    }

    if (stat.isSymbolicLink()) {
      const realPath = realpathSync(filePath);
      return { resolvedPath: realPath, isSymlink: true };
    }

    return { resolvedPath: filePath, isSymlink: false };
  } catch {
    return { resolvedPath: filePath, isSymlink: false };
  }
}

/**
 * Read file content safely
 */
function readFileSafe(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// ============================================================================
// JSON Parsing - Parse JSON với JSONC support
// ============================================================================

/**
 * Strip comments from JSON string (JSONC support)
 */
function stripJsonComments(jsonString: string): string {
  let result = '';
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let i = 0;

  while (i < jsonString.length) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];

    // Handle string state
    if (char === '"' && !inSingleLineComment && !inMultiLineComment) {
      // Check for escaped quote
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
    }

    // Handle comments (only outside strings)
    if (!inString) {
      if (!inSingleLineComment && !inMultiLineComment && char === '/' && nextChar === '/') {
        inSingleLineComment = true;
        i += 2;
        continue;
      }

      if (!inSingleLineComment && !inMultiLineComment && char === '/' && nextChar === '*') {
        inMultiLineComment = true;
        i += 2;
        continue;
      }

      if (inSingleLineComment && (char === '\n' || char === '\r')) {
        inSingleLineComment = false;
        result += char;
        i++;
        continue;
      }

      if (inMultiLineComment && char === '*' && nextChar === '/') {
        inMultiLineComment = false;
        i += 2;
        continue;
      }
    }

    // Add character if not in a comment
    if (!inSingleLineComment && !inMultiLineComment) {
      result += char;
    }

    i++;
  }

  return result;
}

/**
 * Parse JSON với JSONC support và trailing comma handling
 */
export function parseJson(content: string, allowTrailingCommas: boolean = true): unknown {
  // Strip comments
  let stripped = stripJsonComments(content);

  // Handle trailing commas if allowed
  if (allowTrailingCommas) {
    // Remove trailing commas before ] or }
    stripped = stripped.replace(/,(\s*[}\]])/g, '$1');
  }

  return JSON.parse(stripped);
}

// ============================================================================
// Settings Loading - Load settings từ file
// ============================================================================

/**
 * Load và parse settings từ một file
 */
export function loadSettingsFile(filePath: string): LoadSettingsResult {
  // Check if file exists
  if (!existsSync(filePath)) {
    return {
      settings: null,
      errors: [],
      filePath: null,
    };
  }

  try {
    // Resolve symlinks
    const { resolvedPath } = resolveFilePath(filePath);

    // Read file
    const content = readFileSafe(resolvedPath);
    if (content === null) {
      return {
        settings: null,
        errors: [`Failed to read settings file: ${filePath}`],
        filePath,
      };
    }

    // Handle empty file
    if (content.trim() === '') {
      return {
        settings: {},
        errors: [],
        filePath,
      };
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = parseJson(content, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        settings: null,
        errors: [`Invalid JSON in ${filePath}: ${message}`],
        filePath,
      };
    }

    // Validate với Zod
    const result = validateSettings(parsed);
    if (result.success) {
      return {
        settings: result.data,
        errors: [],
        filePath,
      };
    }

    // Return validation errors
    return {
      settings: null,
      errors: result.errors.map(err => `${filePath}: ${err}`),
      filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      settings: null,
      errors: [`Error loading settings from ${filePath}: ${message}`],
      filePath,
    };
  }
}

/**
 * Load settings cho một source với caching
 */
export function loadSettings(source: SettingsSource, projectRoot?: string): LoadSettingsResult {
  const filePath = getSettingsFilePath(source, projectRoot);

  if (!filePath) {
    return {
      settings: null,
      errors: [],
      filePath: null,
    };
  }

  // Check cache
  const cached = settingsCache.get(filePath);
  if (cached) {
    try {
      const stat = statSync(filePath, { throwIfNoEntry: false });
      if (stat && stat.mtimeMs <= cached.mtime) {
        // Also check our manual invalidation timestamp
        const manualInvalidation = fileMtimeCache.get(filePath);
        if (!manualInvalidation || manualInvalidation <= cached.mtime) {
          return {
            settings: cached.settings,
            errors: cached.errors,
            filePath,
          };
        }
      }
    } catch {
      // File might have been deleted, reload
    }
  }

  // Load fresh
  const result = loadSettingsFile(filePath);

  // Update cache
  settingsCache.set(filePath, {
    settings: result.settings,
    errors: result.errors,
    mtime: Date.now(),
  });

  return result;
}

// ============================================================================
// Managed Settings - Load enterprise managed settings
// ============================================================================

let cachedManagedSettings: Settings | null = null;

/**
 * Load managed settings (enterprise)
 */
export function loadManagedSettings(): Settings | null {
  if (cachedManagedSettings !== null) {
    return cachedManagedSettings;
  }

  // Try primary path
  const primaryPath = getManagedSettingsPath();
  let result = loadSettingsFile(primaryPath);

  if (result.settings) {
    cachedManagedSettings = result.settings;
    return cachedManagedSettings;
  }

  // Try legacy path on Windows
  const legacyPath = getLegacyManagedSettingsPath();
  if (legacyPath) {
    result = loadSettingsFile(legacyPath);
    if (result.settings) {
      console.warn(
        `Warning: Using deprecated managed settings path: ${legacyPath}. ` +
        `Please migrate to: ${primaryPath}`
      );
      cachedManagedSettings = result.settings;
      return cachedManagedSettings;
    }
  }

  return null;
}

/**
 * Clear managed settings cache
 */
export function clearManagedSettingsCache(): void {
  cachedManagedSettings = null;
}

// ============================================================================
// Environment Variables - Load settings từ env
// ============================================================================

/** Environment variable prefix */
const ENV_PREFIX = 'CLAUDE_CODE_';

/** Mapping từ env var name sang settings key */
const ENV_MAPPINGS: Record<string, keyof Settings> = {
  'CLAUDE_CODE_MODEL': 'model',
  'CLAUDE_CODE_LANGUAGE': 'language',
  'CLAUDE_CODE_OUTPUT_STYLE': 'outputStyle',
  'CLAUDE_CODE_THINKING_ENABLED': 'alwaysThinkingEnabled',
  'CLAUDE_CODE_SYNTAX_HIGHLIGHTING_DISABLED': 'syntaxHighlightingDisabled',
  'CLAUDE_CODE_SPINNER_TIPS_ENABLED': 'spinnerTipsEnabled',
  'CLAUDE_CODE_PROMPT_SUGGESTION_ENABLED': 'promptSuggestionEnabled',
  'CLAUDE_CODE_REDUCED_MOTION': 'prefersReducedMotion',
  'CLAUDE_CODE_DISABLE_ALL_HOOKS': 'disableAllHooks',
  'CLAUDE_CODE_ENABLE_ALL_PROJECT_MCP_SERVERS': 'enableAllProjectMcpServers',
  'CLAUDE_CODE_SKIP_WEBFETCH_PREFLIGHT': 'skipWebFetchPreflight',
  'CLAUDE_CODE_CLEANUP_PERIOD_DAYS': 'cleanupPeriodDays',
  'CLAUDE_CODE_RESPECT_GITIGNORE': 'respectGitignore',
  'CLAUDE_CODE_AGENT': 'agent',
  'CLAUDE_CODE_AUTO_UPDATES_CHANNEL': 'autoUpdatesChannel',
  'CLAUDE_CODE_MINIMUM_VERSION': 'minimumVersion',
  'CLAUDE_CODE_PLANS_DIRECTORY': 'plansDirectory',
};

/** Boolean env vars */
const BOOLEAN_ENV_VARS = new Set([
  'CLAUDE_CODE_THINKING_ENABLED',
  'CLAUDE_CODE_SYNTAX_HIGHLIGHTING_DISABLED',
  'CLAUDE_CODE_SPINNER_TIPS_ENABLED',
  'CLAUDE_CODE_PROMPT_SUGGESTION_ENABLED',
  'CLAUDE_CODE_REDUCED_MOTION',
  'CLAUDE_CODE_DISABLE_ALL_HOOKS',
  'CLAUDE_CODE_ENABLE_ALL_PROJECT_MCP_SERVERS',
  'CLAUDE_CODE_SKIP_WEBFETCH_PREFLIGHT',
  'CLAUDE_CODE_RESPECT_GITIGNORE',
]);

/** Numeric env vars */
const NUMERIC_ENV_VARS = new Set([
  'CLAUDE_CODE_CLEANUP_PERIOD_DAYS',
]);

/**
 * Parse boolean từ string
 */
function parseBoolean(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/**
 * Load settings overrides từ environment variables
 */
export function loadEnvSettings(): Partial<Settings> {
  const settings: Partial<Settings> = {};

  for (const [envVar, settingsKey] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value === undefined) continue;

    if (BOOLEAN_ENV_VARS.has(envVar)) {
      (settings as any)[settingsKey] = parseBoolean(value);
    } else if (NUMERIC_ENV_VARS.has(envVar)) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        (settings as any)[settingsKey] = num;
      }
    } else if (envVar === 'CLAUDE_CODE_AUTO_UPDATES_CHANNEL') {
      if (value === 'latest' || value === 'stable') {
        settings.autoUpdatesChannel = value;
      }
    } else {
      (settings as any)[settingsKey] = value;
    }
  }

  return settings;
}

// ============================================================================
// Settings Source Management
// ============================================================================

/**
 * Check if a settings source is enabled
 */
export function isSettingsSourceEnabled(source: SettingsSource): boolean {
  // All sources are enabled by default
  // Could be extended to check feature flags or managed settings
  return true;
}

/**
 * Get all enabled settings sources
 */
export function getEnabledSettingsSources(): SettingsSource[] {
  const allSources: SettingsSource[] = [
    'managedSettings',
    'userSettings',
    'projectSettings',
    'localSettings',
  ];

  return allSources.filter(isSettingsSourceEnabled);
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Format validation errors cho display
 */
export function formatValidationErrors(errors: string[], filePath: string): string {
  if (errors.length === 0) return '';

  const header = `Settings validation errors in ${filePath}:`;
  const formattedErrors = errors.map(err => `  - ${err}`).join('\n');

  return `${header}\n${formattedErrors}`;
}

/**
 * Log settings loading error (không throw)
 */
export function logSettingsError(error: unknown, filePath: string): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error loading settings from ${filePath}: ${message}`);
}
