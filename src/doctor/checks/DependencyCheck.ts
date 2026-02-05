/**
 * DependencyCheck - Check required dependencies
 * Verifies git, bun/node, and optional tools are available
 */

import { DiagnosticCheck, DiagnosticCategory, DiagnosticResult } from '../types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface BinaryInfo {
  name: string;
  command: string;
  versionFlag: string;
  minVersion?: string;
  required: boolean;
  description: string;
}

const REQUIRED_BINARIES: BinaryInfo[] = [
  {
    name: 'git',
    command: 'git',
    versionFlag: '--version',
    minVersion: '2.0.0',
    required: true,
    description: 'Version control system',
  },
  {
    name: 'node',
    command: 'node',
    versionFlag: '--version',
    minVersion: '18.0.0',
    required: true,
    description: 'Node.js runtime',
  },
];

const OPTIONAL_BINARIES: BinaryInfo[] = [
  {
    name: 'bun',
    command: 'bun',
    versionFlag: '--version',
    required: false,
    description: 'Fast JavaScript runtime (alternative to Node.js)',
  },
  {
    name: 'npm',
    command: 'npm',
    versionFlag: '--version',
    required: false,
    description: 'Node package manager',
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    versionFlag: '--version',
    required: false,
    description: 'Fast, disk space efficient package manager',
  },
  {
    name: 'yarn',
    command: 'yarn',
    versionFlag: '--version',
    required: false,
    description: 'Alternative package manager',
  },
  {
    name: 'curl',
    command: 'curl',
    versionFlag: '--version',
    required: false,
    description: 'Command line HTTP client',
  },
  {
    name: 'jq',
    command: 'jq',
    versionFlag: '--version',
    required: false,
    description: 'JSON processor',
  },
];

/**
 * Parse version from command output
 */
function extractVersion(output: string): string | null {
  // Common patterns: "v1.2.3", "1.2.3", "git version 2.39.0"
  const patterns = [
    /v?(\d+\.\d+\.\d+)/,
    /version (\d+\.\d+\.\d+)/i,
    /(\d+\.\d+\.\d+)/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Compare versions (returns true if actual >= required)
 */
function meetsMinVersion(actual: string, required: string): boolean {
  const actualParts = actual.split('.').map(Number);
  const requiredParts = required.split('.').map(Number);

  for (let i = 0; i < requiredParts.length; i++) {
    const a = actualParts[i] || 0;
    const r = requiredParts[i] || 0;
    if (a > r) return true;
    if (a < r) return false;
  }
  return true;
}

/**
 * Check a single binary
 */
async function checkBinary(
  binary: BinaryInfo
): Promise<{ found: boolean; version: string | null; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `${binary.command} ${binary.versionFlag}`,
      { timeout: 5000 }
    );
    const output = stdout || stderr;
    const version = extractVersion(output);
    return { found: true, version };
  } catch {
    return { found: false, version: null };
  }
}

/**
 * Check Git is installed and configured
 */
export class GitCheck implements DiagnosticCheck {
  name = 'git';
  description = 'Check Git is installed and configured';
  category: DiagnosticCategory = 'dependencies';

  async run(): Promise<DiagnosticResult> {
    const result = await checkBinary(REQUIRED_BINARIES[0]);

    if (!result.found) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Git is not installed',
        suggestion: 'Install Git from https://git-scm.com/',
      };
    }

    // Check if Git is configured
    try {
      const { stdout: userName } = await execAsync('git config user.name', {
        timeout: 5000,
      });
      const { stdout: userEmail } = await execAsync('git config user.email', {
        timeout: 5000,
      });

      const configured = userName.trim() && userEmail.trim();

      if (!configured) {
        return {
          check: this.name,
          status: 'warn',
          message: `Git ${result.version} installed but not fully configured`,
          details: 'User name or email not set',
          suggestion:
            'Run: git config --global user.name "Your Name" && git config --global user.email "you@example.com"',
        };
      }

      return {
        check: this.name,
        status: 'pass',
        message: `Git ${result.version} installed and configured`,
        details: `User: ${userName.trim()} <${userEmail.trim()}>`,
      };
    } catch {
      return {
        check: this.name,
        status: 'warn',
        message: `Git ${result.version} installed but configuration check failed`,
        suggestion: 'Configure Git with user.name and user.email',
      };
    }
  }
}

