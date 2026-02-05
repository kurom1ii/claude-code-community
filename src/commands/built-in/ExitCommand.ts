/**
 * Exit Command
 * Exit the CLI application
 */

import type { Command, CommandArgs, CommandContext, CommandResult } from '../types';

/**
 * Exit command - Exits the CLI application
 */
export const ExitCommand: Command = {
  name: 'exit',
  aliases: ['quit', 'q', 'bye'],
  description: 'Exit the CLI application',
  usage: '/exit [--force]',
  examples: [
    '/exit',
    '/exit --force',
    '/quit',
  ],
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force exit without saving',
      type: 'boolean',
      default: false,
    },
    {
      name: 'save',
      short: 's',
      description: 'Save session before exiting',
      type: 'boolean',
      default: true,
    },
    {
      name: 'code',
      short: 'c',
      description: 'Exit code to return',
      type: 'number',
      default: 0,
    },
  ],

  async execute(args: CommandArgs, context: CommandContext): Promise<CommandResult> {
    const { options } = args;
    const { output, session } = context;

    const force = options.force as boolean;
    const save = options.save as boolean;
    const exitCode = options.code as number;

    // Check for unsaved work
    if (!force && session) {
      const hasUnsavedWork = checkForUnsavedWork(session);

      if (hasUnsavedWork && save) {
        output('Saving session before exit...');
        // Note: Actual session saving would be handled by SessionManager
      }
    }

    // Display farewell message
    output(getFarewellMessage());

    return {
      success: true,
      message: 'Goodbye!',
      exitCode: exitCode,
      shouldExit: true,
      data: {
        force,
        saved: save && !force,
      },
    };
  },
};

/**
 * Check if there's unsaved work in the session
 */
function checkForUnsavedWork(session: unknown): boolean {
  // Implementation would check session state
  // For now, return false as a placeholder
  return false;
}

/**
 * Get a farewell message
 */
function getFarewellMessage(): string {
  const messages = [
    'Goodbye! Have a great day!',
    'See you later!',
    'Until next time!',
    'Farewell!',
    'Happy coding!',
    'Thanks for using Claude Code!',
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

export default ExitCommand;
