/**
 * Git Parser
 * Parses output from git commands into structured data
 */

import {
  GitStatus,
  GitCommit,
  GitDiff,
  GitBranch,
  GitRemote,
  BlameInfo,
  FileChange,
  FileChangeStatus,
  DiffHunk,
} from './types.js';

/**
 * Parser for git command output
 */
export class GitParser {
  /**
   * Parse git status --porcelain=v2 -b output
   */
  static parseStatus(output: string): GitStatus {
    const lines = output.split('\n').filter(line => line.length > 0);

    const status: GitStatus = {
      branch: '',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      hasConflicts: false,
    };

    for (const line of lines) {
      // Branch header lines
      if (line.startsWith('# branch.head ')) {
        status.branch = line.slice(14);
      } else if (line.startsWith('# branch.ab ')) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) {
          status.ahead = parseInt(match[1], 10);
          status.behind = parseInt(match[2], 10);
        }
      } else if (line.startsWith('# branch.upstream ')) {
        // Upstream info, we have it in branch
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        // Changed entries
        const parts = line.split(' ');
        const xy = parts[1];
        const stagedStatus = xy[0];
        const unstagedStatus = xy[1];

        // For renamed files, path is at the end after a tab
        let filePath: string;
        let oldPath: string | undefined;

        if (line.startsWith('2 ')) {
          // Renamed/copied entry
          const tabIndex = line.indexOf('\t');
          const pathPart = line.slice(tabIndex + 1);
          const paths = pathPart.split('\t');
          filePath = paths[0];
          oldPath = paths[1];
        } else {
          // Regular entry - path is the last space-separated field
          const tabIndex = line.indexOf('\t');
          if (tabIndex !== -1) {
            filePath = line.slice(tabIndex + 1);
          } else {
            filePath = parts[parts.length - 1];
          }
        }

        // Parse staged changes
        if (stagedStatus !== '.') {
          status.staged.push({
            path: filePath,
            status: this.parseFileStatus(stagedStatus),
            oldPath,
          });
        }

        // Parse unstaged changes
        if (unstagedStatus !== '.') {
          status.unstaged.push({
            path: filePath,
            status: this.parseFileStatus(unstagedStatus),
          });
        }
      } else if (line.startsWith('u ')) {
        // Unmerged entries (conflicts)
        status.hasConflicts = true;
        const parts = line.split('\t');
        if (parts.length > 1) {
          status.unstaged.push({
            path: parts[1],
            status: 'modified',
          });
        }
      } else if (line.startsWith('? ')) {
        // Untracked files
        status.untracked.push(line.slice(2));
      }
    }

    return status;
  }

  /**
   * Parse git status short format output (fallback)
   */
  static parseStatusShort(output: string): GitStatus {
    const lines = output.split('\n').filter(line => line.length > 0);

    const status: GitStatus = {
      branch: '',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      hasConflicts: false,
    };

    for (const line of lines) {
      if (line.length < 3) continue;

      const x = line[0]; // Index status
      const y = line[1]; // Working tree status
      const filePath = line.slice(3).trim();

      // Check for conflicts
      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        status.hasConflicts = true;
      }

      // Untracked files
      if (x === '?' && y === '?') {
        status.untracked.push(filePath);
        continue;
      }

      // Staged changes
      if (x !== ' ' && x !== '?') {
        status.staged.push({
          path: filePath,
          status: this.parseFileStatusShort(x),
        });
      }

      // Unstaged changes
      if (y !== ' ' && y !== '?') {
        status.unstaged.push({
          path: filePath,
          status: this.parseFileStatusShort(y),
        });
      }
    }

    return status;
  }

  /**
   * Parse porcelain v2 file status character
   */
  private static parseFileStatus(char: string): FileChangeStatus {
    switch (char) {
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case 'M':
      default: return 'modified';
    }
  }

  /**
   * Parse short format file status character
   */
  private static parseFileStatusShort(char: string): FileChangeStatus {
    switch (char) {
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case 'M':
      case 'T':
      default: return 'modified';
    }
  }

  /**
   * Parse git log output with custom format
   * Expected format: hash|shortHash|author|email|timestamp|subject|body
   */
  static parseLog(output: string): GitCommit[] {
    if (!output.trim()) return [];

    const commits: GitCommit[] = [];
    // Split by record separator if using %x00, otherwise by double newline
    const entries = output.includes('\x00')
      ? output.split('\x00').filter(e => e.trim())
      : output.split('\n\n').filter(e => e.trim());

    for (const entry of entries) {
      const lines = entry.split('\n');
      const firstLine = lines[0];
      const parts = firstLine.split('|');

      if (parts.length < 6) continue;

      const [hash, shortHash, author, email, timestamp, ...subjectParts] = parts;
      const subject = subjectParts.join('|'); // Subject might contain |
      const body = lines.slice(1).join('\n').trim() || undefined;

      commits.push({
        hash: hash.trim(),
        shortHash: shortHash.trim(),
        author: author.trim(),
        email: email.trim(),
        date: new Date(parseInt(timestamp.trim(), 10) * 1000),
        message: body ? `${subject}\n\n${body}` : subject,
        subject: subject.trim(),
        body,
      });
    }

    return commits;
  }

  /**
   * Parse unified diff output
   */
  static parseDiff(output: string): GitDiff[] {
    if (!output.trim()) return [];

    const diffs: GitDiff[] = [];
    // Split by diff headers
    const fileDiffs = output.split(/^diff --git /m).filter(d => d.trim());

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split('\n');

      // Parse file path from the first line
      const headerMatch = lines[0].match(/a\/(.+) b\/(.+)/);
      if (!headerMatch) continue;

      const file = headerMatch[2];
      const diff: GitDiff = {
        file,
        additions: 0,
        deletions: 0,
        hunks: [],
      };

      let currentHunk: DiffHunk | null = null;
      let hunkContent: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Hunk header
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
        if (hunkMatch) {
          // Save previous hunk
          if (currentHunk) {
            currentHunk.content = hunkContent.join('\n');
            diff.hunks.push(currentHunk);
          }

          currentHunk = {
            oldStart: parseInt(hunkMatch[1], 10),
            oldLines: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newLines: parseInt(hunkMatch[4] || '1', 10),
            content: '',
          };
          hunkContent = [line];
          continue;
        }

        if (currentHunk) {
          hunkContent.push(line);

          if (line.startsWith('+') && !line.startsWith('+++')) {
            diff.additions++;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            diff.deletions++;
          }
        }
      }

      // Save last hunk
      if (currentHunk) {
        currentHunk.content = hunkContent.join('\n');
        diff.hunks.push(currentHunk);
      }

      diffs.push(diff);
    }

    return diffs;
  }

  /**
   * Parse git branch output
   */
  static parseBranches(output: string): GitBranch[] {
    if (!output.trim()) return [];

    const branches: GitBranch[] = [];
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const current = line.startsWith('*');
      const branchInfo = line.slice(2).trim();

      // Skip detached HEAD
      if (branchInfo.startsWith('(HEAD detached')) continue;

      // Parse branch name and additional info
      const match = branchInfo.match(/^(\S+)(?:\s+([a-f0-9]+)\s+(?:\[(.+)\]\s+)?(.*))?$/);
      if (!match) continue;

      const [, name, lastCommit, upstream] = match;

      const branch: GitBranch = {
        name,
        current,
        lastCommit,
      };

      // Parse upstream if present
      if (upstream) {
        branch.upstream = upstream.split(':')[0];
        const remoteParts = branch.upstream.split('/');
        if (remoteParts.length > 1) {
          branch.remote = remoteParts[0];
        }
      }

      // Check if it's a remote branch
      if (name.includes('/')) {
        const parts = name.split('/');
        branch.remote = parts[0];
      }

      branches.push(branch);
    }

    return branches;
  }

  /**
   * Parse git remote -v output
   */
  static parseRemotes(output: string): GitRemote[] {
    if (!output.trim()) return [];

    const remotes: GitRemote[] = [];
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match) continue;

      const [, name, url, type] = match;
      remotes.push({
        name,
        url,
        type: type as 'fetch' | 'push',
      });
    }

    return remotes;
  }

  /**
   * Parse git blame output (porcelain format)
   */
  static parseBlame(output: string): BlameInfo[] {
    if (!output.trim()) return [];

    const blameLines: BlameInfo[] = [];
    const lines = output.split('\n');

    let currentHash = '';
    let currentAuthor = '';
    let currentEmail = '';
    let currentDate: Date | null = null;
    let lineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Commit hash line
      const hashMatch = line.match(/^([a-f0-9]{40})\s+\d+\s+(\d+)/);
      if (hashMatch) {
        currentHash = hashMatch[1];
        lineNumber = parseInt(hashMatch[2], 10);
        continue;
      }

      // Author
      if (line.startsWith('author ')) {
        currentAuthor = line.slice(7);
        continue;
      }

      // Author email
      if (line.startsWith('author-mail ')) {
        currentEmail = line.slice(12).replace(/[<>]/g, '');
        continue;
      }

      // Author time
      if (line.startsWith('author-time ')) {
        currentDate = new Date(parseInt(line.slice(12), 10) * 1000);
        continue;
      }

      // Content line (starts with tab)
      if (line.startsWith('\t')) {
        blameLines.push({
          hash: currentHash,
          author: currentAuthor,
          email: currentEmail,
          date: currentDate || new Date(),
          lineNumber,
          content: line.slice(1),
        });
      }
    }

    return blameLines;
  }

  /**
   * Parse simple branch name from symbolic-ref
   */
  static parseBranchName(output: string): string {
    return output.trim().replace('refs/heads/', '');
  }

  /**
   * Parse commit hash from rev-parse
   */
  static parseRevision(output: string): string {
    return output.trim();
  }
}

export default GitParser;
