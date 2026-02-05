/**
 * Path Validator
 *
 * Validates file paths against allowed/blocked directories,
 * prevents path traversal attacks, and checks for symlink escapes.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  PathValidationResult,
  RiskLevel,
  PermissionConfig,
} from './types.js';
import { SensitiveFileDetector } from './SensitiveFileDetector.js';

/**
 * Configuration for the path validator
 */
export interface PathValidatorConfig {
  /** Allowed directories (paths within these are allowed) */
  allowedDirs: string[];
  /** Blocked directories (paths within these are denied) */
  blockedDirs: string[];
  /** Whether to allow symlinks (default: false) */
  allowSymlinks?: boolean;
  /** Maximum path depth from base directory */
  maxPathDepth?: number;
  /** Base directory for relative path resolution */
  baseDir?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Sensitive file detector instance */
  sensitiveFileDetector?: SensitiveFileDetector;
}

/**
 * Validates file paths for security and access control
 */
export class PathValidator {
  private allowedDirs: Set<string>;
  private blockedDirs: Set<string>;
  private allowSymlinks: boolean;
  private maxPathDepth: number;
  private baseDir: string;
  private debug: boolean;
  private sensitiveDetector: SensitiveFileDetector;

  constructor(config: PathValidatorConfig) {
    this.allowedDirs = new Set(config.allowedDirs.map(d => this.normalizePath(d)));
    this.blockedDirs = new Set(config.blockedDirs.map(d => this.normalizePath(d)));
    this.allowSymlinks = config.allowSymlinks ?? false;
    this.maxPathDepth = config.maxPathDepth ?? 20;
    this.baseDir = config.baseDir ?? process.cwd();
    this.debug = config.debug ?? false;
    this.sensitiveDetector = config.sensitiveFileDetector ?? new SensitiveFileDetector();
  }

  /**
   * Create from PermissionConfig
   */
  static fromConfig(config: PermissionConfig, baseDir?: string): PathValidator {
    return new PathValidator({
      allowedDirs: config.allowedDirs,
      blockedDirs: config.blockedDirs,
      allowSymlinks: config.allowSymlinks,
      maxPathDepth: config.maxPathDepth,
      baseDir,
    });
  }

  /**
   * Normalize a path for consistent comparison
   */
  private normalizePath(inputPath: string): string {
    // Resolve to absolute path
    const resolved = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(this.baseDir, inputPath);

    // Normalize path separators and remove trailing slashes
    return path.normalize(resolved).replace(/[\/\\]+$/, '');
  }

