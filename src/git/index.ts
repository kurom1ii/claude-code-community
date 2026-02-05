/**
 * Git Operations Module
 * Provides git functionality for Claude Code Community
 */

// Export types
export * from './types.js';

// Export classes
export { GitClient } from './GitClient.js';
export { GitParser } from './GitParser.js';

// Export utilities
export * from './GitUtils.js';

// Import for factory function and default export
import { GitClient } from './GitClient.js';
import { GitParser } from './GitParser.js';
import { findGitRoot, isInsideGitRepo } from './GitUtils.js';

/**
 * Options for creating a git client
 */
export interface CreateGitClientOptions {
  /**
   * Working directory for git operations
   * If not provided, uses current working directory
   */
  workingDir?: string;

  /**
   * Whether to find and use the git root directory
   * If true, the client will operate from the repository root
   * Default: false
   */
  useGitRoot?: boolean;
}

/**
 * Create a new GitClient instance
 *
 * @param options - Options for creating the client
 * @returns A new GitClient instance
 * @throws Error if workingDir is not inside a git repository when useGitRoot is true
 *
 * @example
 * ```typescript
 * // Create client for current directory
 * const git = await createGitClient();
 *
 * // Create client for specific directory
 * const git = await createGitClient({ workingDir: '/path/to/repo' });
 *
 * // Create client using repository root
 * const git = await createGitClient({
 *   workingDir: '/path/to/repo/subdir',
 *   useGitRoot: true
 * });
 * ```
 */
export async function createGitClient(
  options: CreateGitClientOptions = {}
): Promise<GitClient> {
  const { workingDir = process.cwd(), useGitRoot = false } = options;

  if (useGitRoot) {
    const gitRoot = await findGitRoot(workingDir);
    if (!gitRoot) {
      throw new Error(`Not a git repository: ${workingDir}`);
    }
    return new GitClient(gitRoot);
  }

  return new GitClient(workingDir);
}

/**
 * Quick check if a directory is inside a git repository
 *
 * @param dirPath - Directory path to check
 * @returns True if the directory is inside a git repository
 *
 * @example
 * ```typescript
 * if (await isGitRepository('/path/to/check')) {
 *   const git = await createGitClient({ workingDir: '/path/to/check' });
 *   // Use git client...
 * }
 * ```
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  return isInsideGitRepo(dirPath);
}

/**
 * Get the root directory of a git repository
 *
 * @param from - Starting directory to search from
 * @returns The git root directory or null if not in a git repo
 *
 * @example
 * ```typescript
 * const root = await getGitRoot('/path/to/repo/subdir');
 * console.log(root); // '/path/to/repo'
 * ```
 */
export async function getGitRoot(from: string): Promise<string | null> {
  return findGitRoot(from);
}

// Default export
export default {
  createGitClient,
  isGitRepository,
  getGitRoot,
  GitClient,
  GitParser,
};
