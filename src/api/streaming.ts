/**
 * Claude Code API - Stream Handler
 * Xử lý Server-Sent Events (SSE) từ Anthropic API
 */

import type {
  StreamEvent,
  ContentBlock,
  ContentDelta,
  Usage,
  StopReason,
  CreateMessageResponse,
} from './types';
import { ParseError, StreamAbortedError } from './errors';

// ============================================================================
// Stream Message Builder - Xây dựng message từ stream events
// ============================================================================

/**
 * State của message đang được build từ stream
 */
export interface StreamMessageState {
  id: string;
  model: string;
  content: ContentBlock[];
  usage: Usage;
  stopReason: StopReason | null;
  stopSequence: string | null;
}

/**
 * Builder class để xây dựng message từ stream events
 */
export class StreamMessageBuilder {
  private id: string = '';
  private model: string = '';
  private content: ContentBlock[] = [];
  private currentBlockIndex: number = -1;
  private usage: Usage = { input_tokens: 0, output_tokens: 0 };
  private stopReason: StopReason | null = null;
  private stopSequence: string | null = null;

  /**
   * Xử lý một stream event
   */
  processEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'message_start':
        this.id = event.message.id;
        this.model = event.message.model;
        this.usage = event.message.usage;
        break;

      case 'content_block_start':
        this.currentBlockIndex = event.index;
        // Khởi tạo content block mới
        this.content[event.index] = this.initContentBlock(event.content_block);
        break;

      case 'content_block_delta':
        this.applyDelta(event.index, event.delta);
        break;

      case 'content_block_stop':
        // Block đã hoàn thành, không cần làm gì thêm
        break;

      case 'message_delta':
        this.stopReason = event.delta.stop_reason;
        this.stopSequence = event.delta.stop_sequence;
        this.usage.output_tokens = event.usage.output_tokens;
        break;

      case 'message_stop':
        // Message hoàn thành
        break;

      case 'ping':
        // Ping để giữ kết nối, bỏ qua
        break;

      case 'error':
        throw new Error(`Stream error: ${event.error.message}`);
    }
  }

  /**
   * Khởi tạo content block từ partial data
   */
  private initContentBlock(partial: Partial<ContentBlock>): ContentBlock {
    switch (partial.type) {
      case 'text':
        return { type: 'text', text: '' };
      case 'thinking':
        return { type: 'thinking', thinking: '' };
      case 'tool_use':
        return {
          type: 'tool_use',
          id: (partial as any).id || '',
          name: (partial as any).name || '',
          input: {},
        };
      default:
        return { type: 'text', text: '' };
    }
  }

  /**
   * Áp dụng delta vào content block
   */
  private applyDelta(index: number, delta: ContentDelta): void {
    const block = this.content[index];
    if (!block) return;

    switch (delta.type) {
      case 'text_delta':
        if (block.type === 'text') {
          block.text += delta.text;
        }
        break;

      case 'thinking_delta':
        if (block.type === 'thinking') {
          block.thinking += delta.thinking;
        }
        break;

      case 'input_json_delta':
        if (block.type === 'tool_use') {
          // Accumulate partial JSON, sẽ parse khi block hoàn thành
          (block as any)._partialJson =
            ((block as any)._partialJson || '') + delta.partial_json;
        }
        break;
    }
  }

  /**
   * Lấy state hiện tại của message
   */
  getState(): StreamMessageState {
    return {
      id: this.id,
      model: this.model,
      content: this.content,
      usage: this.usage,
      stopReason: this.stopReason,
      stopSequence: this.stopSequence,
    };
  }

  /**
   * Build message response hoàn chỉnh
   */
  build(): CreateMessageResponse {
    // Parse tool_use input JSON nếu có
    const finalContent = this.content.map(block => {
      if (block.type === 'tool_use' && (block as any)._partialJson) {
        try {
          (block as any).input = JSON.parse((block as any)._partialJson);
        } catch {
          // Giữ nguyên nếu không parse được
        }
        delete (block as any)._partialJson;
      }
      return block;
    });

    return {
      id: this.id,
      type: 'message',
      role: 'assistant',
      model: this.model,
      content: finalContent,
      stop_reason: this.stopReason,
      stop_sequence: this.stopSequence,
      usage: this.usage,
    };
  }

  /**
   * Reset builder về trạng thái ban đầu
   */
  reset(): void {
    this.id = '';
    this.model = '';
    this.content = [];
    this.currentBlockIndex = -1;
    this.usage = { input_tokens: 0, output_tokens: 0 };
    this.stopReason = null;
    this.stopSequence = null;
  }
}

// ============================================================================
// SSE Parser - Parse Server-Sent Events
// ============================================================================

/**
 * Parse SSE event line thành object
 */
export function parseSSELine(line: string): { event?: string; data?: string } | null {
  const trimmed = line.trim();

  // Bỏ qua comment lines và empty lines
  if (trimmed === '' || trimmed.startsWith(':')) {
    return null;
  }

  // Parse "event: xxx" hoặc "data: xxx"
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const field = trimmed.slice(0, colonIndex);
  // Value bắt đầu sau ": " (có thể có space sau colon)
  let value = trimmed.slice(colonIndex + 1);
  if (value.startsWith(' ')) {
    value = value.slice(1);
  }

  if (field === 'event') {
    return { event: value };
  }
  if (field === 'data') {
    return { data: value };
  }

  return null;
}