/**
 * Check Node.js runtime
 */
export class NodeRuntimeCheck implements DiagnosticCheck {
  name = 'node-runtime';
  description = 'Check Node.js runtime is available';
  category: DiagnosticCategory = 'dependencies';

  async run(): Promise<DiagnosticResult> {
    const nodeBinary = REQUIRED_BINARIES.find((b) => b.name === 'node')!;
    const result = await checkBinary(nodeBinary);

    if (!result.found) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Node.js is not installed',
        suggestion: 'Install Node.js from https://nodejs.org/',
      };
    }

    if (
      result.version &&
      nodeBinary.minVersion &&
      !meetsMinVersion(result.version, nodeBinary.minVersion)
    ) {
      return {
        check: this.name,
        status: 'fail',
        message: `Node.js ${result.version} is below minimum required version`,
        details: `Required: ${nodeBinary.minVersion}`,
        suggestion: `Upgrade to Node.js ${nodeBinary.minVersion} or later`,
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: `Node.js ${result.version} is installed`,
    };
  }
}

/**
 * Check optional tools
 */
export class OptionalToolsCheck implements DiagnosticCheck {
  name = 'optional-tools';
  description = 'Check availability of optional tools';
  category: DiagnosticCategory = 'dependencies';

  async run(): Promise<DiagnosticResult> {
    const results = await Promise.all(
      OPTIONAL_BINARIES.map(async (binary) => {
        const result = await checkBinary(binary);
        return {
          name: binary.name,
          found: result.found,
          version: result.version,
          description: binary.description,
        };
      })
    );

    const found = results.filter((r) => r.found);
    const notFound = results.filter((r) => !r.found);

    const foundDetails = found
      .map((r) => `${r.name} ${r.version || '(unknown version)'}`)
      .join(', ');

    const notFoundDetails = notFound.map((r) => r.name).join(', ');

    if (found.length === 0) {
      return {
        check: this.name,
        status: 'warn',
        message: 'No optional tools found',
        details: `Not found: ${notFoundDetails}`,
        suggestion: 'Consider installing bun, npm, or other package managers',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: `${found.length} optional tools available`,
      details: `Found: ${foundDetails}${notFound.length > 0 ? ` | Not found: ${notFoundDetails}` : ''}`,
    };
  }
}

/**
 * Check package managers
 */
export class PackageManagerCheck implements DiagnosticCheck {
  name = 'package-manager';
  description = 'Check at least one package manager is available';
  category: DiagnosticCategory = 'dependencies';

  async run(): Promise<DiagnosticResult> {
    const packageManagers = ['npm', 'pnpm', 'yarn', 'bun'];
    const available: { name: string; version: string }[] = [];

    for (const pm of packageManagers) {
      const binary = OPTIONAL_BINARIES.find((b) => b.name === pm);
      if (binary) {
        const result = await checkBinary(binary);
        if (result.found && result.version) {
          available.push({ name: pm, version: result.version });
        }
      }
    }

    if (available.length === 0) {
      return {
        check: this.name,
        status: 'fail',
        message: 'No package manager found',
        suggestion: 'Install npm (comes with Node.js), pnpm, yarn, or bun',
      };
    }

    const primary = available[0];
    const details = available
      .map((pm) => `${pm.name} ${pm.version}`)
      .join(', ');

    return {
      check: this.name,
      status: 'pass',
      message: `${available.length} package manager(s) available`,
      details: `Available: ${details}`,
    };
  }
}

/**
 * All dependency checks combined
 */
export const dependencyChecks: DiagnosticCheck[] = [
  new GitCheck(),
  new NodeRuntimeCheck(),
  new OptionalToolsCheck(),
  new PackageManagerCheck(),
];
