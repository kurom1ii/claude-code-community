/**
 * ConfigCheck - Check configuration validity
 * Verifies config files, required settings, and path permissions
 */

import { DiagnosticCheck, DiagnosticCategory, DiagnosticResult } from '../types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Config file locations
const CONFIG_LOCATIONS = {
  global: path.join(os.homedir(), '.claude-code', 'config.json'),
  globalDir: path.join(os.homedir(), '.claude-code'),
  localDir: '.claude-code',
  localConfig: '.claude-code/config.json',
};

// Required config keys
const REQUIRED_SETTINGS = ['provider', 'model'];
const OPTIONAL_SETTINGS = ['apiKey', 'baseUrl', 'maxTokens', 'temperature'];

interface ConfigFile {
  [key: string]: unknown;
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse JSON file safely
 */
async function parseJsonFile(filePath: string): Promise<{
  valid: boolean;
  data?: ConfigFile;
  error?: string;
}> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { valid: false, error: `Invalid JSON: ${error.message}` };
    }
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check global configuration file
 */
export class GlobalConfigCheck implements DiagnosticCheck {
  name = 'global-config';
  description = 'Check global configuration file';
  category: DiagnosticCategory = 'configuration';

  async run(): Promise<DiagnosticResult> {
    const configPath = CONFIG_LOCATIONS.global;

    // Check if config directory exists
    const dirExists = await fileExists(CONFIG_LOCATIONS.globalDir);
    if (!dirExists) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Global config directory does not exist',
        details: `Expected: ${CONFIG_LOCATIONS.globalDir}`,
        suggestion: 'Run the initial setup to create configuration',
      };
    }

    // Check if config file exists
    const configExists = await fileExists(configPath);
    if (!configExists) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Global config file not found',
        details: `Expected: ${configPath}`,
        suggestion: 'Create a config file or run setup wizard',
      };
    }

    // Parse and validate config
    const result = await parseJsonFile(configPath);
    if (!result.valid) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Global config file is invalid',
        details: result.error,
        suggestion: 'Fix JSON syntax errors in config file',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Global configuration file is valid',
      details: `Location: ${configPath}`,
    };
  }
}

/**
 * Check required settings are present
 */
export class RequiredSettingsCheck implements DiagnosticCheck {
  name = 'required-settings';
  description = 'Check required settings are configured';
  category: DiagnosticCategory = 'configuration';

  async run(): Promise<DiagnosticResult> {
    const configPath = CONFIG_LOCATIONS.global;

    if (!(await fileExists(configPath))) {
      return {
        check: this.name,
        status: 'skip',
        message: 'Config file not found, skipping settings check',
      };
    }

    const result = await parseJsonFile(configPath);
    if (!result.valid || !result.data) {
      return {
        check: this.name,
        status: 'skip',
        message: 'Config file invalid, skipping settings check',
      };
    }

    const config = result.data;
    const missing: string[] = [];
    const present: string[] = [];

    for (const setting of REQUIRED_SETTINGS) {
      if (config[setting] !== undefined && config[setting] !== null) {
        present.push(setting);
      } else {
        missing.push(setting);
      }
    }

    if (missing.length > 0) {
      return {
        check: this.name,
        status: 'fail',
        message: `Missing required settings: ${missing.join(', ')}`,
        details: `Present: ${present.join(', ') || 'none'}`,
        suggestion: `Add the missing settings to ${configPath}`,
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'All required settings are configured',
      details: `Settings: ${present.join(', ')}`,
    };
  }
}

/**
 * Check API key is configured (without exposing it)
 */
export class ApiKeyConfigCheck implements DiagnosticCheck {
  name = 'api-key-config';
  description = 'Check API key is configured';
  category: DiagnosticCategory = 'configuration';

  async run(): Promise<DiagnosticResult> {
    // Check environment variable first
    const envKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (envKey) {
      const masked = this.maskKey(envKey);
      return {
        check: this.name,
        status: 'pass',
        message: 'API key found in environment variable',
        details: `Key: ${masked}`,
      };
    }

    // Check config file
    const configPath = CONFIG_LOCATIONS.global;
    if (!(await fileExists(configPath))) {
      return {
        check: this.name,
        status: 'fail',
        message: 'No API key configured',
        suggestion:
          'Set ANTHROPIC_API_KEY environment variable or add apiKey to config',
      };
    }

    const result = await parseJsonFile(configPath);
    if (result.valid && result.data && result.data['apiKey']) {
      const masked = this.maskKey(String(result.data['apiKey']));
      return {
        check: this.name,
        status: 'pass',
        message: 'API key found in config file',
        details: `Key: ${masked}`,
      };
    }

    return {
      check: this.name,
      status: 'fail',
      message: 'No API key configured',
      suggestion:
        'Set ANTHROPIC_API_KEY environment variable or add apiKey to config file',
    };
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }
}

/**
 * Check local project configuration
 */
export class LocalConfigCheck implements DiagnosticCheck {
  name = 'local-config';
  description = 'Check local project configuration';
  category: DiagnosticCategory = 'configuration';

  async run(): Promise<DiagnosticResult> {
    const cwd = process.cwd();
    const localDir = path.join(cwd, CONFIG_LOCATIONS.localDir);
    const localConfig = path.join(cwd, CONFIG_LOCATIONS.localConfig);

    // Check if local config directory exists
    const dirExists = await fileExists(localDir);
    if (!dirExists) {
      return {
        check: this.name,
        status: 'pass',
        message: 'No local project configuration (using global)',
        details: `Checked: ${localDir}`,
      };
    }

    // Check if local config file exists
    if (!(await fileExists(localConfig))) {
      return {
        check: this.name,
        status: 'pass',
        message: 'Local config directory exists but no config file',
        details: 'Using global configuration',
      };
    }

    // Validate local config
    const result = await parseJsonFile(localConfig);
    if (!result.valid) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Local config file has errors',
        details: result.error,
        suggestion: 'Fix or remove the local config file',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Local project configuration is valid',
      details: `Location: ${localConfig}`,
    };
  }
}

/**
 * Check environment variables
 */
export class EnvVarsCheck implements DiagnosticCheck {
  name = 'env-vars';
  description = 'Check relevant environment variables';
  category: DiagnosticCategory = 'configuration';

  private envVars = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'CLAUDE_MODEL',
    'CLAUDE_BASE_URL',
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_LOG_LEVEL',
    'NO_COLOR',
    'FORCE_COLOR',
  ];

  async run(): Promise<DiagnosticResult> {
    const set: string[] = [];
    const notSet: string[] = [];

    for (const varName of this.envVars) {
      if (process.env[varName]) {
        set.push(varName);
      } else {
        notSet.push(varName);
      }
    }

    if (set.length === 0) {
      return {
        check: this.name,
        status: 'pass',
        message: 'No Claude-specific environment variables set',
        details: 'Using default configuration',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: `${set.length} environment variable(s) configured`,
      details: `Set: ${set.join(', ')}`,
    };
  }
}

/**
 * All configuration checks combined
 */
export const configChecks: DiagnosticCheck[] = [
  new GlobalConfigCheck(),
  new RequiredSettingsCheck(),
  new ApiKeyConfigCheck(),
  new LocalConfigCheck(),
  new EnvVarsCheck(),
];
