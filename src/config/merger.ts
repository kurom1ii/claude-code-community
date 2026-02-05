/**
 * Claude Code - Configuration Merger
 * Deep merge và resolve conflicts giữa settings từ nhiều sources
 */

import type { Settings, Permissions, Hooks, HookEntry } from './schemas';
import type { SettingsSource } from './paths';
import {
  loadSettings,
  loadManagedSettings,
  loadEnvSettings,
  type LoadSettingsResult,
} from './loader';
import { getSettingsSourceOrder, getSettingsSourceDescription } from './paths';

// ============================================================================
// Types
// ============================================================================

/** Merged settings result */
export interface MergedSettingsResult {
  settings: Settings;
  errors: string[];
  sources: SettingsSource[];
}

/** Settings với metadata về source */
export interface SettingsWithSource {
  settings: Settings;
  source: SettingsSource;
  filePath: string | null;
}

// ============================================================================
// Deep Merge Utilities
// ============================================================================

/**
 * Check if value is a plain object (not array, null, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep clone an object
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

/**
 * Deep merge hai objects
 * Later object overwrites earlier for scalar values
 * Arrays are replaced (not concatenated)
 * Objects are recursively merged
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = deepClone(target);

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

    const sourceValue = source[key];
    const targetValue = result[key];

    if (sourceValue === undefined) {
      // Explicitly undefined means "remove this key"
      continue;
    }

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      // Recursively merge objects
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else {
      // Replace value (including arrays)
      (result as Record<string, unknown>)[key] = deepClone(sourceValue);
    }
  }

  return result;
}

// ============================================================================
// Permissions Merging - Merge permissions với special handling
// ============================================================================

/**
 * Merge permission rules
 * Allow và deny lists được concatenated và deduplicated
 */
function mergePermissions(base: Permissions | undefined, overlay: Permissions | undefined): Permissions | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return deepClone(overlay);
  if (!overlay) return deepClone(base);

  const result: Permissions = { ...deepClone(base) };

  // Merge allow rules
  if (overlay.allow) {
    const baseAllow = result.allow || [];
    const merged = [...baseAllow, ...overlay.allow];
    result.allow = [...new Set(merged)]; // Deduplicate
  }

  // Merge deny rules
  if (overlay.deny) {
    const baseDeny = result.deny || [];
    const merged = [...baseDeny, ...overlay.deny];
    result.deny = [...new Set(merged)];
  }

  // Merge ask rules
  if (overlay.ask) {
    const baseAsk = result.ask || [];
    const merged = [...baseAsk, ...overlay.ask];
    result.ask = [...new Set(merged)];
  }

  // Override other fields
  if (overlay.defaultMode !== undefined) {
    result.defaultMode = overlay.defaultMode;
  }

  if (overlay.disableBypassPermissionsMode !== undefined) {
    result.disableBypassPermissionsMode = overlay.disableBypassPermissionsMode;
  }

  if (overlay.additionalDirectories) {
    const baseDirs = result.additionalDirectories || [];
    const merged = [...baseDirs, ...overlay.additionalDirectories];
    result.additionalDirectories = [...new Set(merged)];
  }

  return result;
}

// ============================================================================
// Hooks Merging - Merge hooks với concatenation
// ============================================================================

/**
 * Merge hook entries
 */
function mergeHookEntries(base: HookEntry[] | undefined, overlay: HookEntry[] | undefined): HookEntry[] | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return deepClone(overlay);
  if (!overlay) return deepClone(base);

  // Concatenate hooks - later hooks run after earlier ones
  return [...deepClone(base), ...deepClone(overlay)];
}

/**
 * Merge hooks config
 */
function mergeHooks(base: Hooks | undefined, overlay: Hooks | undefined): Hooks | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return deepClone(overlay);
  if (!overlay) return deepClone(base);

  const result: Hooks = {};

  // Merge each hook type
  result.PreToolUse = mergeHookEntries(base.PreToolUse, overlay.PreToolUse);
  result.PostToolUse = mergeHookEntries(base.PostToolUse, overlay.PostToolUse);
  result.Notification = mergeHookEntries(base.Notification, overlay.Notification);
  result.Stop = mergeHookEntries(base.Stop, overlay.Stop);
  result.SessionStart = mergeHookEntries(base.SessionStart, overlay.SessionStart);
  result.PromptSubmit = mergeHookEntries(base.PromptSubmit, overlay.PromptSubmit);

  return result;
}

