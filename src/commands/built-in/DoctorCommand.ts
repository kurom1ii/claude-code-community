/**
 * Doctor Command
 * Run diagnostics and health checks
 */

import type { Command, CommandArgs, CommandContext, CommandResult } from '../types';
import { VERSION, getApiKey, CLAUDE_CONFIG_DIR } from '../../config';

/**
 * Diagnostic check result
 */
interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
}

/**
 * Doctor command - Runs system diagnostics
 */
export const DoctorCommand: Command = {
  name: 'doctor',
  aliases: ['diag', 'diagnose'],
  description: 'Run diagnostics and health checks',
  usage: '/doctor [--fix]',
  examples: [
    '/doctor',
    '/doctor --verbose',
    '/doctor --fix',
  ],
  options: [
    {
      name: 'verbose',
      short: 'v',
      description: 'Show detailed diagnostic information',
      type: 'boolean',
      default: false,
    },
    {
      name: 'fix',
      short: 'f',
      description: 'Attempt to fix issues automatically',
      type: 'boolean',
      default: false,
    },
    {
      name: 'json',
      short: 'j',
      description: 'Output results as JSON',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(args: CommandArgs, context: CommandContext): Promise<CommandResult> {
    const { options } = args;
    const { output, cwd } = context;

    const verbose = options.verbose as boolean;
    const autoFix = options.fix as boolean;
    const asJson = options.json as boolean;

    output('Running diagnostics...\n');

    const checks: DiagnosticCheck[] = [];

    // Run all diagnostic checks
    checks.push(await checkApiKey());
    checks.push(await checkNodeVersion());
    checks.push(await checkConfigDirectory());
    checks.push(await checkWorkingDirectory(cwd));
    checks.push(await checkGitRepository(cwd));
    checks.push(await checkDiskSpace());
    checks.push(await checkNetworkConnectivity());

    // Attempt fixes if requested
    if (autoFix) {
      const fixedChecks = await attemptFixes(checks, output);
      // Update checks with fixed results
      for (const fixed of fixedChecks) {
        const index = checks.findIndex((c) => c.name === fixed.name);
        if (index !== -1) {
          checks[index] = fixed;
        }
      }
    }

    // Output results
    if (asJson) {
      output(JSON.stringify({
        version: VERSION,
        timestamp: new Date().toISOString(),
        checks,
        summary: summarizeChecks(checks),
      }, null, 2));
    } else {
      output(formatDiagnosticResults(checks, verbose));
    }

    // Determine overall result
    const failCount = checks.filter((c) => c.status === 'fail').length;
    const warnCount = checks.filter((c) => c.status === 'warn').length;

    return {
      success: failCount === 0,
      message: failCount > 0
        ? `${failCount} issue(s) found`
        : warnCount > 0
          ? `${warnCount} warning(s) found`
          : 'All checks passed',
      exitCode: failCount > 0 ? 1 : 0,
      data: { checks },
    };
  },
};

/**
 * Check API key configuration
 */
async function checkApiKey(): Promise<DiagnosticCheck> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      name: 'API Key',
      status: 'fail',
      message: 'API key not configured',
      details: 'Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable',
    };
  }

  if (!apiKey.startsWith('sk-ant-')) {
    return {
      name: 'API Key',
      status: 'warn',
      message: 'API key format may be incorrect',
      details: 'Expected format: sk-ant-...',
    };
  }

  // Mask the key for display
  const masked = apiKey.slice(0, 10) + '...' + apiKey.slice(-4);

  return {
    name: 'API Key',
    status: 'pass',
    message: `Configured (${masked})`,
  };
}

/**
 * Check Node.js version
 */
async function checkNodeVersion(): Promise<DiagnosticCheck> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (major < 18) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: `Version ${version} is not supported`,
      details: 'Node.js 18 or higher is required',
    };
  }

  if (major < 20) {
    return {
      name: 'Node.js',
      status: 'warn',
      message: `Version ${version} (recommend 20+)`,
      details: 'Consider upgrading to Node.js 20 LTS',
    };
  }

  return {
    name: 'Node.js',
    status: 'pass',
    message: `Version ${version}`,
  };
}

/**
 * Check config directory
 */
async function checkConfigDirectory(): Promise<DiagnosticCheck> {
  try {
    const fs = await import('fs/promises');

    try {
      await fs.access(CLAUDE_CONFIG_DIR);

      const stats = await fs.stat(CLAUDE_CONFIG_DIR);
      if (!stats.isDirectory()) {
        return {
          name: 'Config Directory',
          status: 'fail',
          message: 'Path exists but is not a directory',
          details: CLAUDE_CONFIG_DIR,
        };
      }

      return {
        name: 'Config Directory',
        status: 'pass',
        message: CLAUDE_CONFIG_DIR,
      };
    } catch {
      return {
        name: 'Config Directory',
        status: 'warn',
        message: 'Directory does not exist',
        details: `Will be created at: ${CLAUDE_CONFIG_DIR}`,
      };
    }
  } catch (error) {
    return {
      name: 'Config Directory',
      status: 'fail',
      message: 'Cannot check directory',
      details: (error as Error).message,
    };
  }
}

/**
 * Check working directory
 */
