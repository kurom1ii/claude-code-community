/**
 * PermissionCheck - Check file system permissions
 * Verifies read/write permissions for working dir, config dir, session dir
 */

import { DiagnosticCheck, DiagnosticCategory, DiagnosticResult } from '../types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Check if path is readable
 */
async function isReadable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is writable
 */
async function isWritable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if directory exists
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Test actual write by creating temp file
 */
async function testWrite(dirPath: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const testFile = path.join(dirPath, `.claude-test-${randomUUID()}`);
  try {
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check working directory permissions
 */
export class WorkingDirPermissionCheck implements DiagnosticCheck {
  name = 'working-dir-permission';
  description = 'Check working directory read/write permissions';
  category: DiagnosticCategory = 'permissions';

  async run(): Promise<DiagnosticResult> {
    const cwd = process.cwd();

    // Check if exists
    if (!(await dirExists(cwd))) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Working directory does not exist',
        details: cwd,
      };
    }

    // Check read permission
    const readable = await isReadable(cwd);
    if (!readable) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Cannot read working directory',
        details: cwd,
        suggestion: 'Check directory permissions',
      };
    }

    // Check write permission
    const writable = await isWritable(cwd);
    if (!writable) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Working directory is read-only',
        details: cwd,
        suggestion: 'Some features may not work in read-only mode',
      };
    }

    // Test actual write
    const writeTest = await testWrite(cwd);
    if (!writeTest.success) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Cannot write to working directory',
        details: writeTest.error,
        suggestion: 'Check disk space and permissions',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Working directory has full read/write access',
      details: cwd,
    };
  }
}

/**
 * Check config directory permissions
 */
export class ConfigDirPermissionCheck implements DiagnosticCheck {
  name = 'config-dir-permission';
  description = 'Check config directory permissions';
  category: DiagnosticCategory = 'permissions';

  async run(): Promise<DiagnosticResult> {
    const configDir = path.join(os.homedir(), '.claude-code');

    // Check if exists
    if (!(await dirExists(configDir))) {
      // Try to create it
      try {
        await fs.mkdir(configDir, { recursive: true });
        return {
          check: this.name,
          status: 'pass',
          message: 'Config directory created successfully',
          details: configDir,
        };
      } catch (error) {
        return {
          check: this.name,
          status: 'fail',
          message: 'Cannot create config directory',
          details: `${configDir}: ${error instanceof Error ? error.message : String(error)}`,
          suggestion: 'Check permissions in home directory',
        };
      }
    }

    // Check read permission
    const readable = await isReadable(configDir);
    if (!readable) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Cannot read config directory',
        details: configDir,
        suggestion: 'Check directory permissions',
      };
    }

    // Check write permission
    const writable = await isWritable(configDir);
    if (!writable) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Cannot write to config directory',
        details: configDir,
        suggestion: 'Check directory permissions',
      };
    }

    // Test actual write
    const writeTest = await testWrite(configDir);
    if (!writeTest.success) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Config directory write test failed',
        details: writeTest.error,
        suggestion: 'Check disk space and permissions',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Config directory has full read/write access',
      details: configDir,
    };
  }
}

/**
 * Check session directory permissions
 */
export class SessionDirPermissionCheck implements DiagnosticCheck {
  name = 'session-dir-permission';
  description = 'Check session directory permissions';
  category: DiagnosticCategory = 'permissions';

  async run(): Promise<DiagnosticResult> {
    const sessionDir = path.join(os.homedir(), '.claude-code', 'sessions');

    // Check if exists
    if (!(await dirExists(sessionDir))) {
      // Try to create it
      try {
        await fs.mkdir(sessionDir, { recursive: true });
        return {
          check: this.name,
          status: 'pass',
          message: 'Session directory created successfully',
          details: sessionDir,
        };
      } catch (error) {
        return {
          check: this.name,
          status: 'fail',
          message: 'Cannot create session directory',
          details: `${sessionDir}: ${error instanceof Error ? error.message : String(error)}`,
          suggestion: 'Check permissions in config directory',
        };
      }
    }

    // Check read permission
    const readable = await isReadable(sessionDir);
    if (!readable) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Cannot read session directory',
        details: sessionDir,
        suggestion: 'Check directory permissions',
      };
    }

    // Check write permission
    const writable = await isWritable(sessionDir);
    if (!writable) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Cannot write to session directory',
        details: sessionDir,
        suggestion: 'Check directory permissions',
      };
    }

    // Test actual write
    const writeTest = await testWrite(sessionDir);
    if (!writeTest.success) {
      return {
        check: this.name,
        status: 'fail',
        message: 'Session directory write test failed',
        details: writeTest.error,
        suggestion: 'Check disk space and permissions',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Session directory has full read/write access',
      details: sessionDir,
    };
  }
}

/**
 * Check cache directory permissions
 */
export class CacheDirPermissionCheck implements DiagnosticCheck {
  name = 'cache-dir-permission';
  description = 'Check cache directory permissions';
  category: DiagnosticCategory = 'permissions';

  async run(): Promise<DiagnosticResult> {
    const cacheDir = path.join(os.homedir(), '.claude-code', 'cache');

    // Check if exists
    if (!(await dirExists(cacheDir))) {
      // Try to create it
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        return {
          check: this.name,
          status: 'pass',
          message: 'Cache directory created successfully',
          details: cacheDir,
        };
      } catch (error) {
        return {
          check: this.name,
          status: 'warn',
          message: 'Cannot create cache directory',
          details: `${cacheDir}: ${error instanceof Error ? error.message : String(error)}`,
          suggestion: 'Caching will be disabled',
        };
      }
    }

    // Test write
    const writeTest = await testWrite(cacheDir);
    if (!writeTest.success) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Cache directory write test failed',
        details: writeTest.error,
        suggestion: 'Caching may not work properly',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Cache directory has full read/write access',
      details: cacheDir,
    };
  }
}

/**
 * Check temp directory permissions
 */
export class TempDirPermissionCheck implements DiagnosticCheck {
  name = 'temp-dir-permission';
  description = 'Check temp directory permissions';
  category: DiagnosticCategory = 'permissions';

  async run(): Promise<DiagnosticResult> {
    const tempDir = os.tmpdir();

    // Check if exists
    if (!(await dirExists(tempDir))) {
      return {
        check: this.name,
        status: 'fail',
        message: 'System temp directory does not exist',
        details: tempDir,
      };
    }

    // Test write
    const writeTest = await testWrite(tempDir);
    if (!writeTest.success) {
      return {
        check: this.name,
        status: 'warn',
        message: 'Cannot write to temp directory',
        details: writeTest.error,
        suggestion: 'Some features may not work',
      };
    }

    return {
      check: this.name,
      status: 'pass',
      message: 'Temp directory has write access',
      details: tempDir,
    };
  }
}

/**
 * All permission checks combined
 */
export const permissionChecks: DiagnosticCheck[] = [
  new WorkingDirPermissionCheck(),
  new ConfigDirPermissionCheck(),
  new SessionDirPermissionCheck(),
  new CacheDirPermissionCheck(),
  new TempDirPermissionCheck(),
];