// ============================================================================
// MCP Servers Merging
// ============================================================================

/**
 * Merge MCP server configs
 * Later configs override earlier for the same server name
 */
function mergeMcpServers(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return deepClone(overlay);
  if (!overlay) return deepClone(base);

  return deepMerge(base, overlay);
}

// ============================================================================
// Environment Variables Merging
// ============================================================================

/**
 * Merge env variables
 * Later values override earlier
 */
function mergeEnvVars(
  base: Record<string, string> | undefined,
  overlay: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return { ...overlay };
  if (!overlay) return { ...base };

  return { ...base, ...overlay };
}

// ============================================================================
// Settings Merging - Main merge logic
// ============================================================================

/**
 * Merge hai settings objects với special handling cho một số fields
 */
export function mergeSettings(base: Settings, overlay: Settings): Settings {
  // Start with deep merge
  const result = deepMerge(base as Record<string, unknown>, overlay as Record<string, unknown>) as Settings;

  // Apply special merging for specific fields
  result.permissions = mergePermissions(base.permissions, overlay.permissions);
  result.hooks = mergeHooks(base.hooks, overlay.hooks);
  result.mcpServers = mergeMcpServers(
    base.mcpServers as Record<string, unknown> | undefined,
    overlay.mcpServers as Record<string, unknown> | undefined
  ) as Settings['mcpServers'];
  result.env = mergeEnvVars(base.env, overlay.env);

  // Merge plugin configs
  if (base.enabledPlugins || overlay.enabledPlugins) {
    result.enabledPlugins = { ...base.enabledPlugins, ...overlay.enabledPlugins };
  }

  if (base.pluginConfigs || overlay.pluginConfigs) {
    result.pluginConfigs = deepMerge(
      (base.pluginConfigs || {}) as Record<string, unknown>,
      (overlay.pluginConfigs || {}) as Record<string, unknown>
    ) as Settings['pluginConfigs'];
  }

  if (base.extraKnownMarketplaces || overlay.extraKnownMarketplaces) {
    result.extraKnownMarketplaces = { ...base.extraKnownMarketplaces, ...overlay.extraKnownMarketplaces };
  }

  // Merge arrays by concatenation for some fields
  if (base.skippedMarketplaces || overlay.skippedMarketplaces) {
    const merged = [...(base.skippedMarketplaces || []), ...(overlay.skippedMarketplaces || [])];
    result.skippedMarketplaces = [...new Set(merged)];
  }

  if (base.skippedPlugins || overlay.skippedPlugins) {
    const merged = [...(base.skippedPlugins || []), ...(overlay.skippedPlugins || [])];
    result.skippedPlugins = [...new Set(merged)];
  }

  return result;
}

// ============================================================================
// Managed Settings Restrictions
// ============================================================================

/**
 * Apply managed settings restrictions
 * Some managed settings cannot be overridden by user/project settings
 */
function applyManagedRestrictions(settings: Settings, managed: Settings): Settings {
  const result = { ...settings };

  // Enterprise blocklists cannot be overridden
  if (managed.strictKnownMarketplaces) {
    result.strictKnownMarketplaces = managed.strictKnownMarketplaces;
  }

  if (managed.blockedMarketplaces) {
    result.blockedMarketplaces = managed.blockedMarketplaces;
  }

  if (managed.deniedMcpServers) {
    result.deniedMcpServers = managed.deniedMcpServers;
  }

  if (managed.allowedMcpServers) {
    // Allowlist from managed settings takes precedence
    result.allowedMcpServers = managed.allowedMcpServers;
  }

  // If managed settings say only managed hooks can run
  if (managed.allowManagedHooksOnly) {
    result.hooks = managed.hooks;
    result.allowManagedHooksOnly = true;
  }

  // If managed settings say only managed permissions can apply
  if (managed.allowManagedPermissionRulesOnly) {
    result.permissions = managed.permissions;
    result.allowManagedPermissionRulesOnly = true;
  }

  // Disable all hooks if managed says so
  if (managed.disableAllHooks) {
    result.disableAllHooks = true;
    result.hooks = undefined;
  }

  // Company announcements always come from managed
  if (managed.companyAnnouncements) {
    result.companyAnnouncements = managed.companyAnnouncements;
  }

  return result;
}

