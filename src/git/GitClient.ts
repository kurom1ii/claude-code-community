/**
 * Git Client
 * Core class for executing git operations
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

import {
  GitStatus,
  GitCommit,
  GitDiff,
  GitBranch,
  GitRemote,
  BlameInfo,
  LogOptions,
  DiffOptions,
  CommitOptions,
  GitError,
} from './types.js';
import { GitParser } from './GitParser.js';
import { findGitRoot, escapeGitArg, normalizeGitPath } from './GitUtils.js';

const execAsync = promisify(exec);

/**
 * Maximum buffer size for git command output (50MB)
 */
const MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Git client for executing git operations
 */
export class GitClient {
  private workingDir: string;
  private gitDir: string | null = null;

  /**
   * Create a new GitClient instance
   * @param workingDir - Working directory for git operations
   */
  constructor(workingDir: string) {
    this.workingDir = path.resolve(workingDir);
  }

  /**
   * Execute a git command
   * @param args - Git command arguments
   * @returns Command output
   */
  private async exec(args: string[]): Promise<string> {
    const command = `git ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: MAX_BUFFER,
        env: {
          ...process.env,
          // Prevent git from prompting for credentials
          GIT_TERMINAL_PROMPT: '0',
          // Use English for parsing
          LANG: 'C',
          LC_ALL: 'C',
        },
      });

      return stdout;
    } catch (error: any) {
      const exitCode = error.code || 1;
      const stderr = error.stderr || '';
      const message = stderr || error.message || 'Git command failed';

      throw new GitError(message, command, exitCode, stderr);
    }
  }

  /**
   * Execute a git command with streaming output
   * @param args - Git command arguments
   * @param onData - Callback for each data chunk
   */
  private async execStream(
    args: string[],
    onData?: (data: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: this.workingDir,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          LANG: 'C',
          LC_ALL: 'C',
        },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        onData?.(str);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new GitError(
            stderr || 'Git command failed',
            `git ${args.join(' ')}`,
            code || 1,
            stderr
          ));
        }
      });

      child.on('error', (error) => {
        reject(new GitError(
          error.message,
          `git ${args.join(' ')}`,
          1,
          error.message
        ));
      });
    });
  }

  /**
   * Check if the working directory is inside a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.exec(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the git repository root directory
   */
  async getGitRoot(): Promise<string> {
    if (this.gitDir) return this.gitDir;

    const output = await this.exec(['rev-parse', '--show-toplevel']);
    this.gitDir = output.trim();
    return this.gitDir;
  }

  /**
   * Get the current repository status
   */
  async getStatus(): Promise<GitStatus> {
    try {
      // Try porcelain v2 format first (more structured)
      const output = await this.exec(['status', '--porcelain=v2', '-b', '--untracked-files']);
      return GitParser.parseStatus(output);
    } catch {
      // Fall back to short format
      const output = await this.exec(['status', '--short', '--branch', '--untracked-files']);
      const status = GitParser.parseStatusShort(output);

      // Get branch name separately
      try {
        status.branch = await this.getCurrentBranch();
      } catch {
        status.branch = 'HEAD (detached)';
      }

      return status;
    }
  }

  /**
   * Get list of branches
   * @param includeRemote - Include remote branches
   */
  async getBranches(includeRemote: boolean = false): Promise<GitBranch[]> {
    const args = ['branch', '-vv'];
    if (includeRemote) {
      args.push('-a');
    }

    const output = await this.exec(args);
    return GitParser.parseBranches(output);
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const output = await this.exec(['symbolic-ref', '--short', 'HEAD']);
      return output.trim();
    } catch {
      // Detached HEAD state - return short hash
      const output = await this.exec(['rev-parse', '--short', 'HEAD']);
      return output.trim();
    }
  }

  /**
   * Get commit log
   * @param options - Log options
   */
  async getLog(options: LogOptions = {}): Promise<GitCommit[]> {
    const args = [
      'log',
      `--format=%H|%h|%an|%ae|%at|%s%x00%b%x00`,
    ];

    if (options.maxCount) {
      args.push(`-n${options.maxCount}`);
    }

    if (options.skip) {
      args.push(`--skip=${options.skip}`);
    }

    if (options.since) {
      const since = options.since instanceof Date
        ? options.since.toISOString()
        : options.since;
      args.push(`--since=${since}`);
    }

    if (options.until) {
      const until = options.until instanceof Date
        ? options.until.toISOString()
        : options.until;
      args.push(`--until=${until}`);
    }

    if (options.author) {
      args.push(`--author=${options.author}`);
    }

    if (options.grep) {
      args.push(`--grep=${options.grep}`);
    }

    if (options.ref) {
      args.push(options.ref);
    }

    if (options.path) {
      args.push('--', options.path);
    }

    const output = await this.exec(args);
    return GitParser.parseLog(output);
  }

  /**
   * Get diff for changes
   * @param options - Diff options
   */
  async getDiff(options: DiffOptions = {}): Promise<GitDiff[]> {
    const args = ['diff'];

    if (options.staged) {
      args.push('--cached');
    }

    if (options.context !== undefined) {
      args.push(`-U${options.context}`);
    }

    if (options.ref) {
      args.push(options.ref);
    }

    if (options.ref2) {
      args.push(options.ref2);
    }

    if (options.files && options.files.length > 0) {
      args.push('--');
      args.push(...options.files);
    }

    const output = await this.exec(args);
    return GitParser.parseDiff(output);
  }

  /**
   * Stage files for commit
   * @param files - Files to stage (empty array for all files)
   */
  async stage(files: string[]): Promise<void> {
    if (files.length === 0) {
      await this.exec(['add', '-A']);
    } else {
      await this.exec(['add', '--', ...files.map(normalizeGitPath)]);
    }
  }

  /**
   * Unstage files
   * @param files - Files to unstage (empty array for all files)
   */
  async unstage(files: string[]): Promise<void> {
    if (files.length === 0) {
      await this.exec(['reset', 'HEAD']);
    } else {
      await this.exec(['reset', 'HEAD', '--', ...files.map(normalizeGitPath)]);
    }
  }

  /**
   * Create a commit
   * @param message - Commit message
   * @param options - Commit options
   * @returns The created commit
   */
  async commit(message: string, options: CommitOptions = {}): Promise<GitCommit> {
    const args = ['commit', '-m', message];

    if (options.amend) {
      args.push('--amend');
    }

    if (options.allowEmpty) {
      args.push('--allow-empty');
    }

    if (options.author) {
      args.push(`--author=${options.author}`);
    }

    if (options.noVerify) {
      args.push('--no-verify');
    }

    if (options.signoff) {
      args.push('--signoff');
    }

    await this.exec(args);

    // Get the created commit
    const log = await this.getLog({ maxCount: 1 });
    return log[0];
  }

  /**
   * Checkout a branch or create a new one
   * @param branch - Branch name
   * @param create - Create the branch if it doesn't exist
   */
  async checkout(branch: string, create: boolean = false): Promise<void> {
    const args = ['checkout'];

    if (create) {
      args.push('-b');
    }

    args.push(branch);
    await this.exec(args);
  }

  /**
   * Get list of remotes
   */
  async getRemotes(): Promise<GitRemote[]> {
    const output = await this.exec(['remote', '-v']);
    return GitParser.parseRemotes(output);
  }

  /**
   * Fetch from remote
   * @param remote - Remote name (default: all remotes)
   */
  async fetch(remote?: string): Promise<void> {
    const args = ['fetch'];

    if (remote) {
      args.push(remote);
    } else {
      args.push('--all');
    }

    await this.exec(args);
  }

  /**
   * Pull from remote
   * @param remote - Remote name
   * @param branch - Branch name
   */
  async pull(remote?: string, branch?: string): Promise<void> {
    const args = ['pull'];

    if (remote) {
      args.push(remote);
      if (branch) {
        args.push(branch);
      }
    }

    await this.exec(args);
  }

  /**
   * Push to remote
   * @param remote - Remote name
   * @param branch - Branch name
   * @param force - Force push
   */
  async push(
    remote?: string,
    branch?: string,
    options: { force?: boolean; setUpstream?: boolean } = {}
  ): Promise<void> {
    const args = ['push'];

    if (options.setUpstream) {
      args.push('-u');
    }

    if (options.force) {
      args.push('--force');
    }

    if (remote) {
      args.push(remote);
      if (branch) {
        args.push(branch);
      }
    }

    await this.exec(args);
  }

  /**
   * Get commit history for a specific file
   * @param file - File path
   */
  async getFileHistory(file: string): Promise<GitCommit[]> {
    return this.getLog({ path: normalizeGitPath(file) });
  }

  /**
   * Get blame information for a file
   * @param file - File path
   */
  async blame(file: string): Promise<BlameInfo[]> {
    const output = await this.exec([
      'blame',
      '--porcelain',
      normalizeGitPath(file),
    ]);
    return GitParser.parseBlame(output);
  }

  /**
   * Create a new branch
   * @param name - Branch name
   * @param startPoint - Starting point (commit, branch, or tag)
   */
  async createBranch(name: string, startPoint?: string): Promise<void> {
    const args = ['branch', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await this.exec(args);
  }

  /**
   * Delete a branch
   * @param name - Branch name
   * @param force - Force delete
   */
  async deleteBranch(name: string, force: boolean = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.exec(['branch', flag, name]);
  }

  /**
   * Merge a branch
   * @param branch - Branch to merge
   * @param options - Merge options
   */
  async merge(
    branch: string,
    options: { noFastForward?: boolean; squash?: boolean; message?: string } = {}
  ): Promise<void> {
    const args = ['merge'];

    if (options.noFastForward) {
      args.push('--no-ff');
    }

    if (options.squash) {
      args.push('--squash');
    }

    if (options.message) {
      args.push('-m', options.message);
    }

    args.push(branch);
    await this.exec(args);
  }

  /**
   * Rebase onto another branch
   * @param onto - Branch or commit to rebase onto
   */
  async rebase(onto: string): Promise<void> {
    await this.exec(['rebase', onto]);
  }

  /**
   * Abort current rebase
   */
  async rebaseAbort(): Promise<void> {
    await this.exec(['rebase', '--abort']);
  }

  /**
   * Continue current rebase
   */
  async rebaseContinue(): Promise<void> {
    await this.exec(['rebase', '--continue']);
  }

  /**
   * Stash changes
   * @param message - Stash message
   * @param includeUntracked - Include untracked files
   */
  async stash(message?: string, includeUntracked: boolean = false): Promise<void> {
    const args = ['stash', 'push'];

    if (includeUntracked) {
      args.push('-u');
    }

    if (message) {
      args.push('-m', message);
    }

    await this.exec(args);
  }

  /**
   * Apply stash
   * @param index - Stash index (default: 0)
   * @param drop - Drop stash after applying
   */
  async stashPop(index: number = 0, drop: boolean = true): Promise<void> {
    const command = drop ? 'pop' : 'apply';
    await this.exec(['stash', command, `stash@{${index}}`]);
  }

  /**
   * List stashes
   */
  async stashList(): Promise<string[]> {
    const output = await this.exec(['stash', 'list']);
    return output.split('\n').filter(line => line.trim());
  }

  /**
   * Reset to a specific commit
   * @param ref - Commit reference
   * @param mode - Reset mode
   */
  async reset(ref: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> {
    await this.exec(['reset', `--${mode}`, ref]);
  }

  /**
   * Revert a commit
   * @param ref - Commit reference
   */
  async revert(ref: string): Promise<void> {
    await this.exec(['revert', '--no-edit', ref]);
  }

  /**
   * Cherry-pick a commit
   * @param ref - Commit reference
   */
  async cherryPick(ref: string): Promise<void> {
    await this.exec(['cherry-pick', ref]);
  }

  /**
   * Create a tag
   * @param name - Tag name
   * @param message - Tag message (creates annotated tag)
   * @param ref - Commit to tag (default: HEAD)
   */
  async createTag(name: string, message?: string, ref?: string): Promise<void> {
    const args = ['tag'];

    if (message) {
      args.push('-a', name, '-m', message);
    } else {
      args.push(name);
    }

    if (ref) {
      args.push(ref);
    }

    await this.exec(args);
  }

  /**
   * Delete a tag
   * @param name - Tag name
   */
  async deleteTag(name: string): Promise<void> {
    await this.exec(['tag', '-d', name]);
  }

  /**
   * List tags
   */
  async getTags(): Promise<string[]> {
    const output = await this.exec(['tag', '-l']);
    return output.split('\n').filter(line => line.trim());
  }

  /**
   * Get the content of a file at a specific revision
   * @param file - File path
   * @param ref - Commit reference (default: HEAD)
   */
  async showFile(file: string, ref: string = 'HEAD'): Promise<string> {
    return this.exec(['show', `${ref}:${normalizeGitPath(file)}`]);
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      await this.exec(['diff-index', '--quiet', 'HEAD', '--']);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Get the hash of a reference
   * @param ref - Reference (branch, tag, or commit)
   */
  async resolveRef(ref: string): Promise<string> {
    const output = await this.exec(['rev-parse', ref]);
    return output.trim();
  }

  /**
   * Clean untracked files
   * @param directories - Also remove directories
   * @param force - Force clean
   */
  async clean(directories: boolean = false, force: boolean = false): Promise<void> {
    const args = ['clean'];

    if (force) {
      args.push('-f');
    }

    if (directories) {
      args.push('-d');
    }

    await this.exec(args);
  }

  /**
   * Get configuration value
   * @param key - Configuration key
   */
  async getConfig(key: string): Promise<string | null> {
    try {
      const output = await this.exec(['config', '--get', key]);
      return output.trim();
    } catch {
      return null;
    }
  }

  /**
   * Set configuration value
   * @param key - Configuration key
   * @param value - Configuration value
   * @param global - Set globally
   */
  async setConfig(key: string, value: string, global: boolean = false): Promise<void> {
    const args = ['config'];

    if (global) {
      args.push('--global');
    }

    args.push(key, value);
    await this.exec(args);
  }

  /**
   * Add a remote
   * @param name - Remote name
   * @param url - Remote URL
   */
  async addRemote(name: string, url: string): Promise<void> {
    await this.exec(['remote', 'add', name, url]);
  }

  /**
   * Remove a remote
   * @param name - Remote name
   */
  async removeRemote(name: string): Promise<void> {
    await this.exec(['remote', 'remove', name]);
  }

  /**
   * Initialize a new repository
   * @param bare - Create a bare repository
   */
  async init(bare: boolean = false): Promise<void> {
    const args = ['init'];

    if (bare) {
      args.push('--bare');
    }

    await this.exec(args);
  }

  /**
   * Clone a repository
   * @param url - Repository URL
   * @param directory - Target directory
   * @param options - Clone options
   */
  async clone(
    url: string,
    directory?: string,
    options: { depth?: number; branch?: string } = {}
  ): Promise<void> {
    const args = ['clone'];

    if (options.depth) {
      args.push('--depth', options.depth.toString());
    }

    if (options.branch) {
      args.push('-b', options.branch);
    }

    args.push(url);

    if (directory) {
      args.push(directory);
    }

    await this.exec(args);
  }
}

export default GitClient;
