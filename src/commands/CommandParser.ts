/**
 * Command Parser
 * Parses command input strings into structured arguments
 */

import type { CommandArgs, CommandOption, ParserOptions, Token } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Default parser options */
const DEFAULT_OPTIONS: Required<ParserOptions> = {
  strictOptions: false,
  stopOnPositional: false,
  commandPrefix: '/',
};

// ============================================================================
// CommandParser Class
// ============================================================================

/**
 * Parses command input strings into structured CommandArgs
 *
 * Supports:
 * - Positional arguments: /command arg1 arg2
 * - Long options: --flag, --key=value, --key value
 * - Short options: -f, -f value, -abc (combined)
 * - Quoted strings: "value with spaces", 'single quoted'
 * - Separator: -- to stop option parsing
 *
 * @example
 * ```typescript
 * const parser = new CommandParser();
 * const args = parser.parse('/help --verbose create');
 * // { positional: ['create'], options: { verbose: true }, raw: '/help --verbose create' }
 * ```
 */
export class CommandParser {
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parse a command input string
   * @param input Raw command input
   * @param commandOptions Available options for the command (for type coercion)
   * @returns Parsed command arguments
   */
  parse(input: string, commandOptions?: CommandOption[]): CommandArgs {
    const tokens = this.tokenize(input);
    return this.parseTokens(tokens, input, commandOptions);
  }

  /**
   * Extract the command name from input
   * @param input Raw command input
   * @returns Command name or null if not a command
   */
  extractCommandName(input: string): string | null {
    const trimmed = input.trim();

    if (!trimmed.startsWith(this.options.commandPrefix)) {
      return null;
    }

    // Extract first word after prefix
    const withoutPrefix = trimmed.slice(this.options.commandPrefix.length);
    const match = withoutPrefix.match(/^(\S+)/);

    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Check if input is a command
   * @param input Input string
   * @returns True if input starts with command prefix
   */
  isCommand(input: string): boolean {
    return input.trim().startsWith(this.options.commandPrefix);
  }

  /**
   * Tokenize input string into tokens
   * Handles quoted strings and escapes
   */
  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let current = '';
    let inQuote: string | null = null;
    let isFirstToken = true;
    let escaped = false;

    const pushToken = (value: string, raw: string) => {
      if (!value) return;

      let type: Token['type'];

      if (isFirstToken && value.startsWith(this.options.commandPrefix)) {
        type = 'command';
        value = value.slice(this.options.commandPrefix.length);
        isFirstToken = false;
      } else if (value === '--') {
        type = 'separator';
      } else if (value.startsWith('--')) {
        type = 'long-option';
        value = value.slice(2);
      } else if (value.startsWith('-') && value.length > 1 && !value.startsWith('--')) {
        type = 'short-option';
        value = value.slice(1);
      } else {
        type = isFirstToken ? 'command' : 'positional';
        isFirstToken = false;
      }

      tokens.push({ type, value, raw });
    };

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      // Handle escape sequences
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      // Handle quotes
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = char;
        continue;
      }

      if (char === inQuote) {
        inQuote = null;
        continue;
      }