// ============================================================================
// Main Merge Function - Load và merge all settings
// ============================================================================

/**
 * Load và merge tất cả settings từ tất cả sources
 */
export function loadAndMergeSettings(projectRoot?: string): MergedSettingsResult {
  const errors: string[] = [];
  const sources: SettingsSource[] = [];
  let mergedSettings: Settings = {};

  // 1. Load managed settings first (enterprise)
  const managedSettings = loadManagedSettings();
  if (managedSettings) {
    mergedSettings = mergeSettings(mergedSettings, managedSettings);
    sources.push('managedSettings');
  }

  // 2. Load user settings
  const userResult = loadSettings('userSettings');
  if (userResult.errors.length > 0) {
    errors.push(...userResult.errors);
  }
  if (userResult.settings) {
    mergedSettings = mergeSettings(mergedSettings, userResult.settings);
    sources.push('userSettings');
  }

  // 3. Load project settings (if project root provided)
  if (projectRoot) {
    const projectResult = loadSettings('projectSettings', projectRoot);
    if (projectResult.errors.length > 0) {
      errors.push(...projectResult.errors);
    }
    if (projectResult.settings) {
      mergedSettings = mergeSettings(mergedSettings, projectResult.settings);
      sources.push('projectSettings');
    }

    // 4. Load local settings
    const localResult = loadSettings('localSettings', projectRoot);
    if (localResult.errors.length > 0) {
      errors.push(...localResult.errors);
    }
    if (localResult.settings) {
      mergedSettings = mergeSettings(mergedSettings, localResult.settings);
      sources.push('localSettings');
    }
  }

  // 5. Apply environment variable overrides
  const envSettings = loadEnvSettings();
  if (Object.keys(envSettings).length > 0) {
    mergedSettings = mergeSettings(mergedSettings, envSettings as Settings);
  }

  // 6. Apply managed restrictions (these cannot be overridden)
  if (managedSettings) {
    mergedSettings = applyManagedRestrictions(mergedSettings, managedSettings);
  }

  return {
    settings: mergedSettings,
    errors,
    sources,
  };
}

// ============================================================================
// Get Individual Setting Value
// ============================================================================

/**
 * Get a single setting value với source tracking
 */
export function getSettingValue<K extends keyof Settings>(
  key: K,
  projectRoot?: string
): { value: Settings[K] | undefined; source: SettingsSource | 'env' | null } {
  // Check env first (highest priority for supported settings)
  const envSettings = loadEnvSettings();
  if (key in envSettings && envSettings[key as keyof typeof envSettings] !== undefined) {
    return {
      value: envSettings[key as keyof typeof envSettings] as Settings[K],
      source: 'env',
    };
  }

  // Check in reverse order (local -> project -> user -> managed)
  const sourcesToCheck: SettingsSource[] = ['localSettings', 'projectSettings', 'userSettings', 'managedSettings'];

  for (const source of sourcesToCheck) {
    if ((source === 'localSettings' || source === 'projectSettings') && !projectRoot) {
      continue;
    }

    const result = loadSettings(source, projectRoot);
    if (result.settings && key in result.settings && result.settings[key] !== undefined) {
      return {
        value: result.settings[key],
        source,
      };
    }
  }

  return { value: undefined, source: null };
}

// ============================================================================
// Check Setting Defined
// ============================================================================

/**
 * Check if a setting is defined in any source
 */
export function isSettingDefined(key: keyof Settings, projectRoot?: string): boolean {
  const { source } = getSettingValue(key, projectRoot);
  return source !== null;
}
