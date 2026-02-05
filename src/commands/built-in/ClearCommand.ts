/**
 * Clear Command
 * Clear the terminal screen
 */

import type { Command, CommandArgs, CommandContext, CommandResult } from '../types';

/**
 * Clear command - Clears the terminal screen
 */
export const ClearCommand: Command = {
  name: 'clear',
  aliases: ['cls'],
  description: 'Clear the terminal screen',
  usage: '/clear',
  examples: [
    '/clear',
  ],
  options: [
    {
      name: 'history',
      short: 'H',
      description: 'Also clear command history',
      type: 'boolean',
      default: false,
    },
    {
      name: 'scrollback',
      short: 's',
      description: 'Also clear scrollback buffer',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(args: CommandArgs, context: CommandContext): Promise<CommandResult> {
    const { options } = args;
    const { output } = context;

    const clearHistory = options.history as boolean;
    const clearScrollback = options.scrollback as boolean;

    // ANSI escape codes for clearing screen
    let clearSequence = '';

    if (clearScrollback) {
      // Clear screen and scrollback buffer (ESC[3J clears scrollback)
      clearSequence = '\x1b[2J\x1b[3J\x1b[H';
    } else {
      // Clear screen and move cursor to home position
      clearSequence = '\x1b[2J\x1b[H';
    }

    // Output the clear sequence
    output(clearSequence);

    // Build result message
    const actions: string[] = ['Screen cleared'];

    if (clearScrollback) {
      actions.push('scrollback buffer cleared');
    }

    if (clearHistory) {
      actions.push('command history cleared');
      // Note: Actual history clearing would be handled by the session/REPL
    }

    return {
      success: true,
      message: actions.join(', '),
      data: {
        clearedScreen: true,
        clearedScrollback: clearScrollback,
        clearedHistory: clearHistory,
      },
    };
  },
};

export default ClearCommand;
