/**
 * Session Manager
 * Quản lý session lifecycle: create, resume, fork
 */

import * as crypto from 'crypto';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Generate UUID v4
 */
function uuidv4(): string {
  return crypto.randomUUID();
}
import type {
  Session,
  SessionId,
  SessionMetadata,
  SessionStatus,
  SessionSettings,
  ConversationMessage,
  ForkOptions,
  ForkResult,
  SessionSummary,
  SessionEventType,
  SessionEvent,
  SessionEventHandler,
} from './types';
import { SessionStorage, sessionStorage } from './SessionStorage';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SETTINGS: SessionSettings = {
  autoSave: true,
  autoSaveInterval: 5000, // 5 seconds
  maxMessagesInMemory: 1000,
  thinkingEnabled: true,
};

// ============================================================================
// SessionManager Class
// ============================================================================

export class SessionManager {
  private storage: SessionStorage;
  private currentSession: Session | null = null;
  private eventHandlers: Map<SessionEventType, SessionEventHandler[]> = new Map();
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private pendingMessages: ConversationMessage[] = [];

  constructor(storage?: SessionStorage) {
    this.storage = storage || sessionStorage;
  }

  // --------------------------------------------------------------------------
  // Session Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Tạo session mới
   */
  async createSession(
    projectPath: string,
    options?: {
      title?: string;
      tags?: string[];
      model?: string;
      settings?: Partial<SessionSettings>;
    }
  ): Promise<Session> {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const gitBranch = await this.getGitBranch(projectPath);

    const session: Session = {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      projectPath: path.resolve(projectPath),
      projectName: path.basename(projectPath),
      gitBranch,
      status: 'active',
      title: options?.title,
      tags: options?.tags || [],
      messageCount: 0,
      totalTokens: 0,
      model: options?.model || 'claude-sonnet-4-20250514',
      messages: [],
      settings: { ...DEFAULT_SETTINGS, ...options?.settings },
    };

    // Lưu session
    await this.storage.saveSession(session);

    // Set current session
    this.currentSession = session;
    this.startAutoSave();

    // Emit event
    this.emit('session:created', session.id);

    return session;
  }

  /**
   * Resume session từ ID
   */
  async resumeSession(projectPath: string, sessionId: SessionId): Promise<Session | null> {
    const session = await this.storage.loadSession(projectPath, sessionId);

    if (!session) {
      return null;
    }

    // Update status và timestamp
    session.status = 'active';
    session.updatedAt = new Date();

    // Mark messages as from history
    session.messages = session.messages.map(msg => ({
      ...msg,
      isFromHistory: true,
    }));

    // Set current session
    this.currentSession = session;
    this.startAutoSave();

    // Emit event
    this.emit('session:resumed', session.id);

    return session;
  }

  /**
   * Fork session (copy và tiếp tục)
   */
  async forkSession(
    projectPath: string,
    sourceSessionId: SessionId,
    options?: ForkOptions
  ): Promise<ForkResult> {
    const sourceSession = await this.storage.loadSession(projectPath, sourceSessionId);

    if (!sourceSession) {
      throw new Error(`Source session not found: ${sourceSessionId}`);
    }

    const newSessionId = this.generateSessionId();
    const now = new Date();

    // Determine messages to copy
    let messagesToCopy = sourceSession.messages;
    if (options?.fromMessageIndex !== undefined) {
      messagesToCopy = sourceSession.messages.slice(0, options.fromMessageIndex + 1);
    }

    // Create new session
    const forkedSession: Session = {
      id: newSessionId,
      createdAt: now,
      updatedAt: now,
      projectPath: sourceSession.projectPath,
      projectName: sourceSession.projectName,
      gitBranch: await this.getGitBranch(projectPath),
      status: 'active',
      title: options?.title || `Fork of ${sourceSession.title || sourceSessionId}`,
      tags: [...sourceSession.tags, ...(options?.tags || [])],
      parentSessionId: sourceSessionId,
      messageCount: messagesToCopy.length,
      totalTokens: sourceSession.totalTokens,
      model: sourceSession.model,
      messages: messagesToCopy.map(msg => ({
        ...msg,
        isFromHistory: true,
      })),
      context: options?.copyContext ? sourceSession.context : undefined,
      settings: sourceSession.settings,
    };

    // Save forked session
    await this.storage.saveSession(forkedSession);

    // Set as current session
    this.currentSession = forkedSession;
    this.startAutoSave();

    // Emit event
    this.emit('session:forked', forkedSession.id, {
      sourceSessionId,
      messagesCopied: messagesToCopy.length,
    });

    return {
      originalSessionId: sourceSessionId,
      forkedSessionId: newSessionId,
      messagesCopied: messagesToCopy.length,
    };
  }

