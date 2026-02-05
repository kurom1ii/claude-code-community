/**
 * SystemCheck - Check system requirements
 * Verifies Node.js version, OS compatibility, disk space, and memory
 */

import { DiagnosticCheck, DiagnosticCategory, DiagnosticResult } from '../types.js';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Minimum requirements
const MIN_NODE_VERSION = '18.0.0';
const MIN_DISK_SPACE_MB = 100;
const MIN_MEMORY_MB = 256;
const RECOMMENDED_MEMORY_MB = 512;

/**
 * Parse version string to comparable numbers
 */
function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/**
 * Compare two version strings
 */
function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const na = va[i] || 0;
    const nb = vb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Check Node.js version
 */
export class NodeVersionCheck implements DiagnosticCheck {
  name = 'node-version';
  description = 'Check Node.js version meets minimum requirements';
  category: DiagnosticCategory = 'system';

  async run(): Promise<DiagnosticResult> {
    const currentVersion = process.version;
    const comparison = compareVersions(currentVersion, MIN_NODE_VERSION);

    if (comparison >= 0) {
      return {
        check: this.name,
        status: 'pass',
        message: `Node.js ${currentVersion} meets requirements`,
        details: `Minimum required: ${MIN_NODE_VERSION}`,
      };
    }

    return {
      check: this.name,
      status: 'fail',
      message: `Node.js ${currentVersion} is below minimum required version`,
      details: `Current: ${currentVersion}, Required: ${MIN_NODE_VERSION}`,
      suggestion: `Upgrade Node.js to version ${MIN_NODE_VERSION} or later`,
    };
  }
}

/**
 * Check OS compatibility
 */
export class OSCompatibilityCheck implements DiagnosticCheck {
  name = 'os-compatibility';
  description = 'Check operating system compatibility';
  category: DiagnosticCategory = 'system';

  async run(): Promise<DiagnosticResult> {
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();

    const supportedPlatforms = ['darwin', 'linux', 'win32'];
    const supportedArchs = ['x64', 'arm64'];

    const isPlatformSupported = supportedPlatforms.includes(platform);
    const isArchSupported = supportedArchs.includes(arch);

    if (isPlatformSupported && isArchSupported) {
      return {
        check: this.name,
        status: 'pass',
        message: `${platform} ${arch} is fully supported`,
        details: `OS: ${platform} ${release}, Architecture: ${arch}`,
      };
    }

    if (isPlatformSupported && !isArchSupported) {
      return {
        check: this.name,
        status: 'warn',
        message: `${arch} architecture may have limited support`,
        details: `Platform: ${platform}, Architecture: ${arch}`,
        suggestion: `Consider using x64 or arm64 for best compatibility`,
      };
    }

    return {
      check: this.name,
      status: 'warn',
      message: `${platform} is not officially supported`,
      details: `Supported platforms: ${supportedPlatforms.join(', ')}`,
      suggestion: 'Some features may not work correctly on this platform',
    };
  }
}

/**
 * Check available disk space
 */
export class DiskSpaceCheck implements DiagnosticCheck {
  name = 'disk-space';
  description = 'Check available disk space';
  category: DiagnosticCategory = 'system';

  async run(): Promise<DiagnosticResult> {
    try {
      const homedir = os.homedir();
      let availableMB: number;

      if (process.platform === 'win32') {
        // Windows: use wmic
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${homedir.charAt(0)}:'" get FreeSpace`
        );
        const freeSpace = parseInt(stdout.split('\n')[1].trim(), 10);
        availableMB = freeSpace / (1024 * 1024);
      } else {
        // Unix: use df
        const { stdout } = await execAsync(`df -m "${homedir}" | tail -1`);
        const parts = stdout.trim().split(/\s+/);
        availableMB = parseInt(parts[3], 10);
      }

      if (availableMB >= MIN_DISK_SPACE_MB) {
        return {
          check: this.name,
          status: 'pass',
          message: `${Math.round(availableMB)} MB available disk space`,
          details: `Minimum required: ${MIN_DISK_SPACE_MB} MB`,
        };
      }

      return {
        check: this.name,
        status: 'warn',
        message: `Low disk space: ${Math.round(availableMB)} MB available`,
        details: `Minimum recommended: ${MIN_DISK_SPACE_MB} MB`,
        suggestion: 'Free up disk space to avoid issues with caching and sessions',
      };
    } catch (error) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Could not determine disk space',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Check available memory
 */
export class MemoryCheck implements DiagnosticCheck {
  name = 'memory';
  description = 'Check available system memory';
  category: DiagnosticCategory = 'system';

  async run(): Promise<DiagnosticResult> {
    const totalMemMB = os.totalmem() / (1024 * 1024);
    const freeMemMB = os.freemem() / (1024 * 1024);

    if (freeMemMB >= RECOMMENDED_MEMORY_MB) {
      return {
        check: this.name,
        status: 'pass',
        message: `${Math.round(freeMemMB)} MB free of ${Math.round(totalMemMB)} MB total`,
        details: `Recommended free memory: ${RECOMMENDED_MEMORY_MB} MB`,
      };
    }

    if (freeMemMB >= MIN_MEMORY_MB) {
      return {
        check: this.name,
        status: 'warn',
        message: `${Math.round(freeMemMB)} MB free memory (below recommended)`,
        details: `Total: ${Math.round(totalMemMB)} MB, Recommended free: ${RECOMMENDED_MEMORY_MB} MB`,
        suggestion: 'Close unused applications to improve performance',
      };
    }

    return {
      check: this.name,
      status: 'fail',
      message: `Only ${Math.round(freeMemMB)} MB free memory`,
      details: `Minimum required: ${MIN_MEMORY_MB} MB`,
      suggestion: 'Close applications or increase system memory',
    };
  }
}

/**
 * All system checks combined
 */
export const systemChecks: DiagnosticCheck[] = [
  new NodeVersionCheck(),
  new OSCompatibilityCheck(),
  new DiskSpaceCheck(),
  new MemoryCheck(),
];
