/**
 * Command Registry
 * Manages registration, lookup, and execution of commands
 */

import type {
  Command,
  CommandArgs,
  CommandContext,
  CommandEvent,
  CommandEventHandler,
  CommandEventType,
  CommandRegistry as ICommandRegistry,
  ParsedCommand,
} from './types';
import { CommandParser, createCommandParser } from './CommandParser';

// ============================================================================
// CommandRegistry Class
// ============================================================================

/**
 * Registry for CLI commands
 *
 * Manages command registration, lookup by name/alias, and parsing of command input.
 *
 * @example
 * ```typescript
 * const registry = new CommandRegistry();
 *
 * registry.register({
 *   name: 'greet',
 *   aliases: ['hi', 'hello'],
 *   description: 'Greet the user',
 *   execute: async (args, ctx) => {
 *     ctx.output(`Hello, ${args.positional[0] || 'world'}!`);
 *     return { success: true };
 *   }
 * });
 *
 * const parsed = registry.parse('/greet Claude');
 * if (parsed) {
 *   await parsed.command.execute(parsed.args, context);
 * }
 * ```
 */
export class CommandRegistry implements ICommandRegistry {
  /** Map of command names to commands */
  private commands: Map<string, Command> = new Map();

  /** Map of aliases to command names */
  private aliases: Map<string, string> = new Map();

  /** Command parser instance */
  private parser: CommandParser;

  /** Event handlers */
  private eventHandlers: Map<CommandEventType, Set<CommandEventHandler>> = new Map();

  /** Command prefix */
  private readonly prefix: string;

  constructor(prefix: string = '/') {
    this.prefix = prefix;
    this.parser = createCommandParser({ commandPrefix: prefix });
  }

  // ==========================================================================
  // Registration Methods
  // ==========================================================================

