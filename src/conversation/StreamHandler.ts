/**
 * StreamHandler
 * Handle streaming responses from Claude API
 */

import { EventEmitter } from 'events';
import {
  StreamEvent,
  ConversationMessage,
  MessageContent,
  TextContent,
  ToolUseContent,
  ThinkingContent,
} from './types';
import { randomUUID } from 'crypto';

/**
 * Event data types for stream processing
 */
interface MessageStartData {
  id: string;
  type: string;
  role: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface ContentBlockStartData {
  index: number;
  content_block: {
    type: string;
    id?: string;
    name?: string;
    text?: string;
    thinking?: string;
    input?: Record<string, unknown>;
  };
}

interface ContentBlockDeltaData {
  index: number;
  delta: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
}

interface MessageDeltaData {
  delta: {
    stop_reason?: string;
    stop_sequence?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

/**
 * Handles streaming responses from the Claude API
 */
export class StreamHandler extends EventEmitter {
  private buffer: string = '';
  private currentMessage: Partial<ConversationMessage> | null = null;
  private contentBlocks: Map<number, Partial<MessageContent>> = new Map();
  private accumulatedInput: string = '';
  private onEventCallback?: (event: StreamEvent) => void;

  // Callback handlers
  private textCallback?: (text: string) => void;
  private toolUseCallback?: (toolUse: ToolUseContent) => void;
  private thinkingCallback?: (thinking: string) => void;
  private completeCallback?: (message: ConversationMessage) => void;
  private errorCallback?: (error: Error) => void;

  constructor(onEvent?: (event: StreamEvent) => void) {
    super();
    this.onEventCallback = onEvent;
  }

  /**
   * Process a chunk of streaming data
   */
  processChunk(chunk: string): void {
    this.buffer += chunk;

    // Process complete lines (SSE format)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      this.processLine(line);
    }
  }

  /**
   * Process a single line of SSE data
   */
  private processLine(line: string): void {
    // Skip empty lines and comments
    if (!line || line.startsWith(':')) {
      return;
    }

    // Handle event type lines
    if (line.startsWith('event: ')) {
      // Event type is handled with the subsequent data line
      return;
    }

    // Handle data lines
    if (line.startsWith('data: ')) {
      const dataStr = line.slice(6);

      try {
        const data = JSON.parse(dataStr);
        this.handleEvent(data);
      } catch (error) {
        // Handle non-JSON data or partial data
        if (dataStr !== '[DONE]') {
          console.debug('Non-JSON stream data:', dataStr);
        }
      }
    }
  }

  /**
   * Handle a parsed stream event
   */
  private handleEvent(data: Record<string, unknown>): void {
    const eventType = data.type as StreamEvent['type'];

    // Emit raw event for external handlers
    const event: StreamEvent = { type: eventType, data };
    this.emit('event', event);
    this.onEventCallback?.(event);

    switch (eventType) {
      case 'message_start':
        this.handleMessageStart(data.message as MessageStartData);
        break;
      case 'content_block_start':
        this.handleContentBlockStart(data as unknown as ContentBlockStartData);
        break;
      case 'content_block_delta':
        this.handleContentBlockDelta(data as unknown as ContentBlockDeltaData);
        break;
      case 'content_block_stop':
        this.handleContentBlockStop(data as { index: number });
        break;
      case 'message_delta':
        this.handleMessageDelta(data as unknown as MessageDeltaData);
        break;
      case 'message_stop':
        this.handleMessageStop();
        break;
      case 'error':
        this.handleError(data.error as { type: string; message: string });
        break;
    }
  }

  /**
   * Handle message_start event
   */
  private handleMessageStart(message: MessageStartData): void {
    this.currentMessage = {
      id: message.id || randomUUID(),
      role: message.role as 'assistant',
      content: [],
      timestamp: new Date(),
    };
    this.contentBlocks.clear();
    this.emit('message_start', message);
  }

  /**
   * Handle content_block_start event
   */
  private handleContentBlockStart(data: ContentBlockStartData): void {
    const { index, content_block } = data;

    let block: Partial<MessageContent>;

    switch (content_block.type) {
      case 'text':
        block = {
          type: 'text',
          text: content_block.text || '',
        };
        break;
      case 'tool_use':
        block = {
          type: 'tool_use',
          id: content_block.id || '',
          name: content_block.name || '',
          input: content_block.input || {},
        };
        this.accumulatedInput = '';
        break;
      case 'thinking':
        block = {
          type: 'thinking',
          thinking: content_block.thinking || '',
        };
        break;
      default:
        block = { type: content_block.type as 'text' };
    }

    this.contentBlocks.set(index, block);
    this.emit('content_block_start', { index, block });
  }

  /**
   * Handle content_block_delta event
   */
  private handleContentBlockDelta(data: ContentBlockDeltaData): void {
    const { index, delta } = data;
    const block = this.contentBlocks.get(index);

    if (!block) return;

    switch (delta.type) {
      case 'text_delta':
        if (block.type === 'text' && delta.text) {
          (block as TextContent).text += delta.text;
          this.textCallback?.(delta.text);
          this.emit('text', delta.text);
        }
        break;
      case 'thinking_delta':
        if (block.type === 'thinking' && delta.thinking) {
          (block as ThinkingContent).thinking += delta.thinking;
          this.thinkingCallback?.(delta.thinking);
          this.emit('thinking', delta.thinking);
        }
        break;
      case 'input_json_delta':
        if (block.type === 'tool_use' && delta.partial_json) {
          this.accumulatedInput += delta.partial_json;
        }
        break;
    }

    this.emit('content_block_delta', { index, delta, block });
  }

  /**
   * Handle content_block_stop event
   */
  private handleContentBlockStop(data: { index: number }): void {
    const { index } = data;
    const block = this.contentBlocks.get(index);

    if (!block) return;

    // Parse accumulated JSON for tool_use blocks
    if (block.type === 'tool_use' && this.accumulatedInput) {
      try {
        (block as ToolUseContent).input = JSON.parse(this.accumulatedInput);
      } catch (error) {
        console.error('Failed to parse tool input JSON:', error);
        (block as ToolUseContent).input = { raw: this.accumulatedInput };
      }
      this.accumulatedInput = '';
    }

    // Emit completed tool use
    if (block.type === 'tool_use') {
      const toolUse = block as ToolUseContent;
      this.toolUseCallback?.(toolUse);
      this.emit('tool_use', toolUse);
    }

    // Add completed block to message content
    if (this.currentMessage && block.type) {
      this.currentMessage.content = this.currentMessage.content || [];
      this.currentMessage.content.push(block as MessageContent);
    }

    this.emit('content_block_stop', { index, block });
  }

  /**
   * Handle message_delta event
   */
  private handleMessageDelta(data: MessageDeltaData): void {
    this.emit('message_delta', data);
  }

  /**
   * Handle message_stop event
   */
  private handleMessageStop(): void {
    if (this.currentMessage) {
      const message: ConversationMessage = {
        id: this.currentMessage.id || randomUUID(),
        role: this.currentMessage.role || 'assistant',
        content: this.currentMessage.content || [],
        timestamp: this.currentMessage.timestamp || new Date(),
      };

      this.completeCallback?.(message);
      this.emit('complete', message);
    }

    this.currentMessage = null;
    this.contentBlocks.clear();
  }

  /**
   * Handle error event
   */
  private handleError(error: { type: string; message: string }): void {
    const err = new Error(`${error.type}: ${error.message}`);
    this.errorCallback?.(err);
    this.emit('error', err);
  }

  /**
   * Register callback for text content
   */
  onText(callback: (text: string) => void): this {
    this.textCallback = callback;
    return this;
  }

  /**
   * Register callback for tool use
   */
  onToolUse(callback: (toolUse: ToolUseContent) => void): this {
    this.toolUseCallback = callback;
    return this;
  }

  /**
   * Register callback for thinking content
   */
  onThinking(callback: (thinking: string) => void): this {
    this.thinkingCallback = callback;
    return this;
  }

  /**
   * Register callback for complete message
   */
  onComplete(callback: (message: ConversationMessage) => void): this {
    this.completeCallback = callback;
    return this;
  }

  /**
   * Register callback for errors
   */
  onError(callback: (error: Error) => void): this {
    this.errorCallback = callback;
    return this;
  }

  /**
   * Reset the handler state
   */
  reset(): void {
    this.buffer = '';
    this.currentMessage = null;
    this.contentBlocks.clear();
    this.accumulatedInput = '';
  }

  /**
   * Get the current accumulated text
   */
  getAccumulatedText(): string {
    let text = '';
    for (const block of this.contentBlocks.values()) {
      if (block.type === 'text') {
        text += (block as TextContent).text;
      }
    }
    return text;
  }

  /**
   * Get all tool uses from the current message
   */
  getToolUses(): ToolUseContent[] {
    const toolUses: ToolUseContent[] = [];
    for (const block of this.contentBlocks.values()) {
      if (block.type === 'tool_use') {
        toolUses.push(block as ToolUseContent);
      }
    }
    return toolUses;
  }

  /**
   * Check if the stream is complete
   */
  isComplete(): boolean {
    return this.currentMessage === null && this.contentBlocks.size === 0;
  }

  /**
   * Flush any remaining buffer content
   */
  flush(): void {
    if (this.buffer) {
      this.processLine(this.buffer);
      this.buffer = '';
    }
  }
}

/**
 * Create a stream handler with builder pattern
 */
export function createStreamHandler(
  onEvent?: (event: StreamEvent) => void
): StreamHandler {
  return new StreamHandler(onEvent);
}
