/**
 * Claude Code API - Anthropic Client
 * Client class để tương tác với Anthropic Messages API
 */

import type {
  CreateMessageRequest,
  CreateMessageResponse,
  ClientOptions,
  Message,
  ToolDefinition,
  SystemPrompt,
  ThinkingConfig,
  ToolChoice,
  StreamEvent,
} from './types';
import {
  AnthropicApiError,
  RateLimitError,
  TimeoutError,
  ConnectionError,
  shouldRetry,
  getRetryDelay,
} from './errors';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from './models';
import type { StreamReaderOptions } from './streaming';
import { streamEvents, readStream } from './streaming';

// ============================================================================
// Constants
// ============================================================================

/** Base URL mặc định cho Anthropic API */
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** API version hiện tại */
const API_VERSION = '2023-06-01';

/** Timeout mặc định (ms) */
const DEFAULT_TIMEOUT = 60_000;

/** Số lần retry mặc định */
const DEFAULT_MAX_RETRIES = 2;

// ============================================================================
// Anthropic Client Class
// ============================================================================

/**
 * Client để tương tác với Anthropic Messages API
 *
 * @example
 * ```typescript
 * const client = new AnthropicClient({ apiKey: 'sk-ant-...' });
 *
 * // Non-streaming request
 * const response = await client.createMessage({
 *   model: 'claude-sonnet-4-20250514',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Streaming request
 * for await (const event of client.streamMessage({
 *   model: 'claude-sonnet-4-20250514',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })) {
 *   if (event.type === 'content_block_delta') {
 *     process.stdout.write(event.delta.text || '');
 *   }
 * }
 * ```
 */
