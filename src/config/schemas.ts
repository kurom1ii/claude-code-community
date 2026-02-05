/**
 * Claude Code - Configuration Schemas
 * Zod schemas cho validation cấu hình
 */

import { z } from 'zod';

// ============================================================================
// Permission Schemas - Schema cho permissions
// ============================================================================

/** Permission rule pattern */
export const PermissionRuleSchema = z.string().describe('Permission rule pattern (e.g., "Bash(*)", "Read(~/.*)")');

/** Permission config schema */
export const PermissionsSchema = z.object({
  allow: z.array(PermissionRuleSchema).optional()
    .describe('List of permission rules for allowed operations'),
  deny: z.array(PermissionRuleSchema).optional()
    .describe('List of permission rules for denied operations'),
  ask: z.array(PermissionRuleSchema).optional()
    .describe('List of permission rules that should always prompt for confirmation'),
  defaultMode: z.enum(['ask', 'allow', 'deny']).optional()
    .describe('Default permission mode when Claude Code needs access'),
  disableBypassPermissionsMode: z.enum(['disable']).optional()
    .describe('Disable the ability to bypass permission prompts'),
  additionalDirectories: z.array(z.string()).optional()
    .describe('Additional directories to include in the permission scope'),
}).passthrough();

// ============================================================================
// MCP Server Schemas - Schema cho MCP servers
// ============================================================================

/** Environment variables schema */
export const EnvVarsSchema = z.record(z.string(), z.coerce.string());

/** MCP server config schema */
export const MCPServerConfigSchema = z.object({
  command: z.string().describe('Command to start the MCP server'),
  args: z.array(z.string()).optional().describe('Arguments for the command'),
  env: EnvVarsSchema.optional().describe('Environment variables'),
  disabled: z.boolean().optional().describe('Whether server is disabled'),
}).passthrough();

/** MCP servers map schema */
export const MCPServersSchema = z.record(
  z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Server name can only contain letters, numbers, hyphens, and underscores'),
  MCPServerConfigSchema
);

/** Allowed MCP server entry */
export const AllowedMCPServerSchema = z.object({
  serverName: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional()
    .describe('Name of the MCP server that users are allowed to configure'),
  serverCommand: z.array(z.string()).min(1).optional()
    .describe('Command array [command, ...args] to match exactly for allowed stdio servers'),
  serverUrl: z.string().optional()
    .describe('URL pattern with wildcard support for allowed remote MCP servers'),
}).refine(
  (data) => {
    const defined = [data.serverName, data.serverCommand, data.serverUrl].filter(Boolean).length;
    return defined === 1;
  },
  { message: 'Entry must have exactly one of "serverName", "serverCommand", or "serverUrl"' }
);

// ============================================================================
// Hook Schemas - Schema cho hooks
// ============================================================================

/** Hook matcher schema */
export const HookMatcherSchema = z.object({
  tool: z.string().optional().describe('Tool name pattern to match'),
  toolInput: z.record(z.string(), z.string()).optional().describe('Tool input patterns to match'),
}).passthrough();

/** Hook command schema */
export const HookCommandSchema = z.object({
  type: z.literal('command'),
  command: z.string().describe('Shell command to execute'),
  timeout: z.number().positive().optional().describe('Timeout in milliseconds'),
  workingDirectory: z.string().optional().describe('Working directory for the command'),
}).passthrough();

/** Hook entry schema */
export const HookEntrySchema = z.object({
  matcher: HookMatcherSchema.optional().describe('Conditions for when hook should run'),
  hooks: z.array(HookCommandSchema).describe('Commands to run'),
}).passthrough();

/** Hooks config schema */
export const HooksSchema = z.object({
  PreToolUse: z.array(HookEntrySchema).optional()
    .describe('Hooks that run before a tool is executed'),
  PostToolUse: z.array(HookEntrySchema).optional()
    .describe('Hooks that run after a tool is executed'),
  Notification: z.array(HookEntrySchema).optional()
    .describe('Hooks for notifications'),
  Stop: z.array(HookEntrySchema).optional()
    .describe('Hooks that run when agent stops'),
  SessionStart: z.array(HookEntrySchema).optional()
    .describe('Hooks that run when session starts'),
  PromptSubmit: z.array(HookEntrySchema).optional()
    .describe('Hooks that run when prompt is submitted'),
}).passthrough();

// ============================================================================
// Marketplace Schemas - Schema cho marketplaces
// ============================================================================

/** Marketplace source schema */
export const MarketplaceSourceSchema = z.string().url().or(z.string().startsWith('file://'));

