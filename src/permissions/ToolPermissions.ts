/**
 * Tool Permissions
 *
 * Defines default permission mappings for each tool in the system.
 * Maps tools to their required permission levels and default rules.
 */

import { PermissionLevel, PermissionRule, RiskLevel } from './types.js';

/**
 * Tool permission definition
 */
export interface ToolPermissionDef {
  /** Required permission level */
  level: PermissionLevel;
  /** Default risk level for this tool */
  riskLevel: RiskLevel;
  /** Whether confirmation is required by default */
  requiresConfirmation: boolean;
  /** Description of what this tool does */
  description: string;
  /** Categories of actions this tool can perform */
  categories: ToolCategory[];
  /** Dangerous patterns specific to this tool */
  dangerousPatterns?: string[];
  /** Allowed patterns for this tool */
  allowedPatterns?: string[];
}

/**
 * Categories of tool operations
 */
export type ToolCategory =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'file_create'
  | 'command_execute'
  | 'network_access'
  | 'process_control'
  | 'system_info'
  | 'user_interaction'
  | 'code_execution'
  | 'git_operation'
  | 'browser_automation'
  | 'api_access';

/**
 * Default permission mappings for all tools
 */
export const TOOL_PERMISSIONS: Record<string, ToolPermissionDef> = {
  // File reading tools
  Read: {
    level: 'read',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Read file contents',
    categories: ['file_read'],
    dangerousPatterns: [
      '\\.env$',
      '\\.pem$',
      '\\.key$',
      'id_rsa',
      'credentials',
      'secrets',
    ],
  },

  Glob: {
    level: 'read',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Search for files by pattern',
    categories: ['file_read', 'system_info'],
  },

  Grep: {
    level: 'read',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Search file contents',
    categories: ['file_read'],
  },

  // File writing tools
  Write: {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Write or create files',
    categories: ['file_write', 'file_create'],
    dangerousPatterns: [
      '^/etc/',
      '^/var/',
      '^/usr/',
      '^/bin/',
      '^/sbin/',
      '\\.env$',
      '\\.bashrc$',
      '\\.zshrc$',
      '\\.profile$',
    ],
  },

  Edit: {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Edit existing files',
    categories: ['file_write'],
    dangerousPatterns: [
      '^/etc/',
      '^/var/',
      '^/usr/',
      '\\.env$',
    ],
  },

  NotebookEdit: {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Edit Jupyter notebook cells',
    categories: ['file_write', 'code_execution'],
  },

  // Command execution tools
  Bash: {
    level: 'execute',
    riskLevel: 'high',
    requiresConfirmation: true,
    description: 'Execute shell commands',
    categories: ['command_execute', 'process_control'],
    dangerousPatterns: [
      'rm\\s+-rf',
      'sudo',
      'chmod\\s+777',
      'curl.*\\|.*sh',
      'wget.*\\|.*sh',
      'dd\\s+if=',
      'mkfs',
      'format',
      '> /dev/sd',
    ],
  },

  // Network tools
  WebFetch: {
    level: 'read',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Fetch content from URLs',
    categories: ['network_access', 'file_read'],
  },

  WebSearch: {
    level: 'read',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Search the web',
    categories: ['network_access'],
  },

  // Browser automation
  browser_task: {
    level: 'execute',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Automate browser actions',
    categories: ['browser_automation', 'network_access'],
  },

  // Task management
  Task: {
    level: 'write',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Create and manage tasks',
    categories: ['user_interaction'],
  },

  Skill: {
    level: 'execute',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Execute predefined skills',
    categories: ['code_execution'],
  },

  // Team/Agent tools
  Teammate: {
    level: 'write',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Manage team members',
    categories: ['user_interaction'],
  },

  SendMessage: {
    level: 'write',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Send messages to teammates',
    categories: ['user_interaction'],
  },

  // Git operations
  git: {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Git version control operations',
    categories: ['git_operation', 'file_write'],
    dangerousPatterns: [
      'push.*--force',
      'reset.*--hard',
      'clean.*-f',
      'branch.*-D',
    ],
  },

  // GitHub API tools
  'mcp__github__create_pull_request': {
    level: 'write',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Create GitHub pull requests',
    categories: ['api_access', 'git_operation'],
  },

  'mcp__github__merge_pull_request': {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: true,
    description: 'Merge GitHub pull requests',
    categories: ['api_access', 'git_operation'],
  },

  'mcp__github__create_or_update_file': {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Create or update files on GitHub',
    categories: ['api_access', 'file_write'],
  },

  'mcp__github__delete_file': {
    level: 'write',
    riskLevel: 'high',
    requiresConfirmation: true,
    description: 'Delete files on GitHub',
    categories: ['api_access', 'file_delete'],
  },

  'mcp__github__push_files': {
    level: 'write',
    riskLevel: 'medium',
    requiresConfirmation: false,
    description: 'Push multiple files to GitHub',
    categories: ['api_access', 'file_write'],
  },

  // Linear tools
  'mcp__linear-server__create_issue': {
    level: 'write',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Create Linear issues',
    categories: ['api_access'],
  },

  'mcp__linear-server__update_issue': {
    level: 'write',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Update Linear issues',
    categories: ['api_access'],
  },

  // Chrome DevTools
  'mcp__chrome-devtools__evaluate_script': {
    level: 'execute',
    riskLevel: 'high',
    requiresConfirmation: true,
    description: 'Execute JavaScript in browser',
    categories: ['code_execution', 'browser_automation'],
  },

  'mcp__chrome-devtools__navigate_page': {
    level: 'execute',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Navigate browser to URL',
    categories: ['browser_automation', 'network_access'],
  },

  'mcp__chrome-devtools__click': {
    level: 'execute',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Click element in browser',
    categories: ['browser_automation'],
  },

  'mcp__chrome-devtools__fill': {
    level: 'execute',
    riskLevel: 'low',
    requiresConfirmation: false,
    description: 'Fill form fields in browser',
    categories: ['browser_automation'],
  },
};

