/**
 * Config Command
 * Manage application configuration
 */

import type { Command, CommandArgs, CommandContext, CommandResult } from '../types';
import { join } from 'path';
import { homedir } from 'os';

/** Path to global config */
const GLOBAL_CONFIG_PATH = join(homedir(), '.claude', 'settings.json');

/** Path to project config */
const PROJECT_CONFIG_NAME = '.claude.json';

/**
 * Config command - View and modify configuration
 */
export const ConfigCommand: Command = {
  name: 'config',
  aliases: ['cfg'],
  description: 'View and manage configuration settings',
  usage: '/config <action> [key] [value]',
  examples: [
    '/config list',
    '/config get model',
    '/config set model claude-opus-4-5-20251101',
    '/config unset debug',
    '/config path',
    '/config edit',
  ],
  options: [
    {
      name: 'global',
      short: 'g',
      description: 'Use global configuration',
      type: 'boolean',
      default: false,
    },
    {
      name: 'json',
      short: 'j',
      description: 'Output as JSON',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(args: CommandArgs, context: CommandContext): Promise<CommandResult> {
    const { positional, options } = args;
    const { output, cwd } = context;

    const useGlobal = options.global as boolean;
    const asJson = options.json as boolean;

    const action = positional[0] || 'list';
    const key = positional[1];
    const value = positional.slice(2).join(' ');

    const configPath = useGlobal ? GLOBAL_CONFIG_PATH : join(cwd, PROJECT_CONFIG_NAME);

    switch (action.toLowerCase()) {
      case 'list':
      case 'ls':
        return listConfig(configPath, asJson, output);

      case 'get':
        if (!key) {
          return {
            success: false,
            message: 'Usage: /config get <key>',
            exitCode: 1,
          };
        }
        return getConfig(configPath, key, asJson, output);

      case 'set':
        if (!key) {
          return {
            success: false,
            message: 'Usage: /config set <key> <value>',
            exitCode: 1,
          };
        }
        return setConfig(configPath, key, value, output);

      case 'unset':
      case 'delete':
      case 'rm':
        if (!key) {
          return {
            success: false,
            message: 'Usage: /config unset <key>',
            exitCode: 1,
          };
        }
        return unsetConfig(configPath, key, output);

      case 'path':
        output(`Global config: ${GLOBAL_CONFIG_PATH}`);
        output(`Project config: ${join(cwd, PROJECT_CONFIG_NAME)}`);
        output(`\nActive config: ${configPath}`);
        return { success: true };

      case 'edit':
        return editConfig(configPath, output);

      case 'reset':
        return resetConfig(configPath, useGlobal, output);

      default:
        return {
          success: false,
          message: `Unknown action: ${action}\nAvailable: list, get, set, unset, path, edit, reset`,
          exitCode: 1,
        };
    }
  },
};

/**
 * Read configuration file
 */
async function readConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Write configuration file
 */
async function writeConfig(path: string, config: Record<string, unknown>): Promise<void> {
  const fs = await import('fs/promises');
  const pathModule = await import('path');

  // Ensure directory exists
  await fs.mkdir(pathModule.dirname(path), { recursive: true });

  await fs.writeFile(path, JSON.stringify(config, null, 2));
}

/**
 * List all configuration values
 */
async function listConfig(
  path: string,
  asJson: boolean,
  output: (text: string) => void
): Promise<CommandResult> {
  try {
    const config = await readConfig(path);

    if (Object.keys(config).length === 0) {
      output('No configuration settings found.');
      return { success: true, data: {} };
    }

    if (asJson) {
      output(JSON.stringify(config, null, 2));
    } else {
      output('Configuration Settings');
      output('======================\n');

      for (const [key, value] of Object.entries(config)) {
        const displayValue = typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
        output(`${key} = ${displayValue}`);
      }
    }

    return { success: true, data: config };
  } catch (error) {
    return {
      success: false,
      message: `Failed to read config: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

/**
 * Get a specific configuration value
 */
async function getConfig(
  path: string,
  key: string,
  asJson: boolean,
  output: (text: string) => void
): Promise<CommandResult> {
  try {
    const config = await readConfig(path);

    // Support nested keys with dot notation
    const value = getNestedValue(config, key);

    if (value === undefined) {
      return {
        success: false,
        message: `Configuration key not found: ${key}`,
        exitCode: 1,
      };
    }

    if (asJson) {
      output(JSON.stringify({ [key]: value }, null, 2));
    } else {
      const displayValue = typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);
      output(`${key} = ${displayValue}`);
    }

    return { success: true, data: value };
  } catch (error) {
    return {
      success: false,
      message: `Failed to read config: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

/**
 * Set a configuration value
 */
async function setConfig(
  path: string,
  key: string,
  value: string,
  output: (text: string) => void
): Promise<CommandResult> {
  try {
    const config = await readConfig(path);

    // Parse value (try JSON, then use string)
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    // Support nested keys with dot notation
    setNestedValue(config, key, parsedValue);

    await writeConfig(path, config);

    output(`Set ${key} = ${JSON.stringify(parsedValue)}`);

    return { success: true, data: { key, value: parsedValue } };
  } catch (error) {
    return {
      success: false,
      message: `Failed to set config: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

/**
 * Unset a configuration value
 */
async function unsetConfig(
  path: string,
  key: string,
  output: (text: string) => void
): Promise<CommandResult> {
  try {
    const config = await readConfig(path);

    // Support nested keys with dot notation
    if (!deleteNestedValue(config, key)) {
      return {
        success: false,
        message: `Configuration key not found: ${key}`,
        exitCode: 1,
      };
    }

    await writeConfig(path, config);

    output(`Removed ${key}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Failed to unset config: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

/**
 * Open config in editor
 */
async function editConfig(
  path: string,
  output: (text: string) => void
): Promise<CommandResult> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  output(`Opening ${path} in ${editor}...`);
  output(`(Use your system editor to modify the configuration)`);

  // Note: In actual implementation, you would spawn the editor process
  // For now, just return the path
  return {
    success: true,
    message: `Config file: ${path}`,
    data: { path, editor },
  };
}

/**
 * Reset configuration to defaults
 */
async function resetConfig(
  path: string,
  isGlobal: boolean,
  output: (text: string) => void
): Promise<CommandResult> {
  const fs = await import('fs/promises');

  try {
    await fs.unlink(path);
    output(`Reset ${isGlobal ? 'global' : 'project'} configuration`);
    return { success: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      output('Configuration already at defaults');
      return { success: true };
    }
    return {
      success: false,
      message: `Failed to reset config: ${(error as Error).message}`,
      exitCode: 1,
    };
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set nested value in object using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Delete nested value from object using dot notation
 */
function deleteNestedValue(obj: Record<string, unknown>, key: string): boolean {
  const parts = key.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      return false;
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (!(lastPart in current)) {
    return false;
  }

  delete current[lastPart];
  return true;
}

export default ConfigCommand;
