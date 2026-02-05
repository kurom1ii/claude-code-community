/**
 * Git Utilities
 * Helper functions for git operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Find the root directory of a git repository
 * @param from - Starting directory to search from
 * @returns The git root directory or null if not in a git repo
 */
export async function findGitRoot(from: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', {
      cwd: from,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Check if a path is inside a git repository
 * @param dirPath - Path to check
 * @returns True if inside a git repository
 */
export async function isInsideGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: dirPath,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default branch name for a repository
 * Checks remote origin's HEAD or falls back to common defaults
 * @param workingDir - Working directory of the repository
 * @returns Default branch name
 */
export async function getDefaultBranch(workingDir?: string): Promise<string> {
  const options = workingDir ? { cwd: workingDir } : {};

  try {
    // Try to get from remote origin
    const { stdout } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD',
      options
    );
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    // Try to get from git config
    try {
      const { stdout } = await execAsync(
        'git config --get init.defaultBranch',
        options
      );
      const branch = stdout.trim();
      if (branch) return branch;
    } catch {
      // Ignore and continue
    }

    // Check for common branch names
    try {
      const { stdout } = await execAsync('git branch -l', options);
      const branches = stdout.split('\n').map(b => b.replace('*', '').trim());

      for (const common of ['main', 'master', 'develop', 'trunk']) {
        if (branches.includes(common)) {
          return common;
        }
      }
    } catch {
      // Ignore and return default
    }

    return 'main';
  }
}

/**
 * Format a commit message with subject and optional body
 * Follows conventional commit message format
 * @param subject - Commit message subject line
 * @param body - Optional commit body
 * @returns Formatted commit message
 */
export function formatCommitMessage(subject: string, body?: string): string {
  // Trim and ensure subject doesn't exceed 72 characters
  let formattedSubject = subject.trim();
  if (formattedSubject.length > 72) {
    formattedSubject = formattedSubject.slice(0, 69) + '...';
  }

  if (!body) {
    return formattedSubject;
  }

  // Wrap body lines at 72 characters
  const wrappedBody = wrapText(body.trim(), 72);

  // Separate subject and body with blank line
  return `${formattedSubject}\n\n${wrappedBody}`;
}

/**
 * Wrap text at specified line length
 * @param text - Text to wrap
 * @param maxLength - Maximum line length
 * @returns Wrapped text
 */
export function wrapText(text: string, maxLength: number): string {
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map(paragraph => {
    // Preserve existing line breaks for lists, code, etc.
    if (paragraph.match(/^[\s*-]|^\d+\./m)) {
      return paragraph;
    }

    const words = paragraph.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }).join('\n\n');
}

/**
 * Check if a string is a valid git commit hash
 * @param str - String to check
 * @returns True if valid hash format
 */
export function isValidCommitHash(str: string): boolean {
  return /^[a-f0-9]{4,40}$/i.test(str);
}

/**
 * Check if a string is a valid branch name
 * @param name - Branch name to validate
 * @returns True if valid branch name
 */
export function isValidBranchName(name: string): boolean {
  // Git branch name rules:
  // - Cannot start with a dot
  // - Cannot contain consecutive dots
  // - Cannot contain special characters
  // - Cannot end with .lock
  // - Cannot contain spaces

  if (!name || name.startsWith('.') || name.endsWith('.lock')) {
    return false;
  }

  if (/\.\./.test(name)) {
    return false;
  }

  if (/[\s~^:?*\[\]\\]/.test(name)) {
    return false;
  }

  if (name.includes('@{')) {
    return false;
  }

  return true;
}

/**
 * Escape a string for use in git commands
 * @param str - String to escape
 * @returns Escaped string
 */
export function escapeGitArg(str: string): string {
  // Escape single quotes and wrap in single quotes
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Parse a git revision range
 * @param range - Revision range string (e.g., "HEAD~5..HEAD")
 * @returns Parsed range object
 */
export function parseRevisionRange(range: string): { from?: string; to?: string } {
  if (range.includes('...')) {
    const [from, to] = range.split('...');
    return { from: from || undefined, to: to || 'HEAD' };
  }

  if (range.includes('..')) {
    const [from, to] = range.split('..');
    return { from: from || undefined, to: to || 'HEAD' };
  }

  return { to: range };
}

/**
 * Get relative time string for a date
 * @param date - Date to format
 * @returns Relative time string
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
}

/**
 * Normalize a file path for git operations
 * Converts backslashes to forward slashes and removes leading ./
 * @param filePath - Path to normalize
 * @returns Normalized path
 */
export function normalizeGitPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

/**
 * Check if a path matches a gitignore pattern
 * @param filePath - Path to check
 * @param pattern - Gitignore pattern
 * @returns True if path matches pattern
 */
export function matchesGitignore(filePath: string, pattern: string): boolean {
  // Convert gitignore pattern to regex
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/\?/g, '[^/]'); // ? matches single char

  // Handle ** (matches everything including /)
  regexPattern = regexPattern.replace(/\[\^\/\]\*\[\^\/\]\*/g, '.*');

  // Handle directory patterns (trailing /)
  if (pattern.endsWith('/')) {
    regexPattern = regexPattern.slice(0, -2) + '(?:/|$)';
  }

  // Handle anchored patterns (starting with /)
  if (pattern.startsWith('/')) {
    regexPattern = '^' + regexPattern.slice(2);
  } else {
    regexPattern = '(?:^|/)' + regexPattern;
  }

  regexPattern += '$';

  try {
    const regex = new RegExp(regexPattern);
    return regex.test(normalizeGitPath(filePath));
  } catch {
    return false;
  }
}

/**
 * Parse .gitignore file content
 * @param content - Content of .gitignore file
 * @returns Array of parsed patterns
 */
export function parseGitignore(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Get short hash from full hash
 * @param hash - Full commit hash
 * @param length - Desired length (default 7)
 * @returns Short hash
 */
export function shortHash(hash: string, length: number = 7): string {
  return hash.slice(0, length);
}

export default {
  findGitRoot,
  isInsideGitRepo,
  getDefaultBranch,
  formatCommitMessage,
  wrapText,
  isValidCommitHash,
  isValidBranchName,
  escapeGitArg,
  parseRevisionRange,
  getRelativeTime,
  normalizeGitPath,
  matchesGitignore,
  parseGitignore,
  shortHash,
};
