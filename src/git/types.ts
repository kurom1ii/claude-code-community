/**
 * Git Operations Types
 * Type definitions for git-related data structures
 */

/**
 * File change status in git
 */
export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

/**
 * Represents a file change in the repository
 */
export interface FileChange {
  /** Path to the file */
  path: string;
  /** Type of change */
  status: FileChangeStatus;
  /** Original path for renamed/copied files */
  oldPath?: string;
}

/**
 * Current git repository status
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Number of commits ahead of upstream */
  ahead: number;
  /** Number of commits behind upstream */
  behind: number;
  /** Files staged for commit */
  staged: FileChange[];
  /** Modified files not staged */
  unstaged: FileChange[];
  /** Untracked files */
  untracked: string[];
  /** Whether there are merge conflicts */
  hasConflicts: boolean;
}

/**
 * Git commit information
 */
export interface GitCommit {
  /** Full commit hash */
  hash: string;
  /** Short commit hash (7 characters) */
  shortHash: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Commit date */
  date: Date;
  /** Full commit message */
  message: string;
  /** First line of commit message */
  subject: string;
  /** Commit body (message without subject) */
  body?: string;
}

/**
 * Git branch information
 */
export interface GitBranch {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Remote name if this is a remote branch */
  remote?: string;
  /** Upstream branch name */
  upstream?: string;
  /** Hash of the last commit on this branch */
  lastCommit?: string;
}

/**
 * A single hunk in a diff
 */
export interface DiffHunk {
  /** Starting line in the old file */
  oldStart: number;
  /** Number of lines in the old file */
  oldLines: number;
  /** Starting line in the new file */
  newStart: number;
  /** Number of lines in the new file */
  newLines: number;
  /** The actual diff content */
  content: string;
}

/**
 * Diff information for a single file
 */
export interface GitDiff {
  /** File path */
  file: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Diff hunks */
  hunks: DiffHunk[];
}

/**
 * Git remote configuration
 */
export interface GitRemote {
  /** Remote name (e.g., 'origin') */
  name: string;
  /** Remote URL */
  url: string;
  /** Remote type */
  type: 'fetch' | 'push';
}

/**
 * Blame information for a single line
 */
export interface BlameInfo {
  /** Commit hash that last modified this line */
  hash: string;
  /** Author of the change */
  author: string;
  /** Author email */
  email: string;
  /** Date of the change */
  date: Date;
  /** Line number */
  lineNumber: number;
  /** Line content */
  content: string;
}

/**
 * Options for git log command
 */
export interface LogOptions {
  /** Maximum number of commits to retrieve */
  maxCount?: number;
  /** Skip this many commits from the start */
  skip?: number;
  /** Only show commits after this date */
  since?: Date | string;
  /** Only show commits before this date */
  until?: Date | string;
  /** Only show commits by this author */
  author?: string;
  /** Only show commits matching this grep pattern */
  grep?: string;
  /** Branch or commit to start from */
  ref?: string;
  /** File path to filter commits by */
  path?: string;
}

/**
 * Options for git diff command
 */
export interface DiffOptions {
  /** Compare against this ref */
  ref?: string;
  /** Compare two refs */
  ref2?: string;
  /** Only show diff for staged changes */
  staged?: boolean;
  /** Specific files to diff */
  files?: string[];
  /** Number of context lines */
  context?: number;
}

/**
 * Options for git commit
 */
export interface CommitOptions {
  /** Amend the previous commit */
  amend?: boolean;
  /** Allow empty commits */
  allowEmpty?: boolean;
  /** Author override */
  author?: string;
  /** Skip pre-commit hooks */
  noVerify?: boolean;
  /** Sign the commit with GPG */
  signoff?: boolean;
}

/**
 * Git error with additional context
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr: string
  ) {
    super(message);
    this.name = 'GitError';
  }
}