async function checkWorkingDirectory(cwd: string): Promise<DiagnosticCheck> {
  try {
    const fs = await import('fs/promises');

    await fs.access(cwd);
    const stats = await fs.stat(cwd);

    if (!stats.isDirectory()) {
      return {
        name: 'Working Directory',
        status: 'fail',
        message: 'Path is not a directory',
        details: cwd,
      };
    }

    // Check if writable
    try {
      const testFile = `${cwd}/.claude-doctor-test-${Date.now()}`;
      await fs.writeFile(testFile, '');
      await fs.unlink(testFile);
    } catch {
      return {
        name: 'Working Directory',
        status: 'warn',
        message: 'Directory is not writable',
        details: cwd,
      };
    }

    return {
      name: 'Working Directory',
      status: 'pass',
      message: cwd,
    };
  } catch (error) {
    return {
      name: 'Working Directory',
      status: 'fail',
      message: 'Cannot access directory',
      details: (error as Error).message,
    };
  }
}

/**
 * Check if in a git repository
 */
async function checkGitRepository(cwd: string): Promise<DiagnosticCheck> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
    const repoRoot = stdout.trim();

    // Get current branch
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd });
    const branch = branchOutput.trim() || 'detached HEAD';

    return {
      name: 'Git Repository',
      status: 'pass',
      message: `Branch: ${branch}`,
      details: repoRoot,
    };
  } catch {
    return {
      name: 'Git Repository',
      status: 'warn',
      message: 'Not a git repository',
      details: 'Some features may be limited',
    };
  }
}

/**
 * Check available disk space
 */
async function checkDiskSpace(): Promise<DiagnosticCheck> {
  try {
    // This is a simplified check - in production would use proper disk space API
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    if (process.platform === 'win32') {
      // Windows disk space check would go here
      return {
        name: 'Disk Space',
        status: 'pass',
        message: 'Check skipped on Windows',
      };
    }

    const { stdout } = await execAsync('df -h . | tail -1');
    const parts = stdout.trim().split(/\s+/);
    const available = parts[3] || 'unknown';
    const usePercent = parseInt(parts[4] || '0', 10);

    if (usePercent > 95) {
      return {
        name: 'Disk Space',
        status: 'fail',
        message: `Only ${available} available (${usePercent}% used)`,
        details: 'Disk is almost full',
      };
    }

    if (usePercent > 85) {
      return {
        name: 'Disk Space',
        status: 'warn',
        message: `${available} available (${usePercent}% used)`,
        details: 'Consider freeing up space',
      };
    }

    return {
      name: 'Disk Space',
      status: 'pass',
      message: `${available} available`,
    };
  } catch {
    return {
      name: 'Disk Space',
      status: 'warn',
      message: 'Could not check disk space',
    };
  }
}

/**
 * Check network connectivity to Anthropic API
 */
async function checkNetworkConnectivity(): Promise<DiagnosticCheck> {
  try {
    const https = await import('https');

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/',
        method: 'HEAD',
        timeout: 5000,
      }, (res) => {
        resolve({
          name: 'Network',
          status: 'pass',
          message: 'Connected to api.anthropic.com',
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          name: 'Network',
          status: 'fail',
          message: 'Connection timeout',
          details: 'Cannot reach api.anthropic.com',
        });
      });

      req.on('error', (error) => {
        resolve({
          name: 'Network',
          status: 'fail',
          message: 'Connection failed',
          details: error.message,
        });
      });

      req.end();
    });
  } catch (error) {
    return {
      name: 'Network',
      status: 'fail',
      message: 'Network check failed',
      details: (error as Error).message,
    };
  }
}

/**
 * Attempt to fix issues automatically
 */
async function attemptFixes(
  checks: DiagnosticCheck[],
  output: (text: string) => void
): Promise<DiagnosticCheck[]> {
  const fixed: DiagnosticCheck[] = [];

  for (const check of checks) {
    if (check.status !== 'fail' && check.status !== 'warn') {
      continue;
    }

    // Attempt fixes based on check name
    switch (check.name) {
      case 'Config Directory':
        if (check.message.includes('does not exist')) {
          try {
            const fs = await import('fs/promises');
            await fs.mkdir(CLAUDE_CONFIG_DIR, { recursive: true });
            output(`Created config directory: ${CLAUDE_CONFIG_DIR}`);
            fixed.push({
              name: check.name,
              status: 'pass',
              message: 'Created successfully',
              details: CLAUDE_CONFIG_DIR,
            });
          } catch (error) {
            output(`Failed to create config directory: ${(error as Error).message}`);
          }
        }
        break;

      // Add more auto-fix cases as needed
    }
  }

  return fixed;
}

/**
 * Summarize check results
 */
function summarizeChecks(checks: DiagnosticCheck[]): {
  total: number;
  passed: number;
  warnings: number;
  failures: number;
} {
  return {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'pass').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
    failures: checks.filter((c) => c.status === 'fail').length,
  };
}

/**
 * Format diagnostic results for display
 */
function formatDiagnosticResults(checks: DiagnosticCheck[], verbose: boolean): string {
  const lines: string[] = [];

  lines.push('Diagnostic Results');
  lines.push('==================\n');

  const statusIcons = {
    pass: '[OK]',
    warn: '[!!]',
    fail: '[XX]',
  };

  for (const check of checks) {
    const icon = statusIcons[check.status];
    lines.push(`${icon} ${check.name}: ${check.message}`);

    if (verbose && check.details) {
      lines.push(`     ${check.details}`);
    }
  }

  lines.push('');

  // Summary
  const summary = summarizeChecks(checks);
  const summaryParts: string[] = [];

  if (summary.passed > 0) {
    summaryParts.push(`${summary.passed} passed`);
  }
  if (summary.warnings > 0) {
    summaryParts.push(`${summary.warnings} warnings`);
  }
  if (summary.failures > 0) {
    summaryParts.push(`${summary.failures} failed`);
  }

  lines.push(`Summary: ${summaryParts.join(', ')}`);

  return lines.join('\n');
}

export default DoctorCommand;
