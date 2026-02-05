/**
 * Session Storage
 * Lưu trữ và đọc sessions từ ~/.claude/projects/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  Session,
  SessionId,
  SessionMetadata,
  SessionSummary,
  SessionFilter,
  SessionSort,
  SessionListResult,
  SessionFileInfo,
  StoredSession,
  ConversationMessage,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_DIR = '.claude';
const PROJECTS_DIR = 'projects';
const SESSION_MEMORY_DIR = 'session-memory';
const SUMMARY_FILE = 'summary.md';
const SESSION_FILE_EXTENSION = '.jsonl';
const STORAGE_VERSION = 1;

// ============================================================================
// SessionStorage Class
// ============================================================================

export class SessionStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), CLAUDE_DIR, PROJECTS_DIR);
  }

  // --------------------------------------------------------------------------
  // Path Helpers
  // --------------------------------------------------------------------------

  /**
   * Tạo project key từ path (thay / thành -)
   */
  private getProjectKey(projectPath: string): string {
    // Normalize path và thay / thành -
    const normalized = path.normalize(projectPath);
    return normalized.replace(/^\//, '').replace(/\//g, '-');
  }

  /**
   * Lấy đường dẫn thư mục project
   */
  private getProjectDir(projectPath: string): string {
    return path.join(this.baseDir, this.getProjectKey(projectPath));
  }

  /**
   * Lấy đường dẫn file session
   */
  private getSessionFilePath(projectPath: string, sessionId: SessionId): string {
    return path.join(this.getProjectDir(projectPath), `${sessionId}${SESSION_FILE_EXTENSION}`);
  }

  /**
   * Lấy đường dẫn thư mục session memory
   */
  private getSessionMemoryDir(projectPath: string, sessionId: SessionId): string {
    return path.join(this.getProjectDir(projectPath), sessionId, SESSION_MEMORY_DIR);
  }

  /**
   * Lấy đường dẫn file summary
   */
  private getSummaryFilePath(projectPath: string, sessionId: SessionId): string {
    return path.join(this.getSessionMemoryDir(projectPath, sessionId), SUMMARY_FILE);
  }

  // --------------------------------------------------------------------------
  // Directory Management
  // --------------------------------------------------------------------------

  /**
   * Đảm bảo thư mục tồn tại
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Kiểm tra file/thư mục tồn tại
   */
  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Session CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Lưu session
   */
  async saveSession(session: Session): Promise<void> {
    const projectDir = this.getProjectDir(session.projectPath);
    await this.ensureDir(projectDir);

    const sessionPath = this.getSessionFilePath(session.projectPath, session.id);
    const stored: StoredSession = {
      version: STORAGE_VERSION,
      metadata: this.extractMetadata(session),
      messages: session.messages,
      context: session.context,
      settings: session.settings,
    };

    // Lưu dưới dạng JSONL (mỗi message một dòng để dễ append)
    const lines = [
      JSON.stringify({ version: stored.version, metadata: stored.metadata, context: stored.context, settings: stored.settings }),
      ...stored.messages.map(msg => JSON.stringify(msg)),
    ];

    await fs.promises.writeFile(sessionPath, lines.join('\n'), 'utf-8');
  }

  /**
   * Append message vào session (cho auto-save)
   */
  async appendMessage(projectPath: string, sessionId: SessionId, message: ConversationMessage): Promise<void> {
    const sessionPath = this.getSessionFilePath(projectPath, sessionId);

    if (!(await this.exists(sessionPath))) {
      throw new Error(`Session file not found: ${sessionPath}`);
    }

    const line = '\n' + JSON.stringify(message);
    await fs.promises.appendFile(sessionPath, line, 'utf-8');
  }

  /**
   * Load session từ file
   */
  async loadSession(projectPath: string, sessionId: SessionId): Promise<Session | null> {
    const sessionPath = this.getSessionFilePath(projectPath, sessionId);

    if (!(await this.exists(sessionPath))) {
      return null;
    }

    const content = await fs.promises.readFile(sessionPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return null;
    }

    // Dòng đầu tiên là metadata
    const firstLine = JSON.parse(lines[0]);
    const { version, metadata, context, settings } = firstLine;

    // Các dòng còn lại là messages
    const messages: ConversationMessage[] = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        messages.push(JSON.parse(lines[i]));
      } catch (e) {
        console.error(`Failed to parse message at line ${i + 1}:`, e);
      }
    }

    // Convert date strings back to Date objects
    const session: Session = {
      ...metadata,
      createdAt: new Date(metadata.createdAt),
      updatedAt: new Date(metadata.updatedAt),
      messages: messages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      })),
      context,
      settings,
    };

    return session;
  }

  /**
   * Load chỉ metadata (không load messages)
   */
  async loadMetadata(projectPath: string, sessionId: SessionId): Promise<SessionMetadata | null> {
    const sessionPath = this.getSessionFilePath(projectPath, sessionId);

    if (!(await this.exists(sessionPath))) {
      return null;
    }

    const content = await fs.promises.readFile(sessionPath, 'utf-8');
    const firstLine = content.split('\n')[0];

    if (!firstLine) {
      return null;
    }

    const { metadata } = JSON.parse(firstLine);

    return {
      ...metadata,
      createdAt: new Date(metadata.createdAt),
      updatedAt: new Date(metadata.updatedAt),
    };
  }

  /**
   * Xóa session
   */
  async deleteSession(projectPath: string, sessionId: SessionId): Promise<boolean> {
    const sessionPath = this.getSessionFilePath(projectPath, sessionId);

    if (!(await this.exists(sessionPath))) {
      return false;
    }

    await fs.promises.unlink(sessionPath);

    // Xóa thư mục session memory nếu có
    const memoryDir = this.getSessionMemoryDir(projectPath, sessionId);
    if (await this.exists(memoryDir)) {
      await fs.promises.rm(memoryDir, { recursive: true });
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Session Listing
  // --------------------------------------------------------------------------

  /**
   * Lấy danh sách tất cả session files trong project
   */
  async getSessionFiles(projectPath: string): Promise<SessionFileInfo[]> {
    const projectDir = this.getProjectDir(projectPath);

    if (!(await this.exists(projectDir))) {
      return [];
    }

    const entries = await fs.promises.readdir(projectDir, { withFileTypes: true });
    const sessionFiles: SessionFileInfo[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(SESSION_FILE_EXTENSION)) {
        const sessionId = entry.name.replace(SESSION_FILE_EXTENSION, '');
        const filePath = path.join(projectDir, entry.name);
        const stats = await fs.promises.stat(filePath);

        sessionFiles.push({
          id: sessionId,
          filePath,
          summaryPath: this.getSummaryFilePath(projectPath, sessionId),
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }

    return sessionFiles;
  }

  /**
   * Lấy danh sách sessions với filter và pagination
   */
  async listSessions(
    filter?: SessionFilter,
    sort?: SessionSort,
    page: number = 0,
    pageSize: number = 20
  ): Promise<SessionListResult> {
    // Lấy tất cả project directories
    const projectDirs = await this.getAllProjectDirs();
    const allSummaries: SessionSummary[] = [];

    for (const projectDir of projectDirs) {
      const projectPath = this.projectKeyToPath(path.basename(projectDir));

      // Filter by project path if specified
      if (filter?.projectPath && projectPath !== filter.projectPath) {
        continue;
      }

      const sessionFiles = await this.getSessionFiles(projectPath);

      for (const fileInfo of sessionFiles) {
        const metadata = await this.loadMetadata(projectPath, fileInfo.id);
        if (!metadata) continue;

        // Apply filters
        if (!this.matchesFilter(metadata, filter)) {
          continue;
        }

        const summary = await this.createSummary(projectPath, metadata);
        allSummaries.push(summary);
      }
    }

    // Sort
    this.sortSummaries(allSummaries, sort);

    // Paginate
    const total = allSummaries.length;
    const start = page * pageSize;
    const end = start + pageSize;
    const sessions = allSummaries.slice(start, end);

    return {
      sessions,
      total,
      page,
      pageSize,
      hasMore: end < total,
    };
  }

  /**
   * Lấy sessions gần đây
   */
  async getRecentSessions(limit: number = 10): Promise<SessionSummary[]> {
    const result = await this.listSessions(
      undefined,
      { field: 'updatedAt', direction: 'desc' },
      0,
      limit
    );
    return result.sessions;
  }

  /**
   * Tìm sessions theo project path hiện tại
   */
  async getSessionsForProject(projectPath: string, limit?: number): Promise<SessionSummary[]> {
    const result = await this.listSessions(
      { projectPath },
      { field: 'updatedAt', direction: 'desc' },
      0,
      limit || 50
    );
    return result.sessions;
  }

  // --------------------------------------------------------------------------
  // Summary Management
  // --------------------------------------------------------------------------

  /**
   * Lưu session summary
   */
  async saveSummary(projectPath: string, sessionId: SessionId, summary: string): Promise<void> {
    const summaryDir = this.getSessionMemoryDir(projectPath, sessionId);
    await this.ensureDir(summaryDir);

    const summaryPath = this.getSummaryFilePath(projectPath, sessionId);
    await fs.promises.writeFile(summaryPath, summary, 'utf-8');
  }

  /**
   * Load session summary
   */
  async loadSummary(projectPath: string, sessionId: SessionId): Promise<string | null> {
    const summaryPath = this.getSummaryFilePath(projectPath, sessionId);

    if (!(await this.exists(summaryPath))) {
      return null;
    }

    return fs.promises.readFile(summaryPath, 'utf-8');
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Extract metadata từ session
   */
  private extractMetadata(session: Session): SessionMetadata {
    return {
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      projectPath: session.projectPath,
      projectName: session.projectName,
      gitBranch: session.gitBranch,
      status: session.status,
      title: session.title,
      tags: session.tags,
      parentSessionId: session.parentSessionId,
      messageCount: session.messages.length,
      totalTokens: session.totalTokens,
      model: session.model,
    };
  }

  /**
   * Lấy tất cả project directories
   */
  private async getAllProjectDirs(): Promise<string[]> {
    if (!(await this.exists(this.baseDir))) {
      return [];
    }

    const entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => path.join(this.baseDir, e.name));
  }

  /**
   * Convert project key back to path
   */
  private projectKeyToPath(key: string): string {
    return '/' + key.replace(/-/g, '/');
  }

  /**
   * Kiểm tra metadata có match filter không
   */
  private matchesFilter(metadata: SessionMetadata, filter?: SessionFilter): boolean {
    if (!filter) return true;

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(metadata.status)) return false;
    }

    if (filter.tags && filter.tags.length > 0) {
      const hasTag = filter.tags.some(tag => metadata.tags.includes(tag));
      if (!hasTag) return false;
    }

    if (filter.dateRange) {
      if (filter.dateRange.from && metadata.updatedAt < filter.dateRange.from) return false;
      if (filter.dateRange.to && metadata.updatedAt > filter.dateRange.to) return false;
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      const titleMatch = metadata.title?.toLowerCase().includes(query);
      const tagMatch = metadata.tags.some(tag => tag.toLowerCase().includes(query));
      if (!titleMatch && !tagMatch) return false;
    }

    return true;
  }

  /**
   * Sort summaries
   */
  private sortSummaries(summaries: SessionSummary[], sort?: SessionSort): void {
    const field = sort?.field || 'updatedAt';
    const direction = sort?.direction || 'desc';

    summaries.sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'updatedAt':
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
        case 'messageCount':
          comparison = a.messageCount - b.messageCount;
          break;
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
      }

      return direction === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Tạo session summary từ metadata
   */
  private async createSummary(projectPath: string, metadata: SessionMetadata): Promise<SessionSummary> {
    return {
      id: metadata.id,
      title: metadata.title,
      projectPath: metadata.projectPath,
      projectName: metadata.projectName,
      gitBranch: metadata.gitBranch,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      messageCount: metadata.messageCount,
      tags: metadata.tags,
      status: metadata.status,
    };
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const sessionStorage = new SessionStorage();