/** Marketplace config schema */
export const MarketplaceConfigSchema = z.object({
  source: MarketplaceSourceSchema.describe('Where to fetch the marketplace from'),
  installLocation: z.string().optional()
    .describe('Local cache path where marketplace manifest is stored'),
});

// ============================================================================
// Attribution Schema
// ============================================================================

export const AttributionSchema = z.object({
  commit: z.string().optional()
    .describe('Attribution text for git commits. Empty string hides attribution.'),
  pr: z.string().optional()
    .describe('Attribution text for pull request descriptions. Empty string hides attribution.'),
});

// ============================================================================
// Spinner Schema
// ============================================================================

export const SpinnerVerbsSchema = z.object({
  mode: z.enum(['append', 'replace']),
  verbs: z.array(z.string()),
});

// ============================================================================
// Status Line Schema
// ============================================================================

export const StatusLineSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  padding: z.number().optional(),
});

// ============================================================================
// Sandbox Schema
// ============================================================================

export const SandboxSchema = z.object({
  enabled: z.boolean().optional().describe('Whether sandbox is enabled'),
  type: z.enum(['docker', 'firejail', 'none']).optional().describe('Sandbox type'),
  container: z.string().optional().describe('Docker container name'),
  image: z.string().optional().describe('Docker image'),
  seccomp: z.object({
    bpfPath: z.string().optional(),
    applyPath: z.string().optional(),
  }).optional(),
}).passthrough();

// ============================================================================
// Remote Schema
// ============================================================================

export const RemoteSchema = z.object({
  defaultEnvironmentId: z.string().optional()
    .describe('Default environment ID to use for remote sessions'),
});

// ============================================================================
// File Suggestion Schema
// ============================================================================

export const FileSuggestionSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
});

// ============================================================================
// Main Settings Schema - Schema chính cho settings
// ============================================================================

