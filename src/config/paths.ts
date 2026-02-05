/**
 * Claude Code - Configuration Paths
 * Quản lý đường dẫn config files
 */

import { homedir, platform, tmpdir } from 'os';
import { join, basename } from 'path';

// ============================================================================
// Types - Kiểu dữ liệu
// ============================================================================

/** Settings source type */
export type SettingsSource =
  | 'managedSettings'    // Enterprise managed settings
  | 'userSettings'       // User settings (~/.claude/settings.json)
  | 'projectSettings'    // Project settings (.claude/settings.json)
  | 'localSettings'      // Local settings (.claude/settings.local.json)
  | 'policySettings'     // Remote policy settings
  | 'flagSettings';      // Feature flag settings

/** App directories structure */
export interface AppDirectories {
  data: string;
  config: string;
  cache: string;
  log: string;
  temp: string;
}

// ============================================================================
// Constants - Hằng số
// ============================================================================

const APP_NAME = 'claude';

// ============================================================================
// Platform-specific Paths - Đường dẫn theo platform
// ============================================================================

/**
 * Get app directories for macOS
 */
function getDarwinPaths(appName: string): AppDirectories {
  const home = homedir();
  const library = join(home, 'Library');

  return {
    data: join(library, 'Application Support', appName),
    config: join(library, 'Preferences', appName),
    cache: join(library, 'Caches', appName),
    log: join(library, 'Logs', appName),
    temp: join(tmpdir(), appName),
  };
}

/**
 * Get app directories for Windows
 */
function getWindowsPaths(appName: string): AppDirectories {
  const home = homedir();
  const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');

  return {
    data: join(localAppData, appName, 'Data'),
    config: join(appData, appName, 'Config'),
    cache: join(localAppData, appName, 'Cache'),
    log: join(localAppData, appName, 'Log'),
    temp: join(tmpdir(), appName),
  };
}

/**
 * Get app directories for Linux (XDG Base Directory Specification)
 */
function getLinuxPaths(appName: string): AppDirectories {
  const home = homedir();
  const username = basename(home);

  return {
    data: join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), appName),
    config: join(process.env.XDG_CONFIG_HOME || join(home, '.config'), appName),
    cache: join(process.env.XDG_CACHE_HOME || join(home, '.cache'), appName),
    log: join(process.env.XDG_STATE_HOME || join(home, '.local', 'state'), appName),
    temp: join(tmpdir(), username, appName),
  };
}

/**
 * Get app directories based on platform
 */
export function getAppDirectories(appName: string = APP_NAME): AppDirectories {
  switch (platform()) {
    case 'darwin':
      return getDarwinPaths(appName);
    case 'win32':
      return getWindowsPaths(appName);
    default:
      return getLinuxPaths(appName);
  }
}

// ============================================================================
// Claude Config Paths - Đường dẫn config cho Claude
// ============================================================================

/** Home directory */
export const HOME_DIR = homedir();

/** Claude config directory (~/.claude) */
export const CLAUDE_CONFIG_DIR = join(HOME_DIR, '.claude');

/** User settings file (~/.claude/settings.json) */
export const USER_SETTINGS_FILE = join(CLAUDE_CONFIG_DIR, 'settings.json');

/** Sessions directory */
export const SESSIONS_DIR = join(CLAUDE_CONFIG_DIR, 'sessions');

/** Projects directory */
export const PROJECTS_DIR = join(CLAUDE_CONFIG_DIR, 'projects');

/** Plugins directory */
export const PLUGINS_DIR = join(CLAUDE_CONFIG_DIR, 'plugins');

/** Plans directory */
export const PLANS_DIR = join(CLAUDE_CONFIG_DIR, 'plans');

/** Teams directory */
export const TEAMS_DIR = join(CLAUDE_CONFIG_DIR, 'teams');

/** Tasks directory */
export const TASKS_DIR = join(CLAUDE_CONFIG_DIR, 'tasks');

/** Installed plugins manifest */
export const INSTALLED_PLUGINS_FILE = join(CLAUDE_CONFIG_DIR, 'installed_plugins.json');

/** Credentials file */
export const CREDENTIALS_FILE = join(CLAUDE_CONFIG_DIR, 'credentials.json');

// ============================================================================
// Project Config Paths - Đường dẫn config cho project
// ============================================================================

/** Project settings file name */
export const PROJECT_SETTINGS_FILENAME = 'settings.json';

/** Project local settings file name */
export const PROJECT_LOCAL_SETTINGS_FILENAME = 'settings.local.json';

/** Project config directory name */
export const PROJECT_CONFIG_DIRNAME = '.claude';

/**
 * Get project settings file path
 */
export function getProjectSettingsPath(projectRoot: string): string {
  return join(projectRoot, PROJECT_CONFIG_DIRNAME, PROJECT_SETTINGS_FILENAME);
}