/**
 * Get permission definition for a tool
 */
export function getToolPermission(toolName: string): ToolPermissionDef | undefined {
  return TOOL_PERMISSIONS[toolName];
}

/**
 * Get required permission level for a tool
 */
export function getToolPermissionLevel(toolName: string): PermissionLevel {
  const def = TOOL_PERMISSIONS[toolName];
  return def?.level ?? 'execute'; // Default to highest restriction
}

/**
 * Check if a tool requires confirmation
 */
export function toolRequiresConfirmation(toolName: string): boolean {
  const def = TOOL_PERMISSIONS[toolName];
  return def?.requiresConfirmation ?? true; // Default to requiring confirmation
}

/**
 * Get risk level for a tool
 */
export function getToolRiskLevel(toolName: string): RiskLevel {
  const def = TOOL_PERMISSIONS[toolName];
  return def?.riskLevel ?? 'high'; // Default to high risk
}

/**
 * Get all tools in a category
 */
export function getToolsByCategory(category: ToolCategory): string[] {
  return Object.entries(TOOL_PERMISSIONS)
    .filter(([_, def]) => def.categories.includes(category))
    .map(([name]) => name);
}

/**
 * Get all tools requiring a specific permission level
 */
export function getToolsByPermissionLevel(level: PermissionLevel): string[] {
  return Object.entries(TOOL_PERMISSIONS)
    .filter(([_, def]) => def.level === level)
    .map(([name]) => name);
}

/**
 * Convert tool permission definition to permission rule
 */
export function toPermissionRule(toolName: string): PermissionRule | undefined {
  const def = TOOL_PERMISSIONS[toolName];
  if (!def) return undefined;

  return {
    tool: toolName,
    level: def.level,
    requireConfirmation: def.requiresConfirmation,
    blockedPatterns: def.dangerousPatterns,
    description: def.description,
    maxRiskLevel: def.riskLevel,
  };
}

/**
 * Get all tool permission rules
 */
export function getAllPermissionRules(): PermissionRule[] {
  return Object.keys(TOOL_PERMISSIONS)
    .map(toPermissionRule)
    .filter((rule): rule is PermissionRule => rule !== undefined);
}

/**
 * Check if a pattern matches any dangerous patterns for a tool
 */
export function matchesDangerousPattern(toolName: string, target: string): boolean {
  const def = TOOL_PERMISSIONS[toolName];
  if (!def?.dangerousPatterns) return false;

  return def.dangerousPatterns.some(pattern => {
    const regex = new RegExp(pattern, 'i');
    return regex.test(target);
  });
}

/**
 * Get tools with elevated risk
 */
export function getHighRiskTools(): string[] {
  return Object.entries(TOOL_PERMISSIONS)
    .filter(([_, def]) => def.riskLevel === 'high' || def.riskLevel === 'critical')
    .map(([name]) => name);
}

/**
 * Get tools that can modify files
 */
export function getFileModifyingTools(): string[] {
  return getToolsByCategory('file_write')
    .concat(getToolsByCategory('file_delete'))
    .concat(getToolsByCategory('file_create'));
}

/**
 * Get tools that can execute code
 */
export function getCodeExecutionTools(): string[] {
  return getToolsByCategory('command_execute')
    .concat(getToolsByCategory('code_execution'));
}

/**
 * Tool permission summary for documentation
 */
export function getToolPermissionSummary(): Array<{
  tool: string;
  level: PermissionLevel;
  risk: RiskLevel;
  confirmation: boolean;
  description: string;
}> {
  return Object.entries(TOOL_PERMISSIONS).map(([tool, def]) => ({
    tool,
    level: def.level,
    risk: def.riskLevel,
    confirmation: def.requiresConfirmation,
    description: def.description,
  }));
}