  /**
   * Register a command
   * @param command Command to register
   * @throws Error if command name already exists
   */
  register(command: Command): void {
    const name = command.name.toLowerCase();

    if (this.commands.has(name)) {
      throw new Error(`Command "${name}" is already registered`);
    }

    // Check for alias conflicts
    if (command.aliases) {
      for (const alias of command.aliases) {
        const lowerAlias = alias.toLowerCase();
        if (this.commands.has(lowerAlias) || this.aliases.has(lowerAlias)) {
          throw new Error(`Alias "${alias}" conflicts with existing command or alias`);
        }
      }
    }

    // Register command
    this.commands.set(name, command);

    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias.toLowerCase(), name);
      }
    }

    this.emit({
      type: 'command:registered',
      command: name,
      timestamp: new Date(),
    });
  }

  /**
   * Register multiple commands at once
   * @param commands Array of commands to register
   */
  registerAll(commands: Command[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  /**
   * Unregister a command by name
   * @param name Command name to unregister
   * @returns True if command was unregistered
   */
  unregister(name: string): boolean {
    const lowerName = name.toLowerCase();
    const command = this.commands.get(lowerName);

    if (!command) {
      return false;
    }

    // Remove aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.delete(alias.toLowerCase());
      }
    }

    // Remove command
    this.commands.delete(lowerName);

    this.emit({
      type: 'command:unregistered',
      command: lowerName,
      timestamp: new Date(),
    });

    return true;
  }

  // ==========================================================================
  // Lookup Methods
  // ==========================================================================

  /**
   * Get a command by name or alias
   * @param name Command name or alias
   * @returns The command or undefined
   */
  get(name: string): Command | undefined {
    const lowerName = name.toLowerCase();

    // Direct lookup
    const command = this.commands.get(lowerName);
    if (command) {
      return command;
    }

    // Alias lookup
    const realName = this.aliases.get(lowerName);
    if (realName) {
      return this.commands.get(realName);
    }

    return undefined;
  }

  /**
   * Check if a command exists
   * @param name Command name or alias
   * @returns True if command exists
   */
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  /**
   * List all registered commands
   * @param includeHidden Include hidden commands
   * @returns Array of commands sorted by name
   */
  list(includeHidden: boolean = false): Command[] {
    const commands = Array.from(this.commands.values());

    const filtered = includeHidden
      ? commands
      : commands.filter((cmd) => !cmd.isHidden);

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get all command names (including aliases)
   * @returns Array of all command names and aliases
   */
  getNames(): string[] {
    const names = Array.from(this.commands.keys());
    const allAliases = Array.from(this.aliases.keys());
    return [...names, ...allAliases].sort();
  }

  /**
   * Find commands matching a prefix (for autocomplete)
   * @param prefix Prefix to match
   * @returns Matching commands
   */
  findByPrefix(prefix: string): Command[] {
    const lowerPrefix = prefix.toLowerCase();
    const seen = new Set<string>();
    const results: Command[] = [];

    // Search command names
    for (const [name, cmd] of this.commands) {
      if (name.startsWith(lowerPrefix) && !seen.has(name)) {
        seen.add(name);
        results.push(cmd);
      }
    }

    // Search aliases
    for (const [alias, name] of this.aliases) {
      if (alias.startsWith(lowerPrefix) && !seen.has(name)) {
        seen.add(name);
        const cmd = this.commands.get(name);
        if (cmd) {
          results.push(cmd);
        }
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ==========================================================================
  // Parsing Methods
  // ==========================================================================

  /**
   * Parse input and find matching command
   * @param input Raw command input
   * @returns Parsed command and args, or null if not a valid command
   */
  parse(input: string): ParsedCommand | null {
    // Check if it's a command
    if (!this.parser.isCommand(input)) {
      return null;
    }

    // Extract command name
    const commandName = this.parser.extractCommandName(input);
    if (!commandName) {
      return null;
    }

    // Find command
    const command = this.get(commandName);
    if (!command) {
      return null;
    }

    // Parse arguments
    const args = this.parser.parse(input, command.options);

    return { command, args };
  }

  /**
   * Check if input is a command
   * @param input Input string
   * @returns True if input starts with command prefix
   */
  isCommand(input: string): boolean {
    return this.parser.isCommand(input);
  }

  /**
   * Get the command prefix
   * @returns Command prefix string
   */
  getPrefix(): string {
    return this.prefix;
  }

  // ==========================================================================
  // Execution Methods
  // ==========================================================================

  /**
   * Execute a command from input
   * @param input Raw command input
   * @param context Execution context
   * @returns Command result or null if not a valid command
   */
  async execute(input: string, context: CommandContext): Promise<CommandExecutionResult> {
    const parsed = this.parse(input);

    if (!parsed) {
      const commandName = this.parser.extractCommandName(input);
      if (commandName) {
        return {
          executed: false,
          error: `Unknown command: ${commandName}`,
          suggestions: this.getSuggestions(commandName),
        };
      }
      return { executed: false, error: 'Not a command' };
    }

    const { command, args } = parsed;

    // Check if command is enabled
    if (command.isEnabled && !command.isEnabled()) {
      return {
        executed: false,
        error: `Command "${command.name}" is not available`,
      };
    }

    // Emit before-execute event
    this.emit({
      type: 'command:before-execute',
      command: command.name,
      timestamp: new Date(),
      args,
    });

    try {
      // Execute command
      const result = await command.execute(args, {
        ...context,
        registry: this,
      });

      // Emit after-execute event
      this.emit({
        type: 'command:after-execute',
        command: command.name,
        timestamp: new Date(),
        args,
        result,
      });

      return { executed: true, result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Emit error event
      this.emit({
        type: 'command:error',
        command: command.name,
        timestamp: new Date(),
        args,
        error: err,
      });

      return {
        executed: true,
        result: {
          success: false,
          message: err.message,
          exitCode: 1,
        },
        error: err.message,
      };
    }
  }

  /**
   * Get suggestions for a mistyped command
   * @param input Mistyped command name
   * @returns Array of suggested command names
   */
  private getSuggestions(input: string): string[] {
    const lowerInput = input.toLowerCase();
    const suggestions: string[] = [];

    for (const name of this.commands.keys()) {
      if (this.levenshteinDistance(lowerInput, name) <= 2) {
        suggestions.push(name);
      }
    }

    for (const alias of this.aliases.keys()) {
      if (this.levenshteinDistance(lowerInput, alias) <= 2) {
        suggestions.push(alias);
      }
    }

    return [...new Set(suggestions)].slice(0, 3);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // ==========================================================================
  // Event Methods
  // ==========================================================================

  /**
   * Subscribe to command events
   * @param type Event type
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  on(type: CommandEventType, handler: CommandEventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }

    this.eventHandlers.get(type)!.add(handler);

    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  /**
   * Emit a command event
   * @param event Event to emit
   */
  private emit(event: CommandEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in command event handler:', error);
        }
      }
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get statistics about registered commands
   * @returns Registry statistics
   */
  getStats(): CommandRegistryStats {
    const commands = this.list(true);
    const hidden = commands.filter((c) => c.isHidden).length;
    const withAliases = commands.filter((c) => c.aliases && c.aliases.length > 0).length;

    return {
      totalCommands: commands.length,
      hiddenCommands: hidden,
      visibleCommands: commands.length - hidden,
      commandsWithAliases: withAliases,
      totalAliases: this.aliases.size,
    };
  }

  /**
   * Clear all registered commands
   */
  clear(): void {
    this.commands.clear();
    this.aliases.clear();
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result of command execution via registry
 */
export interface CommandExecutionResult {
  /** Whether the command was executed */
  executed: boolean;

  /** Command result (if executed) */
  result?: {
    success: boolean;
    message?: string;
    data?: unknown;
    exitCode?: number;
    shouldExit?: boolean;
  };

  /** Error message (if any) */
  error?: string;

  /** Suggested commands (for typos) */
  suggestions?: string[];
}

/**
 * Registry statistics
 */
export interface CommandRegistryStats {
  totalCommands: number;
  hiddenCommands: number;
  visibleCommands: number;
  commandsWithAliases: number;
  totalAliases: number;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CommandRegistry instance
 * @param prefix Command prefix (default: "/")
 * @returns CommandRegistry instance
 */
export function createCommandRegistry(prefix: string = '/'): CommandRegistry {
  return new CommandRegistry(prefix);
}
