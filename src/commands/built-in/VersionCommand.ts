/**
 * Version Command
 * Displays version information
 */

import type { Command, CommandArgs, CommandContext, CommandResult } from '../types';
import { VERSION, APP_NAME, BUILD_TIME } from '../../config';

/**
 * Version command - Shows version and build information
 */
export const VersionCommand: Command = {
  name: 'version',
  aliases: ['v'],
  description: 'Show version information',
  usage: '/version [--json]',
  examples: [
    '/version',
    '/version --json',
  ],
  options: [
    {
      name: 'json',
      short: 'j',
      description: 'Output version info as JSON',
      type: 'boolean',
      default: false,
    },
    {
      name: 'verbose',
      short: 'V',
      description: 'Show detailed version information',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(args: CommandArgs, context: CommandContext): Promise<CommandResult> {
    const { options } = args;
    const { output } = context;

    const asJson = options.json as boolean;
    const verbose = options.verbose as boolean;

    const versionInfo = getVersionInfo(verbose);

    if (asJson) {
      output(JSON.stringify(versionInfo, null, 2));
    } else {
      output(formatVersionInfo(versionInfo, verbose));
    }

    return {
      success: true,
      data: versionInfo,
    };
  },
};

/**
 * Collect version information
 */
function getVersionInfo(verbose: boolean): VersionInfo {
  const basic: VersionInfo = {
    name: APP_NAME,
    version: VERSION,
    buildTime: BUILD_TIME,
  };

  if (verbose) {
    return {
      ...basic,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };
  }

  return basic;
}

/**
 * Format version information for display
 */
function formatVersionInfo(info: VersionInfo, verbose: boolean): string {
  const lines: string[] = [];

  lines.push(`${info.name} v${info.version}`);
  lines.push(`Build: ${info.buildTime}`);

  if (verbose && info.node) {
    lines.push('');
    lines.push('Environment:');
    lines.push(`  Node.js:  ${info.node}`);
    lines.push(`  Platform: ${info.platform} (${info.arch})`);
    lines.push(`  PID:      ${info.pid}`);
    lines.push(`  Uptime:   ${formatUptime(info.uptime || 0)}`);

    if (info.memory) {
      lines.push('');
      lines.push('Memory:');
      lines.push(`  Heap Used:  ${info.memory.heapUsed} MB`);
      lines.push(`  Heap Total: ${info.memory.heapTotal} MB`);
    }

    lines.push('');
    lines.push('Paths:');
    lines.push(`  CWD: ${info.cwd}`);
  }

  return lines.join('\n');
}

/**
 * Format uptime as human-readable string
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${secs}s`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours < 24) {
    return `${hours}h ${mins}m ${secs}s`;
  }

  const days = Math.floor(hours / 24);
  const hrs = hours % 24;

  return `${days}d ${hrs}h ${mins}m`;
}

/**
 * Version information structure
 */
interface VersionInfo {
  name: string;
  version: string;
  buildTime: string;
  node?: string;
  platform?: string;
  arch?: string;
  cwd?: string;
  pid?: number;
  uptime?: number;
  memory?: {
    heapUsed: number;
    heapTotal: number;
  };
}

export default VersionCommand;
