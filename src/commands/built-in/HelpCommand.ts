/**
 * Help Command
 * Displays help information for commands
 */

import type { Command, CommandArgs, CommandContext, CommandResult } from '../types';

/**
 * Help command - Shows available commands and their usage
 */
export const HelpCommand: Command = {
  name: 'help',
  aliases: ['h', '?'],
  description: 'Show help information for commands',
  usage: '/help [command]',
  examples: [
    '/help',
    '/help config',
    '/help --verbose',
  ],
  options: [
    {
      name: 'verbose',
      short: 'v',
      description: 'Show detailed help including examples',
      type: 'boolean',
      default: false,
    },
    {
      name: 'all',
      short: 'a',
      description: 'Include hidden commands',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(args: CommandArgs, context: CommandContext): Promise<CommandResult> {
    const { positional, options } = args;
    const { output, registry } = context;

    if (!registry) {
      return {
        success: false,
        message: 'Command registry not available',
        exitCode: 1,
      };
    }

    const verbose = options.verbose as boolean;
    const showAll = options.all as boolean;

    // If a specific command is requested
    if (positional.length > 0) {
      const commandName = positional[0];
      const command = registry.get(commandName);

      if (!command) {
        const suggestions = registry.findByPrefix(commandName);
        let message = `Unknown command: ${commandName}`;

        if (suggestions.length > 0) {
          message += `\n\nDid you mean?\n`;
          message += suggestions.slice(0, 3).map((c) => `  /${c.name}`).join('\n');
        }

        return {
          success: false,
          message,
          exitCode: 1,
        };
      }

      output(formatCommandHelp(command, registry.getPrefix(), verbose));
      return { success: true };
    }

    // List all commands
    const commands = registry.list(showAll);
    const prefix = registry.getPrefix();

    output(formatCommandList(commands, prefix, verbose));

    return { success: true };
  },
};

/**
 * Format help for a single command
 */
function formatCommandHelp(command: Command, prefix: string, verbose: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push(`${prefix}${command.name}`);
  lines.push('');

  // Description
  lines.push(command.description);
  lines.push('');

  // Aliases
  if (command.aliases && command.aliases.length > 0) {
    lines.push('Aliases:');
    lines.push(`  ${command.aliases.map((a) => `${prefix}${a}`).join(', ')}`);
    lines.push('');
  }

  // Usage
  if (command.usage) {
    lines.push('Usage:');
    lines.push(`  ${command.usage}`);
    lines.push('');
  }

  // Options
  if (command.options && command.options.length > 0) {
    lines.push('Options:');
    for (const opt of command.options) {
      const flags: string[] = [];
      if (opt.short) {
        flags.push(`-${opt.short}`);
      }
      flags.push(`--${opt.name}`);

      let optLine = `  ${flags.join(', ')}`;
      if (opt.type !== 'boolean') {
        optLine += ` <${opt.type}>`;
      }

      // Pad for alignment
      optLine = optLine.padEnd(30);
      optLine += opt.description;

      if (opt.default !== undefined) {
        optLine += ` (default: ${opt.default})`;
      }

      lines.push(optLine);
    }
    lines.push('');
  }

  // Examples (verbose only)
  if (verbose && command.examples && command.examples.length > 0) {
    lines.push('Examples:');
    for (const example of command.examples) {
      lines.push(`  ${example}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format list of commands
 */
function formatCommandList(commands: Command[], prefix: string, verbose: boolean): string {
  const lines: string[] = [];

  lines.push('Available Commands');
  lines.push('==================');
  lines.push('');

  // Group commands by category (future enhancement)
  // For now, just list all commands

  const maxNameLength = Math.max(...commands.map((c) => c.name.length));

  for (const cmd of commands) {
    const name = `${prefix}${cmd.name}`.padEnd(maxNameLength + 3);
    lines.push(`  ${name}  ${cmd.description}`);

    if (verbose && cmd.aliases && cmd.aliases.length > 0) {
      const aliasStr = cmd.aliases.map((a) => `${prefix}${a}`).join(', ');
      lines.push(`    Aliases: ${aliasStr}`);
    }
  }

  lines.push('');
  lines.push(`Use "${prefix}help <command>" for more information about a command.`);

  return lines.join('\n');
}

export default HelpCommand;
