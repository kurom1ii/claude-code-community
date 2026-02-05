/**
 * Session Picker
 * Interactive session selector cho terminal UI
 */

import type { SessionSummary, SessionFilter, SessionSort } from './types';
import { sessionStorage, SessionStorage } from './SessionStorage';

// ============================================================================
// Types
// ============================================================================

/** Session picker options */
export interface SessionPickerOptions {
  /** Tiêu đề của picker */
  title?: string;

  /** Số sessions hiển thị mỗi trang */
  pageSize?: number;

  /** Filter sessions */
  filter?: SessionFilter;

  /** Sort sessions */
  sort?: SessionSort;

  /** Cho phép tạo session mới */
  allowNew?: boolean;

  /** Cho phép cancel */
  allowCancel?: boolean;

  /** Project path hiện tại (để highlight) */
  currentProjectPath?: string;
}

/** Session picker result */
export interface SessionPickerResult {
  /** Action được chọn */
  action: 'select' | 'new' | 'cancel';

  /** Session được chọn (nếu action = 'select') */
  session?: SessionSummary;
}

/** Formatted session item cho display */
export interface FormattedSessionItem {
  /** Session ID */
  id: string;

  /** Display label */
  label: string;

  /** Description/subtitle */
  description: string;

  /** Tags display */
  tagsDisplay: string;

  /** Time ago display */
  timeAgo: string;

  /** Is from current project */
  isCurrentProject: boolean;

  /** Original session data */
  session: SessionSummary;
}

// ============================================================================
// SessionPicker Class
// ============================================================================

export class SessionPicker {
  private storage: SessionStorage;
  private options: SessionPickerOptions;

  constructor(storage?: SessionStorage, options?: SessionPickerOptions) {
    this.storage = storage || sessionStorage;
    this.options = {
      title: 'Resume Session',
      pageSize: 10,
      allowNew: true,
      allowCancel: true,
      ...options,
    };
  }

  // --------------------------------------------------------------------------
  // Session List
  // --------------------------------------------------------------------------