export class AnthropicClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') || DEFAULT_BASE_URL;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.defaultMaxTokens = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Tạo message response (non-streaming)
   */
  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResponse> {
    const fullRequest = this.buildRequest(request, false);
    return this.executeWithRetry(() => this.sendRequest(fullRequest));
  }

  /**
   * Tạo message với streaming response
   * Trả về async generator của events
   */
  async *streamMessage(
    request: CreateMessageRequest
  ): AsyncGenerator<StreamEvent, CreateMessageResponse, undefined> {
    const fullRequest = this.buildRequest(request, true);
    const response = await this.executeWithRetry(() => this.sendStreamRequest(fullRequest));

    if (!response.body) {
      throw new ConnectionError('Response body is empty');
    }

    return yield* streamEvents(response.body);
  }

  /**
   * Stream message với callbacks
   */
  async streamMessageWithCallbacks(
    request: CreateMessageRequest,
    callbacks: StreamReaderOptions
  ): Promise<CreateMessageResponse> {
    const fullRequest = this.buildRequest(request, true);
    const response = await this.executeWithRetry(() => this.sendStreamRequest(fullRequest));

    if (!response.body) {
      throw new ConnectionError('Response body is empty');
    }

    return readStream(response.body, callbacks);
  }

  // ==========================================================================
  // Convenience Methods - Các method tiện lợi
  // ==========================================================================

  /**
   * Gửi một prompt đơn giản và nhận text response
   */
  async complete(
    prompt: string,
    options: Partial<CreateMessageRequest> = {}
  ): Promise<string> {
    const response = await this.createMessage({
      model: options.model || this.defaultModel,
      max_tokens: options.max_tokens || this.defaultMaxTokens,
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });

    // Extract text từ response
    return response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  /**
   * Tạo conversation builder để xây dựng messages dễ dàng hơn
   */
  conversation(): ConversationBuilder {
    return new ConversationBuilder(this);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Build headers cho API request
   */
  private buildHeaders(stream: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
      'anthropic-version': API_VERSION,
    };

    // Thêm beta header nếu cần
    if (stream) {
      headers['Accept'] = 'text/event-stream';
    }

    return headers;
  }

  /**
   * Build full request với defaults
   */
  private buildRequest(
    request: CreateMessageRequest,
    stream: boolean
  ): CreateMessageRequest {
    return {
      ...request,
      model: request.model || this.defaultModel,
      max_tokens: request.max_tokens || this.defaultMaxTokens,
      stream,
    };
  }

  /**
   * Gửi non-streaming request
   */
  private async sendRequest(request: CreateMessageRequest): Promise<CreateMessageResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.buildHeaders(false),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const requestId = response.headers.get('x-request-id') || undefined;

      if (!response.ok) {
        const errorBody = await response.json();
        throw AnthropicApiError.fromResponse(errorBody as unknown as Parameters<typeof AnthropicApiError.fromResponse>[0], response.status, requestId);
      }

      return await response.json() as CreateMessageResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(this.timeout);
      }
      if (error instanceof AnthropicApiError) {
        throw error;
      }
      throw new ConnectionError(
        `Failed to connect to Anthropic API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Gửi streaming request và trả về raw response
   */
  private async sendStreamRequest(request: CreateMessageRequest): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const requestId = response.headers.get('x-request-id') || undefined;

      if (!response.ok) {
        const errorBody = await response.json();
        throw AnthropicApiError.fromResponse(errorBody as unknown as Parameters<typeof AnthropicApiError.fromResponse>[0], response.status, requestId);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(this.timeout);
      }
      if (error instanceof AnthropicApiError) {
        throw error;
      }
      throw new ConnectionError(
        `Failed to connect to Anthropic API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Execute request với retry logic
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Không retry nếu là lần cuối hoặc error không retryable
        if (attempt === this.maxRetries || !shouldRetry(error)) {
          throw error;
        }

        // Lấy retry delay
        let delay = getRetryDelay(attempt);

        // Nếu là rate limit error với retry-after, sử dụng giá trị đó
        if (error instanceof RateLimitError && error.retryAfter) {
          delay = error.retryAfter * 1000;
        }

        // Chờ trước khi retry
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Conversation Builder - Xây dựng conversation dễ dàng
// ============================================================================

/**
 * Builder pattern để xây dựng và gửi conversation
 */
export class ConversationBuilder {
  private client: AnthropicClient;
  private messages: Message[] = [];
  private systemPrompt?: SystemPrompt;
  private tools?: ToolDefinition[];
  private toolChoice?: ToolChoice;
  private model?: string;
  private maxTokens?: number;
  private temperature?: number;
  private thinking?: ThinkingConfig;

  constructor(client: AnthropicClient) {
    this.client = client;
  }

  /**
   * Set system prompt
   */
  system(prompt: SystemPrompt): this {
    this.systemPrompt = prompt;
    return this;
  }

  /**
   * Thêm user message
   */
  user(content: string): this {
    this.messages.push({ role: 'user', content });
    return this;
  }

  /**
   * Thêm assistant message
   */
  assistant(content: string): this {
    this.messages.push({ role: 'assistant', content });
    return this;
  }

  /**
   * Set model
   */
  useModel(model: string): this {
    this.model = model;
    return this;
  }

  /**
   * Set max tokens
   */
  withMaxTokens(maxTokens: number): this {
    this.maxTokens = maxTokens;
    return this;
  }

  /**
   * Set temperature
   */
  withTemperature(temperature: number): this {
    this.temperature = temperature;
    return this;
  }

  /**
   * Enable extended thinking
   */
  withThinking(budgetTokens: number): this {
    this.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    return this;
  }

  /**
   * Set tools
   */
  withTools(tools: ToolDefinition[], choice?: ToolChoice): this {
    this.tools = tools;
    this.toolChoice = choice;
    return this;
  }

  /**
   * Build request object
   */
  buildRequest(): CreateMessageRequest {
    return {
      model: this.model || '',
      max_tokens: this.maxTokens || 0,
      messages: this.messages,
      system: this.systemPrompt,
      tools: this.tools,
      tool_choice: this.toolChoice,
      temperature: this.temperature,
      thinking: this.thinking,
    };
  }

  /**
   * Gửi request và nhận response
   */
  async send(): Promise<CreateMessageResponse> {
    return this.client.createMessage(this.buildRequest());
  }

  /**
   * Gửi request với streaming
   */
  async *stream(): AsyncGenerator<StreamEvent, CreateMessageResponse, undefined> {
    return yield* this.client.streamMessage(this.buildRequest());
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Tạo Anthropic client từ environment variable
 */
export function createClientFromEnv(options: Partial<ClientOptions> = {}): AnthropicClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  return new AnthropicClient({
    apiKey,
    ...options,
  });
}

/**
 * Tạo Anthropic client
 */
export function createClient(options: ClientOptions): AnthropicClient {
  return new AnthropicClient(options);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Tạo user message
 */
export function createUserMessage(content: string): Message {
  return {
    role: 'user',
    content,
  };
}

/**
 * Tạo assistant message
 */
export function createAssistantMessage(content: string): Message {
  return {
    role: 'assistant',
    content,
  };
}

/**
 * Tạo tool result message
 */
export function createToolResultMessage(
  toolUseId: string,
  result: string,
  isError = false
): Message {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result,
        is_error: isError,
      },
    ],
  };
}
