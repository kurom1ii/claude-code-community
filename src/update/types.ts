/**
 * Claude Code Community - Update Checker Types
 * Type definitions for version checking and auto-update functionality
 */

// ============================================================================
// Release Information Types
// ============================================================================

/**
 * Information about a specific release
 */
export interface ReleaseInfo {
  /** Semantic version string (e.g., "2.1.30") */
  version: string;
  /** Date when the release was published */
  publishedAt: Date;
  /** Release notes/changelog content */
  releaseNotes: string;
  /** URL to download this release */
  downloadUrl: string;
  /** Checksums for verifying download integrity */
  checksums?: Record<string, string>;
  /** Whether this release contains breaking changes */
  breaking?: boolean;
  /** Whether this release contains security fixes */
  security?: boolean;
  /** Pre-release tag (e.g., "beta.1", "rc.1") */
  prerelease?: string;
  /** Assets available for download */
  assets?: ReleaseAsset[];
}

/**
 * Downloadable asset in a release
 */
export interface ReleaseAsset {
  /** Asset name (e.g., "claude-code-linux-x64.tar.gz") */
  name: string;
  /** Download URL */
  url: string;
  /** File size in bytes */
  size: number;
  /** Content type (MIME) */
  contentType: string;
  /** SHA-256 checksum */
  checksum?: string;
}

// ============================================================================
// Update Check Result Types
// ============================================================================

/**
 * Result of checking for updates
 */
export interface UpdateCheckResult {
  /** Currently installed version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Available releases (from current to latest) */
  releases: ReleaseInfo[];
  /** When this check was performed */
  lastChecked: Date;
  /** Type of version difference */
  updateType?: 'major' | 'minor' | 'patch' | 'prerelease';
  /** Whether any release contains breaking changes */
  hasBreakingChanges?: boolean;
  /** Whether any release contains security fixes */
  hasSecurityFixes?: boolean;
}

// ============================================================================
// Update Configuration Types
// ============================================================================

/**
 * Update channel for release selection
 */
export type UpdateChannel = 'stable' | 'beta' | 'nightly';

/**
 * Configuration for update checking behavior
 */
export interface UpdateConfig {
  /** Whether to check for updates on startup */
  checkOnStartup: boolean;
  /** How often to check for updates (in hours) */
  checkInterval: number;
  /** Only notify about updates, don't auto-update */
  notifyOnly: boolean;
  /** Which release channel to follow */
  channel: UpdateChannel;
  /** Custom registry URL (npm registry or GitHub releases) */
  registry?: string;
  /** Whether to include pre-release versions */
  includePrerelease?: boolean;
  /** Minimum time between checks (in hours) */
  minCheckInterval?: number;
  /** Whether to skip dismissed updates */
  respectDismissed?: boolean;
}

/**
 * Default update configuration
 */
export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  checkOnStartup: true,
  checkInterval: 24, // Check once per day
  notifyOnly: true,
  channel: 'stable',
  minCheckInterval: 1,
  respectDismissed: true,
};

// ============================================================================
// Semantic Version Types
// ============================================================================

/**
 * Parsed semantic version components
 */
export interface SemVer {
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Patch version number */
  patch: number;
  /** Pre-release identifier (e.g., "beta.1") */
  prerelease?: string;
  /** Build metadata (e.g., "20250205") */
  build?: string;
  /** Original version string */
  raw: string;
}

/**
 * Version difference type
 */
export type VersionDiff = 'major' | 'minor' | 'patch' | 'prerelease' | 'build' | 'none';

// ============================================================================
// Update State Types
// ============================================================================

/**
 * Current state of the update process
 */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'complete'
  | 'error';

/**
 * Update progress information
 */
export interface UpdateProgress {
  /** Current state */
  state: UpdateState;
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes downloaded */
  bytesDownloaded?: number;
  /** Total bytes to download */
  bytesTotal?: number;
  /** Current operation description */
  message?: string;
  /** Error if state is 'error' */
  error?: Error;
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Update notification options
 */
export interface UpdateNotification {
  /** Version being notified about */
  version: string;
  /** Notification message */
  message: string;
  /** Whether the update contains breaking changes */
  breaking: boolean;
  /** Whether the update contains security fixes */
  security: boolean;
  /** Actions available to the user */
  actions: NotificationAction[];
}

/**
 * Action available in update notification
 */
export interface NotificationAction {
  /** Action identifier */
  id: string;
  /** Display label */
  label: string;
  /** Whether this is the primary/default action */
  primary?: boolean;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cached update check data
 */
export interface UpdateCache {
  /** When the cache was last updated */
  lastChecked: Date;
  /** Cached latest version */
  latestVersion: string;
  /** Cached releases */
  releases: ReleaseInfo[];
  /** Versions that user has dismissed */
  dismissedVersions: string[];
  /** Channel this cache is for */
  channel: UpdateChannel;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Supported registry types
 */
export type RegistryType = 'npm' | 'github' | 'custom';

/**
 * Registry configuration
 */
export interface RegistryConfig {
  /** Type of registry */
  type: RegistryType;
  /** Base URL for the registry */
  baseUrl: string;
  /** Package name (for npm) or repo path (for GitHub) */
  package: string;
  /** Authentication token (if required) */
  token?: string;
}

/**
 * Default npm registry configuration
 */
export const DEFAULT_NPM_REGISTRY: RegistryConfig = {
  type: 'npm',
  baseUrl: 'https://registry.npmjs.org',
  package: 'claude-code-community',
};

/**
 * Default GitHub releases configuration
 */
export const DEFAULT_GITHUB_REGISTRY: RegistryConfig = {
  type: 'github',
  baseUrl: 'https://api.github.com',
  package: 'claude-code-community/claude-code',
};