export const SettingsSchema = z.object({
  // Schema reference
  $schema: z.literal('https://json.schemastore.org/claude-code-settings.json').optional()
    .describe('JSON Schema reference for Claude Code settings'),

  // API & Authentication
  apiKeyHelper: z.string().optional()
    .describe('Path to a script that outputs authentication values'),
  awsCredentialExport: z.string().optional()
    .describe('Path to a script that exports AWS credentials'),
  awsAuthRefresh: z.string().optional()
    .describe('Path to a script that refreshes AWS authentication'),
  forceLoginMethod: z.enum(['claudeai', 'console']).optional()
    .describe('Force a specific login method'),
  forceLoginOrgUUID: z.string().optional()
    .describe('Organization UUID to use for OAuth login'),

  // Model & Behavior
  model: z.string().optional()
    .describe('Override the default model used by Claude Code'),
  agent: z.string().optional()
    .describe('Name of an agent to use for the main thread'),
  alwaysThinkingEnabled: z.boolean().optional()
    .describe('When false, thinking is disabled'),
  outputStyle: z.string().optional()
    .describe('Controls the output style for assistant responses'),
  language: z.string().optional()
    .describe('Preferred language for Claude responses'),

  // Environment
  env: EnvVarsSchema.optional()
    .describe('Environment variables to set for Claude Code sessions'),

  // Permissions
  permissions: PermissionsSchema.optional()
    .describe('Tool usage permissions configuration'),

  // MCP Servers
  mcpServers: MCPServersSchema.optional()
    .describe('MCP server configurations'),
  enableAllProjectMcpServers: z.boolean().optional()
    .describe('Whether to automatically approve all MCP servers in the project'),
  enabledMcpjsonServers: z.array(z.string()).optional()
    .describe('List of approved MCP servers from .mcp.json'),
  disabledMcpjsonServers: z.array(z.string()).optional()
    .describe('List of rejected MCP servers from .mcp.json'),
  allowedMcpServers: z.array(AllowedMCPServerSchema).optional()
    .describe('Enterprise allowlist of MCP servers'),
  deniedMcpServers: z.array(AllowedMCPServerSchema).optional()
    .describe('Enterprise denylist of MCP servers'),

  // Hooks
  hooks: HooksSchema.optional()
    .describe('Custom commands to run before/after tool executions'),
  disableAllHooks: z.boolean().optional()
    .describe('Disable all hooks and statusLine execution'),
  allowManagedHooksOnly: z.boolean().optional()
    .describe('Only hooks from managed settings run'),
  allowManagedPermissionRulesOnly: z.boolean().optional()
    .describe('Only permission rules from managed settings are respected'),

  // Status Line
  statusLine: StatusLineSchema.optional()
    .describe('Custom status line display configuration'),

  // Plugins
  enabledPlugins: z.record(z.string(), z.union([z.array(z.string()), z.boolean(), z.undefined()])).optional()
    .describe('Enabled plugins using plugin-id@marketplace-id format'),
  extraKnownMarketplaces: z.record(z.string(), MarketplaceConfigSchema).optional()
    .describe('Additional marketplaces to make available'),
  skippedMarketplaces: z.array(z.string()).optional()
    .describe('List of marketplace names the user has chosen not to install'),
  skippedPlugins: z.array(z.string()).optional()
    .describe('List of plugin IDs the user has chosen not to install'),
  strictKnownMarketplaces: z.array(MarketplaceSourceSchema).optional()
    .describe('Enterprise strict list of allowed marketplace sources'),
  blockedMarketplaces: z.array(MarketplaceSourceSchema).optional()
    .describe('Enterprise blocklist of marketplace sources'),
  pluginConfigs: z.record(z.string(), z.object({
    mcpServers: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))).optional(),
  })).optional()
    .describe('Per-plugin configuration'),

  // File & Git
  fileSuggestion: FileSuggestionSchema.optional()
    .describe('Custom file suggestion configuration for @ mentions'),
  respectGitignore: z.boolean().optional()
    .describe('Whether file picker should respect .gitignore files'),
  cleanupPeriodDays: z.number().nonnegative().int().optional()
    .describe('Number of days to retain chat transcripts'),
  attribution: AttributionSchema.optional()
    .describe('Customize attribution text for commits and PRs'),
  includeCoAuthoredBy: z.boolean().optional()
    .describe('Deprecated: Use attribution instead'),
  plansDirectory: z.string().optional()
    .describe('Custom directory for plan files'),

  // UI & Display
  spinnerTipsEnabled: z.boolean().optional()
    .describe('Whether to show tips in the spinner'),
  spinnerVerbs: SpinnerVerbsSchema.optional()
    .describe('Customize spinner verbs'),
  syntaxHighlightingDisabled: z.boolean().optional()
    .describe('Whether to disable syntax highlighting in diffs'),
  terminalTitleFromRename: z.boolean().optional()
    .describe('Terminal tab title is set from /rename'),
  promptSuggestionEnabled: z.boolean().optional()
    .describe('Whether prompt suggestions are enabled'),
  prefersReducedMotion: z.boolean().optional()
    .describe('Reduce or disable animations for accessibility'),

  // Telemetry & OTEL
  otelHeadersHelper: z.string().optional()
    .describe('Path to a script that outputs OpenTelemetry headers'),

  // Network
  skipWebFetchPreflight: z.boolean().optional()
    .describe('Skip the WebFetch blocklist check'),

  // Sandbox
  sandbox: SandboxSchema.optional(),

  // Remote
  remote: RemoteSchema.optional()
    .describe('Remote session configuration'),

  // Updates
  autoUpdatesChannel: z.enum(['latest', 'stable']).optional()
    .describe('Release channel for auto-updates'),
  minimumVersion: z.string().optional()
    .describe('Minimum version to stay on'),

  // Company/Enterprise
  companyAnnouncements: z.array(z.string()).optional()
    .describe('Company announcements to display at startup'),
}).passthrough();

// ============================================================================
// Type Exports - Export types từ schemas
// ============================================================================

export type Settings = z.infer<typeof SettingsSchema>;
export type Permissions = z.infer<typeof PermissionsSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type Hooks = z.infer<typeof HooksSchema>;
export type HookEntry = z.infer<typeof HookEntrySchema>;
export type Attribution = z.infer<typeof AttributionSchema>;
export type Sandbox = z.infer<typeof SandboxSchema>;

// ============================================================================
// Validation Functions - Các hàm validation
// ============================================================================

/**
 * Validate settings object
 */
export function validateSettings(data: unknown): { success: true; data: Settings } | { success: false; errors: string[] } {
  const result = SettingsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return `${path ? path + ': ' : ''}${issue.message}`;
  });

  return { success: false, errors };
}

/**
 * Parse settings với error formatting
 */
export function parseSettings(data: unknown, filePath?: string): Settings {
  const result = SettingsSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const errorMessages = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return `  - ${path ? path + ': ' : ''}${issue.message}`;
  }).join('\n');

  const location = filePath ? ` in ${filePath}` : '';
  throw new Error(`Invalid settings${location}:\n${errorMessages}`);
}
