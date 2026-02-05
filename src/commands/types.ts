/**
 * Command System Types
 * Type definitions for the Claude Code CLI command system
 */

import type { Session } from '../session/types';

// ============================================================================
// Command Definition Types
// ============================================================================

/**
 * Represents a CLI command that can be executed
 */
export interface Command {
  /** The primary command name (e.g., "help", "config") */
  name: string;

  /** Alternative names for the command */
  aliases?: string[];

  /** Brief description of what the command does */
  description: string;

  /** Usage pattern (e.g., "/help [command]") */
  usage?: string;

  /** Example usages of the command */
  examples?: string[];

  /** Command options/flags */
  options?: CommandOption[];

  /** Whether the command is hidden from help listings */
  isHidden?: boolean;

  /** Function to check if command is currently available */
  isEnabled?: () => boolean;

  /**
   * Execute the command
   * @param args Parsed command arguments
   * @param context Execution context
   * @returns Command result
   */
  execute(args: CommandArgs, context: CommandContext): Promise<CommandResult>;
}

/**
 * Defines a command option/flag
 */
export interface CommandOption {
  /** Full option name (e.g., "verbose") */
  name: string;

  /** Short option name (e.g., "v" for -v) */
  short?: string;

  /** Description of the option */
  description: string;

  /** Type of the option value */
  type: 'string' | 'boolean' | 'number';

  /** Whether the option is required */
  required?: boolean;

  /** Default value if not provided */
  default?: unknown;

  /** Allowed values for string options */
  choices?: string[];
}

// ============================================================================
// Command Execution Types
// ============================================================================

/**
 * Parsed command arguments
 */
export interface CommandArgs {
  /** Positional arguments (non-option values) */
  positional: string[];

  /** Named options (--flag, -f) */
  options: Record<string, unknown>;

  /** Original raw input string */
  raw: string;
}

/**
 * Context provided to command execution
 */
export interface CommandContext {
  /** Current working directory */
  cwd: string;

  /** Current active session (if any) */
  session?: Session;

  /** Function to output text to the user */
  output: (text: string) => void;

  /** Function to read input from the user */
  input: () => Promise<string>;

  /** Access to the command registry for help/introspection */
  registry?: CommandRegistry;

  /** Environment variables */
  env?: Record<string, string | undefined>;
}

/**
 * Result of command execution
 */
export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean;

  /** Message to display to the user */
  message?: string;

  /** Additional data returned by the command */
  data?: unknown;

  /** Exit code (0 for success, non-zero for failure) */
  exitCode?: number;

  /** Whether to exit the CLI after this command */
  shouldExit?: boolean;
}

// ============================================================================
// Command Registry Types
// ============================================================================

/**
 * Interface for the command registry
 */
export interface CommandRegistry {
  /**
   * Register a command
   * @param command Command to register
   */
  register(command: Command): void;

  /**
   * Unregister a command by name
   * @param name Command name to remove
   */
  unregister(name: string): void;

  /**
   * Get a command by name or alias
   * @param name Command name or alias
   * @returns The command or undefined
   */
  get(name: string): Command | undefined;

  /**
   * Check if a command exists
   * @param name Command name or alias
   * @returns True if command exists
   */
  has(name: string): boolean;

  /**
   * List all registered commands
   * @param includeHidden Include hidden commands
   * @returns Array of registered commands
   */
  list(includeHidden?: boolean): Command[];

  /**
   * Parse input and find matching command
   * @param input Raw command input
   * @returns Parsed command and args, or null
   */
  parse(input: string): ParsedCommand | null;
}

/**
 * Result of parsing a command input
 */
export interface ParsedCommand {
  /** The matched command */
  command: Command;

  /** Parsed arguments */
  args: CommandArgs;
}

// ============================================================================
// Command Parser Types
// ============================================================================

/**
 * Token types for command parsing
 */
export type TokenType =
  | 'command'       // The command name (first token)
  | 'positional'    // Positional argument
  | 'long-option'   // --flag or --flag=value
  | 'short-option'  // -f or -f value
  | 'value'         // Option value
  | 'separator';    // -- separator

/**
 * A parsed token from command input
 */
export interface Token {
  type: TokenType;
  value: string;
  raw: string;
}

/**
 * Options for the command parser
 */
export interface ParserOptions {
  /** Whether to treat unknown options as errors */
  strictOptions?: boolean;

  /** Whether to stop parsing options after first positional */
  stopOnPositional?: boolean;

  /** Prefix for commands (default: "/") */
  commandPrefix?: string;
}

// ============================================================================
// Command Events
// ============================================================================

/**
 * Event types for command system
 */
export type CommandEventType =
  | 'command:registered'
  | 'command:unregistered'
  | 'command:before-execute'
  | 'command:after-execute'
  | 'command:error';

/**
 * Command system event
 */
export interface CommandEvent {
  type: CommandEventType;
  command: string;
  timestamp: Date;
  args?: CommandArgs;
  result?: CommandResult;
  error?: Error;
}

/**
 * Handler for command events
 */
export type CommandEventHandler = (event: CommandEvent) => void;