      // Handle whitespace (when not in quotes)
      if (!inQuote && /\s/.test(char)) {
        if (current) {
          pushToken(current, current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    // Push final token
    if (current) {
      pushToken(current, current);
    }

    return tokens;
  }

  /**
   * Parse tokens into CommandArgs
   */
  private parseTokens(
    tokens: Token[],
    raw: string,
    commandOptions?: CommandOption[]
  ): CommandArgs {
    const positional: string[] = [];
    const options: Record<string, unknown> = {};
    let stopOptionParsing = false;

    // Create option lookup map
    const optionMap = new Map<string, CommandOption>();
    if (commandOptions) {
      for (const opt of commandOptions) {
        optionMap.set(opt.name, opt);
        if (opt.short) {
          optionMap.set(opt.short, opt);
        }
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip command token
      if (token.type === 'command') {
        continue;
      }

      // Handle separator
      if (token.type === 'separator') {
        stopOptionParsing = true;
        continue;
      }

      // After separator, everything is positional
      if (stopOptionParsing) {
        positional.push(token.value);
        continue;
      }

      // Handle long options
      if (token.type === 'long-option') {
        const { name, value } = this.parseLongOption(token.value);
        const optDef = optionMap.get(name);

        if (value !== undefined) {
          options[name] = this.coerceValue(value, optDef);
        } else if (optDef?.type === 'boolean') {
          options[name] = true;
        } else {
          // Check next token for value
          const nextToken = tokens[i + 1];
          if (nextToken && nextToken.type === 'positional') {
            options[name] = this.coerceValue(nextToken.value, optDef);
            i++; // Skip next token
          } else {
            options[name] = true;
          }
        }
        continue;
      }

      // Handle short options
      if (token.type === 'short-option') {
        const chars = token.value.split('');

        for (let j = 0; j < chars.length; j++) {
          const char = chars[j];
          const optDef = optionMap.get(char);
          const optName = optDef?.name || char;

          if (optDef?.type === 'boolean') {
            options[optName] = true;
          } else if (j === chars.length - 1) {
            // Last char might have a value
            const nextToken = tokens[i + 1];
            if (nextToken && nextToken.type === 'positional') {
              options[optName] = this.coerceValue(nextToken.value, optDef);
              i++; // Skip next token
            } else {
              options[optName] = true;
            }
          } else {
            // Combined short options are treated as booleans
            options[optName] = true;
          }
        }
        continue;
      }

      // Handle positional arguments
      if (token.type === 'positional') {
        positional.push(token.value);

        if (this.options.stopOnPositional) {
          stopOptionParsing = true;
        }
      }
    }

    // Apply defaults from command options
    if (commandOptions) {
      for (const opt of commandOptions) {
        if (options[opt.name] === undefined && opt.default !== undefined) {
          options[opt.name] = opt.default;
        }
      }
    }

    return { positional, options, raw };
  }

  /**
   * Parse a long option string
   * Handles --key=value format
   */
  private parseLongOption(value: string): { name: string; value?: string } {
    const eqIndex = value.indexOf('=');

    if (eqIndex !== -1) {
      return {
        name: value.slice(0, eqIndex),
        value: value.slice(eqIndex + 1),
      };
    }

    return { name: value };
  }

  /**
   * Coerce a string value to the appropriate type
   */
  private coerceValue(value: string, optDef?: CommandOption): unknown {
    if (!optDef) {
      // Try to infer type
      if (value === 'true') return true;
      if (value === 'false') return false;
      const num = Number(value);
      if (!isNaN(num) && value.trim() !== '') return num;
      return value;
    }

    switch (optDef.type) {
      case 'boolean':
        return value === 'true' || value === '1' || value === 'yes';
      case 'number':
        return Number(value);
      case 'string':
      default:
        return value;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CommandParser instance
 * @param options Parser options
 * @returns CommandParser instance
 */
export function createCommandParser(options?: ParserOptions): CommandParser {
  return new CommandParser(options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Split a string respecting quotes
 * @param input Input string
 * @returns Array of tokens
 */
export function splitQuoted(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = char;
      continue;
    }

    if (char === inQuote) {
      inQuote = null;
      continue;
    }

    if (!inQuote && /\s/.test(char)) {
      if (current) {
        result.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    result.push(current);
  }

  return result;
}

/**
 * Format option for help display
 * @param option Command option
 * @returns Formatted option string
 */
export function formatOption(option: CommandOption): string {
  const parts: string[] = [];

  if (option.short) {
    parts.push(`-${option.short}`);
  }

  parts.push(`--${option.name}`);

  let result = parts.join(', ');

  if (option.type !== 'boolean') {
    result += ` <${option.type}>`;
  }

  return result;
}

/**
 * Format usage string for a command
 * @param name Command name
 * @param options Command options
 * @param prefix Command prefix
 * @returns Formatted usage string
 */
export function formatUsage(
  name: string,
  options?: CommandOption[],
  prefix: string = '/'
): string {
  let usage = `${prefix}${name}`;

  if (options) {
    for (const opt of options) {
      const optStr = opt.short ? `-${opt.short}` : `--${opt.name}`;
      if (opt.required) {
        usage += ` ${optStr}`;
        if (opt.type !== 'boolean') {
          usage += ` <${opt.name}>`;
        }
      } else {
        usage += ` [${optStr}`;
        if (opt.type !== 'boolean') {
          usage += ` <${opt.name}>`;
        }
        usage += ']';
      }
    }
  }

  return usage;
}
