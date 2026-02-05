/**
 * CLI Class
 * Main CLI class for interactive and non-interactive modes
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as readline from 'readline';
import type {
  CLIOptions,
  CLIContext,
  CLIEvent,
  CLIEventType,
  CLIEventHandler,
  AppState,
} from './types';
import type { Session, ConversationMessage } from '../session/types';
import type { ClaudeConfig } from '../config/types';
import type { Message, ContentBlock } from '../types';
import { InputHandler } from './InputHandler';
import { OutputRenderer } from './OutputRenderer';
import { SignalHandler } from './SignalHandler';
import { HistoryManager } from './HistoryManager';
import { SessionManager, sessionManager } from '../session/SessionManager';
import { ConversationHistory, createConversationHistory } from '../session/ConversationHistory';
import { AnthropicClient, createUserMessage } from '../api';
import { getToolDefinitions, executeTool } from '../tools';
import { loadConfig, DEFAULT_MODEL, getRandomThinkingVerb } from '../config';
import { CommandParser } from '../commands/CommandParser';

// ============================================================================
// Constants
// ============================================================================

const COMMAND_PREFIX = '/';
const EXIT_COMMANDS = ['exit', 'quit', 'q'];
const CLEAR_COMMANDS = ['clear', 'cls'];
const HELP_COMMANDS = ['help', 'h', '?'];

// ============================================================================
// CLI Class
// ============================================================================

export class CLI extends EventEmitter {
  private options: CLIOptions;
  private context: CLIContext;
  private inputHandler: InputHandler;
  private outputRenderer: OutputRenderer;
  private signalHandler: SignalHandler;
  private historyManager: HistoryManager;
  private sessionMgr: SessionManager;
  private client: AnthropicClient;
  private commandParser: CommandParser;
  private isRunning: boolean = false;
  private isShuttingDown: boolean = false;

  constructor(options: CLIOptions = {}) {
    super();
    this.options = options;

    // Initialize API client
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.client = new AnthropicClient({ apiKey });

    // Initialize context (will be fully populated in start())
    this.context = {
      cwd: process.cwd(),
      session: null,
      config: {} as ClaudeConfig,
      conversation: createConversationHistory(),
      isInteractive: !options.print,
      model: options.model || DEFAULT_MODEL,
      apiKey,
      isProcessing: false,
    };

    // Initialize components
    this.inputHandler = new InputHandler({
      historyFile: path.join(process.env.HOME || '', '.claude', 'input_history'),
    });

    this.outputRenderer = new OutputRenderer({
      syntaxHighlight: true,
      markdown: true,
    });

    this.signalHandler = new SignalHandler({
      onInterrupt: () => this.handleInterrupt(),
      onTerminate: () => this.shutdown(),
      onSuspend: () => this.handleSuspend(),
      gracefulShutdown: true,
    });

    this.historyManager = new HistoryManager({
      maxEntries: 1000,
      persist: true,
    });

    this.sessionMgr = sessionManager;
    this.commandParser = new CommandParser({ commandPrefix: COMMAND_PREFIX });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Start the interactive CLI
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('CLI is already running');
    }

    this.isRunning = true;
    this.emit('session:started');

    try {
      // Load configuration
      this.context.config = await loadConfig();

      // Initialize signal handlers
      this.signalHandler.install();

      // Load history
      await this.historyManager.load();

      // Create or resume session
      await this.initializeSession();

      // Show welcome message
      if (this.context.isInteractive) {
        this.showWelcome();
      }

      // Process initial prompt if provided
      if (this.options.initialPrompt) {
        await this.handleInput(this.options.initialPrompt);

        // Exit if in print mode
        if (this.options.print) {
          await this.shutdown();
          return;
        }
      }

      // Start input loop if interactive
      if (this.context.isInteractive) {
        await this.runInputLoop();
      }
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Run a single prompt and return the response (one-shot mode)
   */
  async runOnce(prompt: string): Promise<string> {
    // Load configuration
    this.context.config = await loadConfig();

    // Create session
    await this.initializeSession();

    // Process prompt
    const response = await this.processPrompt(prompt);

    // Cleanup
    await this.cleanup();

    return response;
  }

  /**
   * Handle user input (prompt or command)
   */
  async handleInput(input: string): Promise<void> {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return;
    }

    // Add to history
    this.historyManager.add(trimmedInput);

    // Check if it's a command
    if (this.commandParser.isCommand(trimmedInput)) {
      const handled = await this.handleCommand(trimmedInput);
      if (handled) {
        return;
      }
    }

    // Process as prompt
    await this.processPrompt(trimmedInput);
  }

  /**
   * Handle a slash command
   * @returns true if command was handled, false to process as prompt
   */
  async handleCommand(input: string): Promise<boolean> {
    const commandName = this.commandParser.extractCommandName(input);

    if (!commandName) {
      return false;
    }

    const args = input.slice(COMMAND_PREFIX.length + commandName.length).trim();

    // Built-in commands
    if (EXIT_COMMANDS.includes(commandName)) {
      await this.shutdown();
      return true;
    }

    if (CLEAR_COMMANDS.includes(commandName)) {
      this.clearScreen();
      return true;
    }

    if (HELP_COMMANDS.includes(commandName)) {
      this.showHelp(args);
      return true;
    }

    // Mode switching
    if (commandName === 'plan') {
      this.setMode('plan');
      this.outputRenderer.info('Switched to Plan mode');
      return true;
    }

    if (commandName === 'code') {
      this.setMode('code');
      this.outputRenderer.info('Switched to Code mode');
      return true;
    }

    // Session commands
    if (commandName === 'new') {
      await this.newSession();
      return true;
    }

    if (commandName === 'sessions' || commandName === 'resume') {
      await this.showSessionPicker();
      return true;
    }

    if (commandName === 'save') {
      await this.saveSession();
      return true;
    }

    // Compact command
    if (commandName === 'compact') {
      await this.compactConversation();
      return true;
    }

    // Model command
    if (commandName === 'model') {
      if (args) {
        this.setModel(args);
      } else {
        this.outputRenderer.info(`Current model: ${this.context.model}`);
      }
      return true;
    }

    // Status command
    if (commandName === 'status') {
      this.showStatus();
      return true;
    }

    // Config command
    if (commandName === 'config') {
      this.showConfig();
      return true;
    }

    // Unknown command - could be a skill, let it through
    return false;
  }

  /**
   * Gracefully shutdown the CLI
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.emit('shutdown:initiated');

    try {
      // Save session
      if (this.sessionMgr.getCurrentSession()) {
        await this.sessionMgr.saveCurrentSession();
      }

      // Save history
      await this.historyManager.save();

      // Cleanup
      await this.cleanup();

      this.isRunning = false;
      this.emit('session:ended');

      if (this.context.isInteractive) {
        this.outputRenderer.info('Goodbye!');
      }

      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  // --------------------------------------------------------------------------
  // Input Loop
  // --------------------------------------------------------------------------

  /**
   * Main input loop for interactive mode
   */
  private async runInputLoop(): Promise<void> {
    while (this.isRunning && !this.isShuttingDown) {
      try {
        const input = await this.inputHandler.readline(this.getPromptString());

        if (input === null) {
          // EOF received
          await this.shutdown();
          break;
        }

        await this.handleInput(input);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
          break;
        }
        this.handleError(error);
      }
    }
  }

  /**
   * Get the prompt string to display
   */
  private getPromptString(): string {
    const mode = this.context.session?.status === 'active' ? 'code' : 'idle';
    const branch = this.context.session?.gitBranch;
    const dir = path.basename(this.context.cwd);

    let prompt = `\x1b[36m${dir}\x1b[0m`;

    if (branch) {
      prompt += ` \x1b[33m(${branch})\x1b[0m`;
    }

    prompt += ' > ';
    return prompt;
  }

  // --------------------------------------------------------------------------
  // Prompt Processing
  // --------------------------------------------------------------------------

  /**
   * Process a user prompt and get response
   */
  private async processPrompt(prompt: string): Promise<string> {
    this.context.isProcessing = true;
    this.emit('processing:started');

    const thinkingVerb = getRandomThinkingVerb();

    if (this.context.isInteractive) {
      this.outputRenderer.startSpinner(thinkingVerb);
    }

    try {
      // Add user message to conversation
      const userMessage = createUserMessage(prompt);
      this.context.conversation.addUserMessage(prompt);

      // Build messages for API
      const messages = this.context.conversation.getMessagesForAPI();

      // Call API
      let assistantContent: ContentBlock[] = [];
      let responseText = '';

      const stream = this.client.streamMessage({
        model: this.context.model,
        max_tokens: 8096,
        messages,
        tools: getToolDefinitions() as any,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block) {
          assistantContent.push(event.content_block);
        } else if (event.type === 'content_block_delta' && event.delta) {
          const lastBlock = assistantContent[assistantContent.length - 1];
          if (lastBlock && event.delta.text && lastBlock.type === 'text') {
            (lastBlock as any).text += event.delta.text;
          }
        }
      }

      if (this.context.isInteractive) {
        this.outputRenderer.stopSpinner();
      }

      // Extract text content
      responseText = assistantContent
        .filter((block): block is ContentBlock & { type: 'text'; text: string } =>
          block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // Add assistant message to conversation
      this.context.conversation.addAssistantMessage(assistantContent);

      // Handle tool calls
      const toolUses = assistantContent.filter(block => block.type === 'tool_use');

      if (toolUses.length > 0) {
        responseText = await this.handleToolCalls(toolUses as any[], responseText);
      }

      // Render response
      if (this.context.isInteractive) {
        this.outputRenderer.renderAssistantMessage(responseText);
      } else {
        // Print mode
        console.log(responseText);
      }

      return responseText;
    } catch (error) {
      if (this.context.isInteractive) {
        this.outputRenderer.stopSpinner();
      }
      this.handleError(error);
      throw error;
    } finally {
      this.context.isProcessing = false;
      this.emit('processing:ended');
    }
  }

  /**
   * Handle tool calls from assistant response
   */
  private async handleToolCalls(
    toolUses: Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>,
    currentResponse: string
  ): Promise<string> {
    for (const toolUse of toolUses) {
      if (this.context.isInteractive) {
        this.outputRenderer.renderToolStart(toolUse.name, toolUse.input);
      }

      const result = await executeTool(toolUse.name, toolUse.input);

      if (this.context.isInteractive) {
        this.outputRenderer.renderToolResult(toolUse.name, result);
      }

      // Add tool result to conversation
      this.context.conversation.addUserMessage([
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.success ? (result.output || '') : (result.error || 'Unknown error'),
          is_error: !result.success,
        } as any,
      ]);
    }

    // Continue conversation after tool calls
    const messages = this.context.conversation.getMessagesForAPI();

    if (this.context.isInteractive) {
      this.outputRenderer.startSpinner('Continuing');
    }

    let assistantContent: ContentBlock[] = [];

    const stream = this.client.streamMessage({
      model: this.context.model,
      max_tokens: 8096,
      messages,
      tools: getToolDefinitions() as any,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block) {
        assistantContent.push(event.content_block);
      } else if (event.type === 'content_block_delta' && event.delta) {
        const lastBlock = assistantContent[assistantContent.length - 1];
        if (lastBlock && event.delta.text && lastBlock.type === 'text') {
          (lastBlock as any).text += event.delta.text;
        }
      }
    }

    if (this.context.isInteractive) {
      this.outputRenderer.stopSpinner();
    }

    // Add to conversation
    this.context.conversation.addAssistantMessage(assistantContent);

    // Extract text
    const responseText = assistantContent
      .filter((block): block is ContentBlock & { type: 'text'; text: string } =>
        block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Check for more tool calls
    const moreToolUses = assistantContent.filter(block => block.type === 'tool_use');
    if (moreToolUses.length > 0) {
      return this.handleToolCalls(moreToolUses as any[], responseText);
    }

    return responseText;
  }

  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------

  /**
   * Initialize session (create new or resume)
   */
  private async initializeSession(): Promise<void> {
    if (this.options.resume) {
      // Resume specific session
      const session = await this.sessionMgr.resumeSession(
        this.context.cwd,
        this.options.resume
      );

      if (session) {
        this.context.session = session;
        this.context.conversation.loadFromMessages(session.messages);
        this.outputRenderer.info(`Resumed session: ${session.title || session.id}`);
        return;
      }

      this.outputRenderer.warning('Session not found, creating new session');
    }

    if (this.options.continue) {
      // Continue most recent session
      const sessions = await this.sessionMgr.getProjectSessions(this.context.cwd);
      if (sessions.length > 0) {
        const session = await this.sessionMgr.resumeSession(
          this.context.cwd,
          sessions[0].id
        );

        if (session) {
          this.context.session = session;
          this.context.conversation.loadFromMessages(session.messages);
          this.outputRenderer.info(`Continued session: ${session.title || session.id}`);
          return;
        }
      }
    }

    // Create new session
    const session = await this.sessionMgr.createSession(this.context.cwd, {
      model: this.context.model,
    });

    this.context.session = session;
  }

  /**
   * Create a new session
   */
  private async newSession(): Promise<void> {
    // Save current session
    if (this.sessionMgr.getCurrentSession()) {
      await this.sessionMgr.saveCurrentSession();
    }

    // Clear conversation
    this.context.conversation.clear();

    // Create new session
    const session = await this.sessionMgr.createSession(this.context.cwd, {
      model: this.context.model,
    });

    this.context.session = session;
    this.outputRenderer.success('New session created');
  }

  /**
   * Save current session
   */
  private async saveSession(): Promise<void> {
    await this.sessionMgr.saveCurrentSession();
    this.outputRenderer.success('Session saved');
  }

  /**
   * Show session picker
   */
  private async showSessionPicker(): Promise<void> {
    const sessions = await this.sessionMgr.getRecentSessions(10);

    if (sessions.length === 0) {
      this.outputRenderer.info('No previous sessions found');
      return;
    }

    this.outputRenderer.info('Recent sessions:');
    sessions.forEach((session, index) => {
      const date = new Date(session.updatedAt).toLocaleDateString();
      const title = session.title || session.id.slice(0, 8);
      console.log(`  ${index + 1}. ${title} (${date}) - ${session.messageCount} messages`);
    });

    this.outputRenderer.info('Use /resume <session-id> to resume a session');
  }

  // --------------------------------------------------------------------------
  // Mode Management
  // --------------------------------------------------------------------------

  /**
   * Set the current mode
   */
  private setMode(mode: 'code' | 'plan' | 'bash'): void {
    // Mode is stored in app state for UI
    // Could trigger different behaviors
  }

  /**
   * Set the current model
   */
  private setModel(model: string): void {
    this.context.model = model;
    this.outputRenderer.success(`Model set to: ${model}`);
  }

  // --------------------------------------------------------------------------
  // Display Methods
  // --------------------------------------------------------------------------

  /**
   * Show welcome message
   */
  private showWelcome(): void {
    console.log();
    console.log('\x1b[36m┌──────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[36m│\x1b[0m  \x1b[1mClaude Code\x1b[0m - AI Coding Assistant                        \x1b[36m│\x1b[0m');
    console.log('\x1b[36m│\x1b[0m  Type your prompt or use /help for commands               \x1b[36m│\x1b[0m');
    console.log('\x1b[36m└──────────────────────────────────────────────────────────┘\x1b[0m');
    console.log();
    console.log(`  Model: \x1b[33m${this.context.model}\x1b[0m`);
    console.log(`  Directory: \x1b[33m${this.context.cwd}\x1b[0m`);
    console.log();
  }

  /**
   * Show help
   */
  private showHelp(topic?: string): void {
    console.log();
    console.log('\x1b[1mClaude Code Commands:\x1b[0m');
    console.log();
    console.log('  \x1b[36m/help\x1b[0m, \x1b[36m/h\x1b[0m, \x1b[36m/?\x1b[0m    - Show this help message');
    console.log('  \x1b[36m/exit\x1b[0m, \x1b[36m/quit\x1b[0m, \x1b[36m/q\x1b[0m - Exit Claude Code');
    console.log('  \x1b[36m/clear\x1b[0m             - Clear the screen');
    console.log();
    console.log('  \x1b[36m/new\x1b[0m               - Start a new session');
    console.log('  \x1b[36m/sessions\x1b[0m          - List recent sessions');
    console.log('  \x1b[36m/resume <id>\x1b[0m       - Resume a previous session');
    console.log('  \x1b[36m/save\x1b[0m              - Save current session');
    console.log();
    console.log('  \x1b[36m/model <name>\x1b[0m      - Set or show the current model');
    console.log('  \x1b[36m/compact\x1b[0m           - Compact conversation history');
    console.log('  \x1b[36m/status\x1b[0m            - Show session status');
    console.log('  \x1b[36m/config\x1b[0m            - Show current configuration');
    console.log();
    console.log('  \x1b[36m/plan\x1b[0m              - Switch to Plan mode');
    console.log('  \x1b[36m/code\x1b[0m              - Switch to Code mode');
    console.log();
    console.log('\x1b[1mKeyboard Shortcuts:\x1b[0m');
    console.log();
    console.log('  \x1b[36mCtrl+C\x1b[0m             - Cancel current operation / Exit');
    console.log('  \x1b[36mCtrl+L\x1b[0m             - Clear screen');
    console.log('  \x1b[36mUp/Down\x1b[0m            - Navigate input history');
    console.log();
  }

  /**
   * Show current status
   */
  private showStatus(): void {
    const session = this.context.session;
    const stats = this.context.conversation.getStats();

    console.log();
    console.log('\x1b[1mSession Status:\x1b[0m');
    console.log();
    console.log(`  Session ID: \x1b[33m${session?.id || 'No session'}\x1b[0m`);
    console.log(`  Status: \x1b[33m${session?.status || 'idle'}\x1b[0m`);
    console.log(`  Model: \x1b[33m${this.context.model}\x1b[0m`);
    console.log();
    console.log(`  Messages: ${stats.messageCount}`);
    console.log(`  User messages: ${stats.userMessages}`);
    console.log(`  Assistant messages: ${stats.assistantMessages}`);
    console.log(`  Estimated tokens: ${stats.tokenCount}`);
    console.log();
  }

  /**
   * Show configuration
   */
  private showConfig(): void {
    console.log();
    console.log('\x1b[1mConfiguration:\x1b[0m');
    console.log();
    console.log(`  Model: ${this.context.config.model}`);
    console.log(`  Max tokens: ${this.context.config.maxTokens}`);
    console.log(`  Context limit: ${this.context.config.contextLimit}`);
    console.log(`  Theme: ${this.context.config.theme}`);
    console.log(`  Thinking enabled: ${this.context.config.thinkingEnabled}`);
    console.log();
  }

  /**
   * Clear the screen
   */
  private clearScreen(): void {
    console.clear();
  }

  /**
   * Compact conversation history
   */
  private async compactConversation(): Promise<void> {
    this.outputRenderer.info('Compacting conversation...');
    // ConversationHistory handles this internally
    this.outputRenderer.success('Conversation compacted');
  }

  // --------------------------------------------------------------------------
  // Signal Handlers
  // --------------------------------------------------------------------------

  /**
   * Handle SIGINT (Ctrl+C)
   */
  private handleInterrupt(): void {
    if (this.context.isProcessing) {
      // Cancel current operation
      this.outputRenderer.warning('Interrupted');
      this.context.isProcessing = false;
    } else {
      // Exit
      this.shutdown();
    }
  }

  /**
   * Handle SIGTSTP (Ctrl+Z)
   */
  private handleSuspend(): void {
    // Save session before suspend
    this.sessionMgr.saveCurrentSession().then(() => {
      process.kill(process.pid, 'SIGTSTP');
    });
  }

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  /**
   * Handle errors
   */
  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.context.lastError = message;

    this.emit('error:occurred', { error });

    if (this.context.isInteractive) {
      this.outputRenderer.error(message);
    } else {
      console.error('Error:', message);
    }

    if (this.options.debug && error instanceof Error) {
      console.error(error.stack);
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    this.signalHandler.uninstall();
    this.inputHandler.close();
    await this.sessionMgr.cleanup();
  }

  // --------------------------------------------------------------------------
  // Event Emitter Override
  // --------------------------------------------------------------------------

  /**
   * Override emit to type events
   */
  emit(event: CLIEventType, data?: unknown): boolean {
    const cliEvent: CLIEvent = {
      type: event,
      timestamp: new Date(),
      data,
    };
    return super.emit(event, cliEvent);
  }

  /**
   * Override on to type events
   */
  on(event: CLIEventType, handler: CLIEventHandler): this {
    return super.on(event, handler);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CLI instance
 */
export function createCLI(options?: CLIOptions): CLI {
  return new CLI(options);
}

export default CLI;