/**
 * Parse JSON data thành StreamEvent
 */
export function parseStreamEvent(data: string): StreamEvent {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch (error) {
    throw new ParseError(`Failed to parse stream event: ${error}`, data);
  }
}

// ============================================================================
// Stream Reader - Async iterator cho stream
// ============================================================================

/**
 * Options cho stream reader
 */
export interface StreamReaderOptions {
  /** Callback khi có text mới */
  onText?: (text: string) => void;
  /** Callback khi có thinking mới */
  onThinking?: (thinking: string) => void;
  /** Callback khi tool_use bắt đầu */
  onToolUseStart?: (id: string, name: string) => void;
  /** Callback khi có input_json mới cho tool */
  onToolUseInput?: (id: string, partialJson: string) => void;
  /** Callback khi message hoàn thành */
  onComplete?: (message: CreateMessageResponse) => void;
  /** Signal để abort */
  signal?: AbortSignal;
}

/**
 * Đọc và xử lý SSE stream từ response body
 *
 * @param body - ReadableStream từ fetch response
 * @param options - Callbacks và options
 * @returns Message response hoàn chỉnh
 */
export async function readStream(
  body: ReadableStream<Uint8Array>,
  options: StreamReaderOptions = {}
): Promise<CreateMessageResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const builder = new StreamMessageBuilder();

  let buffer = '';
  let currentEvent = '';

  // Xử lý abort signal
  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      reader.cancel();
    });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode chunk và thêm vào buffer
      buffer += decoder.decode(value, { stream: true });

      // Xử lý từng line trong buffer
      const lines = buffer.split('\n');
      // Giữ lại phần chưa hoàn chỉnh (không có \n ở cuối)
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parsed = parseSSELine(line);
        if (!parsed) continue;

        if (parsed.event !== undefined) {
          currentEvent = parsed.event;
        }

        if (parsed.data !== undefined) {
          const event = parseStreamEvent(parsed.data);
          builder.processEvent(event);

          // Gọi callbacks tương ứng
          triggerCallbacks(event, builder, options);
        }
      }
    }

    // Xử lý phần còn lại trong buffer
    if (buffer.trim()) {
      const parsed = parseSSELine(buffer);
      if (parsed?.data) {
        const event = parseStreamEvent(parsed.data);
        builder.processEvent(event);
      }
    }

    const message = builder.build();

    if (options.onComplete) {
      options.onComplete(message);
    }

    return message;
  } catch (error) {
    if (options.signal?.aborted) {
      throw new StreamAbortedError('Stream was aborted by user');
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Trigger callbacks dựa trên event type
 */
function triggerCallbacks(
  event: StreamEvent,
  builder: StreamMessageBuilder,
  options: StreamReaderOptions
): void {
  switch (event.type) {
    case 'content_block_delta':
      if (event.delta.type === 'text_delta' && options.onText) {
        options.onText(event.delta.text);
      }
      if (event.delta.type === 'thinking_delta' && options.onThinking) {
        options.onThinking(event.delta.thinking);
      }
      if (event.delta.type === 'input_json_delta' && options.onToolUseInput) {
        const state = builder.getState();
        const block = state.content[event.index];
        if (block?.type === 'tool_use') {
          options.onToolUseInput(block.id, event.delta.partial_json);
        }
      }
      break;

    case 'content_block_start':
      if (event.content_block.type === 'tool_use' && options.onToolUseStart) {
        const block = event.content_block as any;
        options.onToolUseStart(block.id || '', block.name || '');
      }
      break;
  }
}

// ============================================================================
// Async Iterator Interface - Cho phép dùng for-await-of
// ============================================================================

/**
 * Tạo async iterator cho stream events
 */
export async function* streamEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent, CreateMessageResponse, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const builder = new StreamMessageBuilder();

  let buffer = '';

  if (signal) {
    signal.addEventListener('abort', () => {
      reader.cancel();
    });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parsed = parseSSELine(line);
        if (!parsed?.data) continue;

        const event = parseStreamEvent(parsed.data);
        builder.processEvent(event);
        yield event;
      }
    }

    // Xử lý phần còn lại
    if (buffer.trim()) {
      const parsed = parseSSELine(buffer);
      if (parsed?.data) {
        const event = parseStreamEvent(parsed.data);
        builder.processEvent(event);
        yield event;
      }
    }

    return builder.build();
  } catch (error) {
    if (signal?.aborted) {
      throw new StreamAbortedError('Stream was aborted');
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Stream Utilities
// ============================================================================

/**
 * Collect tất cả text từ stream thành string
 */
export async function collectStreamText(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<{ text: string; response: CreateMessageResponse }> {
  let text = '';

  const response = await readStream(body, {
    onText: (chunk) => {
      text += chunk;
    },
    signal,
  });

  return { text, response };
}

/**
 * Extract text content từ message response
 */
export function extractTextFromMessage(message: CreateMessageResponse): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('');
}

/**
 * Extract tool uses từ message response
 */
export function extractToolUsesFromMessage(message: CreateMessageResponse): Array<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}> {
  return message.content
    .filter((block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
      block.type === 'tool_use'
    )
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }));
}
