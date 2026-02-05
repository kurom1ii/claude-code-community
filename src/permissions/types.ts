/**
 * Permission System Types
 *
 * Defines the type system for the permission management infrastructure.
 * Handles tool permissions, path access control, and command validation.
 */

/**
 * Permission levels in ascending order of privilege
 */
export type PermissionLevel = 'read' | 'write' | 'execute' | 'admin';

/**
 * Risk levels for permission requests
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Permission rule for a specific tool or action
 */
export interface PermissionRule {
  /** Tool name this rule applies to */
  tool: string;
  /** Required permission level */
  level: PermissionLevel;
  /** Glob pattern for matching paths or commands */
  pattern?: string;
  /** Whether user confirmation is required */
  requireConfirmation?: boolean;
  /** Patterns that are explicitly blocked */
  blockedPatterns?: string[];
  /** Optional description of the rule */
  description?: string;
  /** Maximum risk level allowed for this rule */
  maxRiskLevel?: RiskLevel;
}

/**
 * Configuration for the permission system
 */
export interface PermissionConfig {
  /** Default permission level when no specific rule matches */
  defaultLevel: PermissionLevel;
  /** List of permission rules */
  rules: PermissionRule[];
  /** Directories that are explicitly allowed */
  allowedDirs: string[];
  /** Directories that are explicitly blocked */
  blockedDirs: string[];
  /** Patterns for sensitive files (regex strings) */
  sensitivePatterns: string[];
  /** List of dangerous command patterns */
  dangerousCommands: string[];
  /** Whether to allow symlink following */
  allowSymlinks?: boolean;
  /** Maximum path traversal depth */
  maxPathDepth?: number;
  /** Enable strict mode (deny by default) */
  strictMode?: boolean;
}

/**
 * A request to perform an action requiring permission
 */
export interface PermissionRequest {
  /** The tool requesting permission */
  tool: string;
  /** The action being performed */
  action: string;
  /** Target path, URL, or resource */
  target?: string;
  /** Additional details about the request */
  details?: Record<string, unknown>;
  /** User context for the request */
  userContext?: UserContext;
}

/**
 * Result of a permission check
 */
export interface PermissionResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Whether user confirmation is required before proceeding */
  requiresConfirmation: boolean;
  /** Human-readable reason for the decision */
  reason?: string;
  /** Risk level of the requested action */
  riskLevel?: RiskLevel;
  /** Matched rule that determined the result */
  matchedRule?: PermissionRule;
  /** Suggestions for safer alternatives */
  suggestions?: string[];
  /** Warning messages to display */
  warnings?: string[];
}

/**
 * User context for permission decisions
 */
export interface UserContext {
  /** User identifier */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
  /** User's permission level */
  userLevel?: PermissionLevel;
  /** Whether the user has elevated privileges */
  elevated?: boolean;
  /** Trusted paths for this user */
  trustedPaths?: string[];
}

/**
 * Result of path validation
 */
export interface PathValidationResult {
  /** Whether the path is valid and allowed */
  valid: boolean;
  /** The normalized/resolved path */
  normalizedPath?: string;
  /** Reason for validation failure */
  reason?: string;
  /** Whether the path contains sensitive files */
  isSensitive?: boolean;
  /** Whether the path is in a blocked directory */
  isBlocked?: boolean;
  /** Risk assessment for the path */
  risk?: RiskLevel;
}

/**
 * Result of command analysis
 */
export interface CommandAnalysisResult {
  /** Whether the command is allowed */
  allowed: boolean;
  /** Whether the command is dangerous */
  isDangerous: boolean;
  /** Risk level of the command */
  riskLevel: RiskLevel;
  /** Specific dangerous patterns detected */
  detectedPatterns: DangerousPattern[];
  /** Human-readable explanation */
  reason?: string;
  /** Suggested safer alternatives */
  saferAlternatives?: string[];
}

/**
 * A detected dangerous pattern in a command
 */
export interface DangerousPattern {
  /** The pattern that was matched */
  pattern: string;
  /** Category of the danger */
  category: DangerCategory;
  /** Description of the risk */
  description: string;
  /** Severity of the danger */
  severity: RiskLevel;
  /** Position in the command where pattern was found */
  position?: number;
}

/**
 * Categories of dangerous operations
 */
export type DangerCategory =
  | 'file_destruction'
  | 'permission_escalation'
  | 'credential_exposure'
  | 'network_attack'
  | 'code_injection'
  | 'data_exfiltration'
  | 'system_modification'
  | 'process_manipulation';

/**
 * Result of sensitive file detection
 */
export interface SensitiveFileResult {
  /** Whether the file is sensitive */
  isSensitive: boolean;
  /** Type of sensitive file */
  sensitiveType?: SensitiveFileType;
  /** Confidence level (0-1) */
  confidence: number;
  /** Reason for classification */
  reason?: string;
  /** Recommended handling */
  recommendation?: string;
}

/**
 * Types of sensitive files
 */
export type SensitiveFileType =
  | 'environment_file'
  | 'credentials_file'
  | 'private_key'
  | 'certificate'
  | 'password_file'
  | 'token_file'
  | 'config_with_secrets'
  | 'database_file'
  | 'backup_file'
  | 'log_file';

/**
 * Permission event for logging/auditing
 */
export interface PermissionEvent {
  /** Timestamp of the event */
  timestamp: Date;
  /** Type of event */
  eventType: 'check' | 'grant' | 'deny' | 'confirm';
  /** The permission request */
  request: PermissionRequest;
  /** The result of the check */
  result: PermissionResult;
  /** User context */
  userContext?: UserContext;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Callback for permission events
 */
export type PermissionEventHandler = (event: PermissionEvent) => void;

/**
 * Options for the permission manager
 */
export interface PermissionManagerOptions {
  /** Permission configuration */
  config: PermissionConfig;
  /** Event handler for permission events */
  onEvent?: PermissionEventHandler;
  /** Enable debug logging */
  debug?: boolean;
  /** Cache permission results */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
}

/**
 * Default permission configuration
 */
export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  defaultLevel: 'read',
  rules: [],
  allowedDirs: [],
  blockedDirs: [
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/root',
    '/sys',
    '/proc',
  ],
  sensitivePatterns: [
    '\\.env$',
    '\\.env\\.[^/]+$',
    'credentials\\.[^/]+$',
    'secrets?\\.[^/]+$',
    '\\.pem$',
    '\\.key$',
    'id_rsa',
    'id_ed25519',
    '\\.p12$',
    '\\.pfx$',
    'password',
    '\\.htpasswd$',
    'token',
    '\\.npmrc$',
    '\\.pypirc$',
    '\\.netrc$',
  ],
  dangerousCommands: [
    'rm -rf',
    'chmod 777',
    'sudo',
    'curl.*\\|.*sh',
    'wget.*\\|.*sh',
    'eval',
    '> /dev/sd',
    'dd if=',
    'mkfs',
    'format',
    ':(){:|:&};:',
    'fork bomb',
  ],
  allowSymlinks: false,
  maxPathDepth: 20,
  strictMode: false,
};