  /**
   * Lấy danh sách sessions đã format
   */
  async getFormattedSessions(
    page: number = 0,
    searchQuery?: string
  ): Promise<{
    items: FormattedSessionItem[];
    total: number;
    hasMore: boolean;
  }> {
    const filter: SessionFilter = {
      ...this.options.filter,
      searchQuery: searchQuery || this.options.filter?.searchQuery,
    };

    const result = await this.storage.listSessions(
      filter,
      this.options.sort || { field: 'updatedAt', direction: 'desc' },
      page,
      this.options.pageSize || 10
    );

    const items = result.sessions.map(session =>
      this.formatSessionItem(session, this.options.currentProjectPath)
    );

    return {
      items,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Lấy sessions cho project hiện tại
   */
  async getProjectSessions(projectPath: string): Promise<FormattedSessionItem[]> {
    const sessions = await this.storage.getSessionsForProject(projectPath);
    return sessions.map(session => this.formatSessionItem(session, projectPath));
  }

  /**
   * Lấy sessions gần đây
   */
  async getRecentSessions(limit: number = 10): Promise<FormattedSessionItem[]> {
    const sessions = await this.storage.getRecentSessions(limit);
    return sessions.map(session =>
      this.formatSessionItem(session, this.options.currentProjectPath)
    );
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Tìm kiếm sessions
   */
  async searchSessions(query: string): Promise<FormattedSessionItem[]> {
    const result = await this.storage.listSessions(
      { searchQuery: query },
      { field: 'updatedAt', direction: 'desc' },
      0,
      20
    );

    return result.sessions.map(session =>
      this.formatSessionItem(session, this.options.currentProjectPath)
    );
  }

  /**
   * Tìm sessions theo tag
   */
  async getSessionsByTag(tag: string): Promise<FormattedSessionItem[]> {
    const result = await this.storage.listSessions(
      { tags: [tag] },
      { field: 'updatedAt', direction: 'desc' },
      0,
      50
    );

    return result.sessions.map(session =>
      this.formatSessionItem(session, this.options.currentProjectPath)
    );
  }

  // --------------------------------------------------------------------------
  // Formatting
  // --------------------------------------------------------------------------

  /**
   * Format session item cho display
   */
  formatSessionItem(session: SessionSummary, currentProjectPath?: string): FormattedSessionItem {
    const isCurrentProject = currentProjectPath
      ? session.projectPath === currentProjectPath
      : false;

    // Build label
    let label = session.title || this.truncate(session.lastMessagePreview || 'Untitled', 50);

    // Add git branch if available
    if (session.gitBranch) {
      label = `${label} (${session.gitBranch})`;
    }

    // Build description
    const parts: string[] = [];
    parts.push(session.projectName);
    parts.push(`${session.messageCount} messages`);

    const description = parts.join(' • ');

    // Format tags
    const tagsDisplay = session.tags.length > 0
      ? session.tags.map(t => `#${t}`).join(' ')
      : '';

    // Format time
    const timeAgo = this.formatTimeAgo(session.updatedAt);

    return {
      id: session.id,
      label,
      description,
      tagsDisplay,
      timeAgo,
      isCurrentProject,
      session,
    };
  }

  /**
   * Format time ago
   */
  formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  /**
   * Format date cho display
   */
  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Truncate string
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }

  // --------------------------------------------------------------------------
  // Menu Building
  // --------------------------------------------------------------------------

  /**
   * Build menu items cho interactive picker
   */
  async buildMenuItems(page: number = 0, searchQuery?: string): Promise<{
    items: MenuItemData[];
    total: number;
    hasMore: boolean;
  }> {
    const { items: sessions, total, hasMore } = await this.getFormattedSessions(page, searchQuery);

    const menuItems: MenuItemData[] = [];

    // Add "New Session" option if allowed
    if (this.options.allowNew && page === 0 && !searchQuery) {
      menuItems.push({
        type: 'action',
        id: '__new__',
        label: '+ New Session',
        description: 'Start a new session',
      });
    }

    // Add separator if we have both new option and sessions
    if (menuItems.length > 0 && sessions.length > 0) {
      menuItems.push({
        type: 'separator',
        id: '__sep__',
        label: '─'.repeat(40),
      });
    }

    // Add session items
    for (const session of sessions) {
      menuItems.push({
        type: 'session',
        id: session.id,
        label: session.label,
        description: session.description,
        hint: session.timeAgo,
        tags: session.tagsDisplay,
        isHighlighted: session.isCurrentProject,
        data: session,
      });
    }

    // Add "Load More" if has more
    if (hasMore) {
      menuItems.push({
        type: 'action',
        id: '__more__',
        label: 'Load More...',
        description: `${total - (page + 1) * (this.options.pageSize || 10)} more sessions`,
      });
    }

    return { items: menuItems, total, hasMore };
  }

  /**
   * Get help text cho picker
   */
  getHelpText(): string {
    const lines: string[] = [];

    lines.push('Navigation:');
    lines.push('  ↑/↓ or j/k   Move selection');
    lines.push('  Enter        Select session');
    lines.push('  /            Search sessions');

    if (this.options.allowNew) {
      lines.push('  n            New session');
    }

    if (this.options.allowCancel) {
      lines.push('  Esc or q     Cancel');
    }

    lines.push('');
    lines.push('Search tips:');
    lines.push('  #tag         Search by tag');
    lines.push('  @project     Search by project');

    return lines.join('\n');
  }
}

// ============================================================================
// Menu Item Types
// ============================================================================

export interface MenuItemData {
  type: 'session' | 'action' | 'separator';
  id: string;
  label: string;
  description?: string;
  hint?: string;
  tags?: string;
  isHighlighted?: boolean;
  data?: FormattedSessionItem;
}

// ============================================================================
// Quick Session Picker (Simplified API)
// ============================================================================

/**
 * Quick helper để lấy sessions cho resume command
 */
export async function getResumableSessions(
  projectPath?: string,
  limit: number = 10
): Promise<SessionSummary[]> {
  const picker = new SessionPicker(sessionStorage, {
    currentProjectPath: projectPath,
  });

  if (projectPath) {
    const items = await picker.getProjectSessions(projectPath);
    return items.slice(0, limit).map(item => item.session);
  }

  const items = await picker.getRecentSessions(limit);
  return items.map(item => item.session);
}

/**
 * Tìm session theo ID hoặc partial match
 */
export async function findSession(
  query: string,
  projectPath?: string
): Promise<SessionSummary | null> {
  const storage = sessionStorage;

  // Nếu query là UUID đầy đủ, tìm trực tiếp
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(query)) {
    if (projectPath) {
      const metadata = await storage.loadMetadata(projectPath, query);
      if (metadata) {
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
  }

  // Tìm bằng search
  const picker = new SessionPicker(sessionStorage, {
    currentProjectPath: projectPath,
  });

  const results = await picker.searchSessions(query);
  return results.length > 0 ? results[0].session : null;
}

// ============================================================================
// Export
// ============================================================================

export const sessionPicker = new SessionPicker();