  /**
   * Complete session hiện tại
   */
  async completeSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.status = 'completed';
    this.currentSession.updatedAt = new Date();

    await this.saveCurrentSession();
    this.emit('session:completed', this.currentSession.id);

    this.stopAutoSave();
    this.currentSession = null;
  }

  /**
   * Archive session
   */
  async archiveSession(projectPath: string, sessionId: SessionId): Promise<boolean> {
    const session = await this.storage.loadSession(projectPath, sessionId);

    if (!session) {
      return false;
    }

    session.status = 'archived';
    session.updatedAt = new Date();

    await this.storage.saveSession(session);
    this.emit('session:archived', sessionId);

    return true;
  }

  // --------------------------------------------------------------------------
  // Message Management
  // --------------------------------------------------------------------------

  /**
   * Thêm message vào session hiện tại
   */
  async addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp'>): Promise<ConversationMessage> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const fullMessage: ConversationMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.currentSession.messages.push(fullMessage);
    this.currentSession.messageCount = this.currentSession.messages.length;
    this.currentSession.updatedAt = new Date();

    if (fullMessage.tokens) {
      this.currentSession.totalTokens += fullMessage.tokens;
    }

    // Add to pending for batch save
    this.pendingMessages.push(fullMessage);

    this.emit('message:added', this.currentSession.id, { messageId: fullMessage.id });

    return fullMessage;
  }

  /**
   * Update message trong session
   */
  async updateMessage(messageId: string, updates: Partial<ConversationMessage>): Promise<boolean> {
    if (!this.currentSession) {
      return false;
    }

    const index = this.currentSession.messages.findIndex(m => m.id === messageId);
    if (index === -1) {
      return false;
    }

    this.currentSession.messages[index] = {
      ...this.currentSession.messages[index],
      ...updates,
    };
    this.currentSession.updatedAt = new Date();

    this.emit('message:updated', this.currentSession.id, { messageId });

    return true;
  }

  // --------------------------------------------------------------------------
  // Session Access
  // --------------------------------------------------------------------------

  /**
   * Lấy session hiện tại
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Lấy session ID hiện tại
   */
  getCurrentSessionId(): SessionId | null {
    return this.currentSession?.id || null;
  }

  /**
   * Lấy messages của session hiện tại
   */
  getMessages(): ConversationMessage[] {
    return this.currentSession?.messages || [];
  }

  /**
   * Lấy metadata của session hiện tại
   */
  getMetadata(): SessionMetadata | null {
    if (!this.currentSession) {
      return null;
    }

    return {
      id: this.currentSession.id,
      createdAt: this.currentSession.createdAt,
      updatedAt: this.currentSession.updatedAt,
      projectPath: this.currentSession.projectPath,
      projectName: this.currentSession.projectName,
      gitBranch: this.currentSession.gitBranch,
      status: this.currentSession.status,
      title: this.currentSession.title,
      tags: this.currentSession.tags,
      parentSessionId: this.currentSession.parentSessionId,
      messageCount: this.currentSession.messageCount,
      totalTokens: this.currentSession.totalTokens,
      model: this.currentSession.model,
    };
  }

  // --------------------------------------------------------------------------
  // Session Listing
  // --------------------------------------------------------------------------

  /**
   * Lấy danh sách sessions gần đây
   */
  async getRecentSessions(limit: number = 10): Promise<SessionSummary[]> {
    return this.storage.getRecentSessions(limit);
  }

  /**
   * Lấy sessions cho project hiện tại
   */
  async getProjectSessions(projectPath: string): Promise<SessionSummary[]> {
    return this.storage.getSessionsForProject(projectPath);
  }

  // --------------------------------------------------------------------------
  // Tags Management
  // --------------------------------------------------------------------------

  /**
   * Thêm tag vào session hiện tại
   */
  addTag(tag: string): boolean {
    if (!this.currentSession) {
      return false;
    }

    if (!this.currentSession.tags.includes(tag)) {
      this.currentSession.tags.push(tag);
      this.currentSession.updatedAt = new Date();
    }

    return true;
  }

  /**
   * Xóa tag khỏi session hiện tại
   */
  removeTag(tag: string): boolean {
    if (!this.currentSession) {
      return false;
    }

    const index = this.currentSession.tags.indexOf(tag);
    if (index !== -1) {
      this.currentSession.tags.splice(index, 1);
      this.currentSession.updatedAt = new Date();
      return true;
    }

    return false;
  }

  /**
   * Toggle tag (thêm nếu chưa có, xóa nếu đã có)
   */
  toggleTag(tag: string): { added: boolean } {
    if (!this.currentSession) {
      return { added: false };
    }

    const exists = this.currentSession.tags.includes(tag);
    if (exists) {
      this.removeTag(tag);
      return { added: false };
    } else {
      this.addTag(tag);
      return { added: true };
    }
  }

  // --------------------------------------------------------------------------
  // Session Title/Context
  // --------------------------------------------------------------------------

  /**
   * Set title cho session
   */
  setTitle(title: string): void {
    if (this.currentSession) {
      this.currentSession.title = title;
      this.currentSession.updatedAt = new Date();
    }
  }

  /**
   * Auto-generate title từ messages
   */
  generateTitle(): string {
    if (!this.currentSession || this.currentSession.messages.length === 0) {
      return 'New Session';
    }

    // Lấy message đầu tiên của user
    const firstUserMessage = this.currentSession.messages.find(m => m.role === 'user');
    if (!firstUserMessage) {
      return 'New Session';
    }

    let text = '';
    if (typeof firstUserMessage.content === 'string') {
      text = firstUserMessage.content;
    } else {
      const textBlock = firstUserMessage.content.find(b => b.type === 'text');
      if (textBlock && 'text' in textBlock) {
        text = textBlock.text;
      }
    }

    // Truncate và clean
    const title = text
      .replace(/\n/g, ' ')
      .trim()
      .slice(0, 80);

    return title || 'New Session';
  }

  /**
   * Set context cho session
   */
  setContext(context: string): void {
    if (this.currentSession) {
      this.currentSession.context = context;
      this.currentSession.updatedAt = new Date();
    }
  }

  // --------------------------------------------------------------------------
  // Auto-save Management
  // --------------------------------------------------------------------------

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (!this.currentSession?.settings?.autoSave) {
      return;
    }

    this.stopAutoSave();

    const interval = this.currentSession.settings.autoSaveInterval || 5000;
    this.autoSaveTimer = setInterval(async () => {
      await this.saveCurrentSession();
    }, interval);
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Lưu session hiện tại
   */
  async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      await this.storage.saveSession(this.currentSession);
      this.pendingMessages = [];
      this.emit('session:saved', this.currentSession.id);
    } catch (error) {
      this.emit('error:save', this.currentSession.id, { error });
      throw error;
    }
  }

  /**
   * Force save ngay lập tức
   */
  async forceSave(): Promise<void> {
    await this.saveCurrentSession();
  }

  // --------------------------------------------------------------------------
  // Event System
  // --------------------------------------------------------------------------

  /**
   * Subscribe to session events
   */
  on(eventType: SessionEventType, handler: SessionEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }

    this.eventHandlers.get(eventType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Emit event
   */
  private emit(type: SessionEventType, sessionId: SessionId, data?: unknown): void {
    const event: SessionEvent = {
      type,
      sessionId,
      timestamp: new Date(),
      data,
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in session event handler for ${type}:`, error);
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Generate unique session ID
   */
  private generateSessionId(): SessionId {
    return uuidv4();
  }

  /**
   * Get current git branch
   */
  private async getGitBranch(projectPath: string): Promise<string | undefined> {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      return branch || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopAutoSave();
    if (this.currentSession) {
      await this.saveCurrentSession();
    }
    this.currentSession = null;
    this.eventHandlers.clear();
  }

  // --------------------------------------------------------------------------
  // Convenience Aliases (for API compatibility)
  // --------------------------------------------------------------------------

  /**
   * Alias for saveCurrentSession
   */
  async saveSession(): Promise<void> {
    return this.saveCurrentSession();
  }

  /**
   * Alias for forkSession - Fork from a session ID
   */
  async fork(fromSessionId: SessionId, projectPath?: string): Promise<Session> {
    const path = projectPath || this.currentSession?.projectPath;
    if (!path) {
      throw new Error('No project path specified and no current session');
    }

    const result = await this.forkSession(path, fromSessionId);

    // Return the forked session (which is now the current session)
    if (!this.currentSession) {
      throw new Error('Fork failed - no current session');
    }

    return this.currentSession;
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const sessionManager = new SessionManager();