  /**
   * Validate a path
   */
  validate(targetPath: string): PathValidationResult {
    try {
      // Normalize the input path
      const normalizedPath = this.normalizePath(targetPath);

      if (this.debug) {
        console.log(`[PathValidator] Validating: ${targetPath} -> ${normalizedPath}`);
      }

      // Check for path traversal attempts
      const traversalCheck = this.checkPathTraversal(targetPath, normalizedPath);
      if (!traversalCheck.valid) {
        return traversalCheck;
      }

      // Check path depth
      const depthCheck = this.checkPathDepth(normalizedPath);
      if (!depthCheck.valid) {
        return depthCheck;
      }

      // Check for blocked directories
      const blockCheck = this.checkBlockedDirs(normalizedPath);
      if (!blockCheck.valid) {
        return blockCheck;
      }

      // Check for allowed directories (if any are specified)
      const allowCheck = this.checkAllowedDirs(normalizedPath);
      if (!allowCheck.valid) {
        return allowCheck;
      }

      // Check for symlinks if they're not allowed
      const symlinkCheck = this.checkSymlinks(normalizedPath);
      if (!symlinkCheck.valid) {
        return symlinkCheck;
      }

      // Check for sensitive files
      const sensitiveResult = this.sensitiveDetector.isSensitive(normalizedPath);
      const risk = sensitiveResult.isSensitive
        ? this.sensitiveDetector.getRiskLevel(normalizedPath)
        : 'low';

      return {
        valid: true,
        normalizedPath,
        isSensitive: sensitiveResult.isSensitive,
        isBlocked: false,
        risk,
        reason: sensitiveResult.isSensitive
          ? `Sensitive file detected: ${sensitiveResult.reason}`
          : 'Path is valid and allowed',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (this.debug) {
        console.error(`[PathValidator] Error validating path: ${message}`);
      }
      return {
        valid: false,
        reason: `Path validation error: ${message}`,
        risk: 'high',
      };
    }
  }

  /**
   * Check if a path is allowed
   */
  isAllowed(targetPath: string): boolean {
    return this.validate(targetPath).valid;
  }

  /**
   * Check for path traversal attempts
   */
  private checkPathTraversal(originalPath: string, normalizedPath: string): PathValidationResult {
    // Check for obvious traversal patterns in the original path
    const traversalPatterns = [
      /\.\.[\/\\]/,           // ../
      /[\/\\]\.\./,           // /..
      /%2e%2e/i,              // URL-encoded ..
      /%252e%252e/i,          // Double URL-encoded ..
      /\.\.%2f/i,             // Mixed encoding
      /%2f\.\./i,             // Mixed encoding
      /\.\.[\/\\]\.\./,       // Multiple traversals
    ];

    for (const pattern of traversalPatterns) {
      if (pattern.test(originalPath)) {
        if (this.debug) {
          console.log(`[PathValidator] Path traversal pattern detected: ${pattern}`);
        }
        return {
          valid: false,
          reason: 'Path traversal attempt detected',
          risk: 'critical',
        };
      }
    }

    // Check if the normalized path escapes the base directory
    // when the original path is relative
    if (!path.isAbsolute(originalPath)) {
      const resolved = path.resolve(this.baseDir, originalPath);
      if (!resolved.startsWith(this.baseDir)) {
        return {
          valid: false,
          reason: 'Path escapes base directory',
          isBlocked: true,
          risk: 'critical',
        };
      }
    }

    return { valid: true, normalizedPath, risk: 'low' };
  }

  /**
   * Check path depth
   */
  private checkPathDepth(normalizedPath: string): PathValidationResult {
    const parts = normalizedPath.split(path.sep).filter(Boolean);

    if (parts.length > this.maxPathDepth) {
      return {
        valid: false,
        reason: `Path depth (${parts.length}) exceeds maximum (${this.maxPathDepth})`,
        risk: 'medium',
      };
    }

    return { valid: true, normalizedPath, risk: 'low' };
  }

  /**
   * Check if path is in blocked directories
   */
  private checkBlockedDirs(normalizedPath: string): PathValidationResult {
    for (const blockedDir of this.blockedDirs) {
      if (normalizedPath.startsWith(blockedDir + path.sep) || normalizedPath === blockedDir) {
        if (this.debug) {
          console.log(`[PathValidator] Path is in blocked directory: ${blockedDir}`);
        }
        return {
          valid: false,
          normalizedPath,
          reason: `Path is in blocked directory: ${blockedDir}`,
          isBlocked: true,
          risk: 'high',
        };
      }
    }

    return { valid: true, normalizedPath, isBlocked: false, risk: 'low' };
  }

  /**
   * Check if path is in allowed directories
   */
  private checkAllowedDirs(normalizedPath: string): PathValidationResult {
    // If no allowed directories are specified, all non-blocked paths are allowed
    if (this.allowedDirs.size === 0) {
      return { valid: true, normalizedPath, risk: 'low' };
    }

    for (const allowedDir of this.allowedDirs) {
      if (normalizedPath.startsWith(allowedDir + path.sep) || normalizedPath === allowedDir) {
        if (this.debug) {
          console.log(`[PathValidator] Path is in allowed directory: ${allowedDir}`);
        }
        return { valid: true, normalizedPath, risk: 'low' };
      }
    }

    return {
      valid: false,
      normalizedPath,
      reason: 'Path is not in any allowed directory',
      isBlocked: true,
      risk: 'medium',
    };
  }

  /**
   * Check for symlink escapes
   */
  private checkSymlinks(normalizedPath: string): PathValidationResult {
    if (this.allowSymlinks) {
      return { valid: true, normalizedPath, risk: 'low' };
    }

    try {
      // Check if the path or any parent is a symlink
      let currentPath = normalizedPath;
      const checkedPaths: string[] = [];

      while (currentPath && currentPath !== path.dirname(currentPath)) {
        checkedPaths.push(currentPath);

        try {
          const stats = fs.lstatSync(currentPath);

          if (stats.isSymbolicLink()) {
            // Resolve the symlink and check if it escapes allowed directories
            const realPath = fs.realpathSync(currentPath);

            if (this.debug) {
              console.log(`[PathValidator] Symlink found: ${currentPath} -> ${realPath}`);
            }

            // Check if the resolved path is still allowed
            const resolvedCheck = this.checkAllowedDirs(realPath);
            if (!resolvedCheck.valid) {
              return {
                valid: false,
                normalizedPath,
                reason: `Symlink escape detected: ${currentPath} -> ${realPath}`,
                risk: 'critical',
              };
            }

            // Check if resolved path is blocked
            const blockedCheck = this.checkBlockedDirs(realPath);
            if (!blockedCheck.valid) {
              return {
                valid: false,
                normalizedPath,
                reason: `Symlink points to blocked directory: ${currentPath} -> ${realPath}`,
                isBlocked: true,
                risk: 'critical',
              };
            }
          }
        } catch {
          // Path doesn't exist yet, which is fine
          break;
        }

        currentPath = path.dirname(currentPath);
      }

      return { valid: true, normalizedPath, risk: 'low' };
    } catch (error) {
      // If we can't check symlinks, be conservative
      if (this.debug) {
        console.error(`[PathValidator] Error checking symlinks: ${error}`);
      }
      return { valid: true, normalizedPath, risk: 'low' };
    }
  }

  /**
   * Add an allowed directory
   */
  addAllowedDir(dir: string): void {
    this.allowedDirs.add(this.normalizePath(dir));
    if (this.debug) {
      console.log(`[PathValidator] Added allowed directory: ${dir}`);
    }
  }

  /**
   * Add a blocked directory
   */
  addBlockedDir(dir: string): void {
    this.blockedDirs.add(this.normalizePath(dir));
    if (this.debug) {
      console.log(`[PathValidator] Added blocked directory: ${dir}`);
    }
  }

  /**
   * Remove an allowed directory
   */
  removeAllowedDir(dir: string): boolean {
    return this.allowedDirs.delete(this.normalizePath(dir));
  }

  /**
   * Remove a blocked directory
   */
  removeBlockedDir(dir: string): boolean {
    return this.blockedDirs.delete(this.normalizePath(dir));
  }

  /**
   * Get all allowed directories
   */
  getAllowedDirs(): string[] {
    return Array.from(this.allowedDirs);
  }

  /**
   * Get all blocked directories
   */
  getBlockedDirs(): string[] {
    return Array.from(this.blockedDirs);
  }

  /**
   * Validate multiple paths
   */
  validateAll(paths: string[]): Map<string, PathValidationResult> {
    const results = new Map<string, PathValidationResult>();

    for (const p of paths) {
      results.set(p, this.validate(p));
    }

    return results;
  }

  /**
   * Filter paths to only valid ones
   */
  filterValid(paths: string[]): string[] {
    return paths.filter(p => this.validate(p).valid);
  }

  /**
   * Get the real path, resolving symlinks
   */
  getRealPath(targetPath: string): PathValidationResult {
    const validation = this.validate(targetPath);
    if (!validation.valid) {
      return validation;
    }

    try {
      const realPath = fs.realpathSync(validation.normalizedPath!);

      // Validate the real path as well
      return this.validate(realPath);
    } catch (error) {
      // Path doesn't exist, return the normalized path
      return validation;
    }
  }

  /**
   * Check if path is within a specific directory
   */
  isWithin(targetPath: string, directory: string): boolean {
    const normalizedTarget = this.normalizePath(targetPath);
    const normalizedDir = this.normalizePath(directory);

    return normalizedTarget.startsWith(normalizedDir + path.sep) ||
           normalizedTarget === normalizedDir;
  }

  /**
   * Get the relative path from base directory
   */
  getRelativePath(targetPath: string): string | null {
    const validation = this.validate(targetPath);
    if (!validation.valid || !validation.normalizedPath) {
      return null;
    }

    if (validation.normalizedPath.startsWith(this.baseDir)) {
      return path.relative(this.baseDir, validation.normalizedPath);
    }

    return null;
  }

  /**
   * Set the base directory
   */
  setBaseDir(baseDir: string): void {
    this.baseDir = this.normalizePath(baseDir);
    if (this.debug) {
      console.log(`[PathValidator] Base directory set to: ${this.baseDir}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PathValidatorConfig {
    return {
      allowedDirs: this.getAllowedDirs(),
      blockedDirs: this.getBlockedDirs(),
      allowSymlinks: this.allowSymlinks,
      maxPathDepth: this.maxPathDepth,
      baseDir: this.baseDir,
      debug: this.debug,
    };
  }
}