/**
 * Get project local settings file path
 */
export function getProjectLocalSettingsPath(projectRoot: string): string {
  return join(projectRoot, PROJECT_CONFIG_DIRNAME, PROJECT_LOCAL_SETTINGS_FILENAME);
}

/**
 * Get project config directory
 */
export function getProjectConfigDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_CONFIG_DIRNAME);
}

// ============================================================================
// Managed Settings Paths - Đường dẫn cho enterprise managed settings
// ============================================================================

/** Managed settings filename */
const MANAGED_SETTINGS_FILENAME = 'managed-settings.json';

/** Managed MCP filename */
const MANAGED_MCP_FILENAME = 'managed-mcp.json';

/**
 * Get managed settings path based on platform
 */
export function getManagedSettingsPath(): string {
  if (platform() === 'win32') {
    return join('C:', 'Program Files', 'ClaudeCode', MANAGED_SETTINGS_FILENAME);
  }

  // Linux/macOS: /etc/claude/managed-settings.json
  return join('/etc', 'claude', MANAGED_SETTINGS_FILENAME);
}

/**
 * Get legacy managed settings path for Windows
 */
export function getLegacyManagedSettingsPath(): string | null {
  if (platform() === 'win32') {
    return join('C:', 'ProgramData', 'ClaudeCode', MANAGED_SETTINGS_FILENAME);
  }
  return null;
}

/**
 * Get managed MCP path
 */
export function getManagedMCPPath(): string {
  if (platform() === 'win32') {
    return join('C:', 'Program Files', 'ClaudeCode', MANAGED_MCP_FILENAME);
  }

  return join('/etc', 'claude', MANAGED_MCP_FILENAME);
}

// ============================================================================
// Settings File Path Resolution
// ============================================================================

/**
 * Get settings file path for a source
 */
export function getSettingsFilePath(source: SettingsSource, projectRoot?: string): string | null {
  switch (source) {
    case 'managedSettings':
      return getManagedSettingsPath();

    case 'userSettings':
      return USER_SETTINGS_FILE;

    case 'projectSettings':
      if (!projectRoot) return null;
      return getProjectSettingsPath(projectRoot);

    case 'localSettings':
      if (!projectRoot) return null;
      return getProjectLocalSettingsPath(projectRoot);

    case 'policySettings':
    case 'flagSettings':
      // These are in-memory or remote, no file path
      return null;

    default:
      return null;
  }
}

/**
 * Get human-readable description for settings source
 */
export function getSettingsSourceDescription(source: SettingsSource): string {
  switch (source) {
    case 'managedSettings':
      return 'Managed settings (enterprise)';
    case 'userSettings':
      return `User settings (~/.claude/settings.json)`;
    case 'projectSettings':
      return 'Project settings (.claude/settings.json)';
    case 'localSettings':
      return 'Local settings (.claude/settings.local.json)';
    case 'policySettings':
      return 'Policy settings (remote)';
    case 'flagSettings':
      return 'Feature flags';
    default:
      return source;
  }
}

// ============================================================================
// MCP Config Paths
// ============================================================================

/** MCP config filename */
export const MCP_CONFIG_FILENAME = '.mcp.json';

/**
 * Get MCP config path for project
 */
export function getMCPConfigPath(projectRoot: string): string {
  return join(projectRoot, MCP_CONFIG_FILENAME);
}

/**
 * Get global MCP config path
 */
export function getGlobalMCPConfigPath(): string {
  return join(CLAUDE_CONFIG_DIR, 'mcp.json');
}

// ============================================================================
// CLAUDE.md Paths
// ============================================================================

/** CLAUDE.md filename */
export const CLAUDE_MD_FILENAME = 'CLAUDE.md';

/**
 * Get CLAUDE.md path for a directory
 */
export function getClaudeMdPath(dir: string): string {
  return join(dir, CLAUDE_MD_FILENAME);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all settings file paths that exist for a project
 */
export function getAllSettingsFilePaths(projectRoot?: string): string[] {
  const paths: string[] = [];

  // Managed settings (highest priority for restrictions)
  paths.push(getManagedSettingsPath());

  // User settings
  paths.push(USER_SETTINGS_FILE);

  // Project settings
  if (projectRoot) {
    paths.push(getProjectSettingsPath(projectRoot));
    paths.push(getProjectLocalSettingsPath(projectRoot));
  }

  return paths;
}

/**
 * Get settings sources in priority order (lowest to highest)
 * Later sources override earlier ones for most settings
 */
export function getSettingsSourceOrder(): SettingsSource[] {
  return [
    'managedSettings',   // Enterprise restrictions apply first
    'userSettings',      // User preferences
    'projectSettings',   // Team/project settings
    'localSettings',     // Personal project overrides
    'policySettings',    // Remote policies
    'flagSettings',      // Feature flags
  ];
}
