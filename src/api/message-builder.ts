/**
 * Claude Code API - Message Builder Utilities
 * Helpers để xây dựng messages và conversations
 */

import type {
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
  ImageSource,
  DocumentBlock,
  ToolDefinition,
  SystemPrompt,
  SystemPromptBlock,
  CreateMessageRequest,
} from './types';

// ============================================================================
// Message Creation Helpers
// ============================================================================

/**
 * Create a user message with text content
 */
export function userMessage(content: string): Message {
  return {
    role: 'user',
    content,
  };
}

/**
 * Create a user message with content blocks
 */
export function userMessageBlocks(blocks: ContentBlock[]): Message {
  return {
    role: 'user',
    content: blocks,
  };
}

/**
 * Create an assistant message with text content
 */
export function assistantMessage(content: string): Message {
  return {
    role: 'assistant',
    content,
  };
}

/**
 * Create an assistant message with content blocks
 */
export function assistantMessageBlocks(blocks: ContentBlock[]): Message {
  return {
    role: 'assistant',
    content: blocks,
  };
}

// ============================================================================
// Content Block Helpers
// ============================================================================

/**
 * Create a text content block
 */
export function textBlock(text: string): TextBlock {
  return {
    type: 'text',
    text,
  };
}

/**
 * Create a tool use content block
 */
export function toolUseBlock(
  id: string,
  name: string,
  input: Record<string, unknown>
): ToolUseBlock {
  return {
    type: 'tool_use',
    id,
    name,
    input,
  };
}

/**
 * Create a tool result content block
 */
export function toolResultBlock(
  toolUseId: string,
  content: string | ContentBlock[],
  isError: boolean = false
): ToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  };
}

/**
 * Create a tool result message (wraps tool result in user message)
 */
export function toolResultMessage(
  toolUseId: string,
  result: string,
  isError: boolean = false
): Message {
  return {
    role: 'user',
    content: [toolResultBlock(toolUseId, result, isError)],
  };
}

/**
 * Create multiple tool result messages
 */
export function toolResultsMessage(
  results: Array<{ toolUseId: string; result: string; isError?: boolean }>
): Message {
  return {
    role: 'user',
    content: results.map(r => toolResultBlock(r.toolUseId, r.result, r.isError ?? false)),
  };
}

/**
 * Create an image content block from base64 data
 */
export function imageBlockBase64(
  data: string,
  mediaType: ImageSource['media_type'] = 'image/png'
): ImageBlock {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data,
    },
  };
}

/**
 * Create an image content block from URL
 */
export function imageBlockUrl(
  url: string,
  mediaType: ImageSource['media_type'] = 'image/png'
): ImageBlock {
  return {
    type: 'image',
    source: {
      type: 'url',
      media_type: mediaType,
      url,
    },
  };
}

/**
 * Create a PDF document content block
 */
export function documentBlockPdf(base64Data: string): DocumentBlock {
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: base64Data,
    },
  };
}

// ============================================================================
// System Prompt Helpers
// ============================================================================

/**
 * Create a simple system prompt
 */
export function systemPrompt(text: string): SystemPrompt {
  return text;
}

/**
 * Create a system prompt with caching
 */
export function systemPromptWithCache(text: string): SystemPromptBlock[] {
  return [
    {
      type: 'text',
      text,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/**
 * Create a multi-part system prompt
 */
export function systemPromptParts(parts: string[]): SystemPromptBlock[] {
  return parts.map(text => ({
    type: 'text',
    text,
  }));
}

/**
 * Combine system prompts
 */
export function combineSystemPrompts(
  ...prompts: (string | SystemPromptBlock[] | undefined)[]
): SystemPrompt {
  const blocks: SystemPromptBlock[] = [];

  for (const prompt of prompts) {
    if (!prompt) continue;

    if (typeof prompt === 'string') {
      blocks.push({ type: 'text', text: prompt });
    } else {
      blocks.push(...prompt);
    }
  }

  // If only one block with no cache control, return as string
  if (blocks.length === 1 && !blocks[0].cache_control) {
    return blocks[0].text;
  }

  return blocks;
}

// ============================================================================
// Tool Definition Helpers
// ============================================================================

/**
 * Create a tool definition
 */
export function toolDefinition(
  name: string,
  description: string,
  parameters: {
    properties?: Record<string, unknown>;
    required?: string[];
  }
): ToolDefinition {
  return {
    name,
    description,
    input_schema: {
      type: 'object',
      properties: parameters.properties as Record<string, import('./types').JsonSchemaProperty>,
      required: parameters.required,
    },
  };
}

/**
 * Create a simple tool with string parameters
 */
export function simpleToolDefinition(
  name: string,
  description: string,
  params: Record<string, { description: string; required?: boolean }>
): ToolDefinition {
  const properties: Record<string, import('./types').JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, config] of Object.entries(params)) {
    properties[key] = {
      type: 'string',
      description: config.description,
    };
    if (config.required !== false) {
      required.push(key);
    }
  }

  return {
    name,
    description,
    input_schema: {
      type: 'object',
      properties,
      required,
    },
  };
}

// ============================================================================
// Conversation Builder
// ============================================================================

/**
 * Fluent builder for constructing conversations
 */
export class MessageBuilder {
  private messages: Message[] = [];
  private systemPromptValue?: SystemPrompt;
  private toolsValue?: ToolDefinition[];
  private modelValue?: string;
  private maxTokensValue?: number;
  private temperatureValue?: number;

  /**
   * Set the system prompt
   */
  system(prompt: string | SystemPromptBlock[]): this {
    this.systemPromptValue = prompt;
    return this;
  }

  /**
   * Append to system prompt
   */
  appendSystem(text: string): this {
    if (!this.systemPromptValue) {
      this.systemPromptValue = text;
    } else if (typeof this.systemPromptValue === 'string') {
      this.systemPromptValue = this.systemPromptValue + '\n\n' + text;
    } else {
      this.systemPromptValue.push({ type: 'text', text });
    }
    return this;
  }

  /**
   * Add a user message
   */
  user(content: string | ContentBlock[]): this {
    this.messages.push({
      role: 'user',
      content,
    });
    return this;
  }

  /**
   * Add an assistant message
   */
  assistant(content: string | ContentBlock[]): this {
    this.messages.push({
      role: 'assistant',
      content,
    });
    return this;
  }

  /**
   * Add a tool result
   */
  toolResult(
    toolUseId: string,
    result: string,
    isError: boolean = false
  ): this {
    // Check if last message is user with tool_result, append to it
    const lastMessage = this.messages[this.messages.length - 1];
    if (
      lastMessage &&
      lastMessage.role === 'user' &&
      Array.isArray(lastMessage.content) &&
      lastMessage.content.every(b => (b as ContentBlock).type === 'tool_result')
    ) {
      (lastMessage.content as ContentBlock[]).push(
        toolResultBlock(toolUseId, result, isError)
      );
    } else {
      this.messages.push(toolResultMessage(toolUseId, result, isError));
    }
    return this;
  }

  /**
   * Add an existing message
   */
  addMessage(message: Message): this {
    this.messages.push(message);
    return this;
  }

  /**
   * Add multiple messages
   */
  addMessages(messages: Message[]): this {
    this.messages.push(...messages);
    return this;
  }

  /**
   * Set tools
   */
  tools(tools: ToolDefinition[]): this {
    this.toolsValue = tools;
    return this;
  }

  /**
   * Add a tool
   */
  addTool(tool: ToolDefinition): this {
    if (!this.toolsValue) {
      this.toolsValue = [];
    }
    this.toolsValue.push(tool);
    return this;
  }

  /**
   * Set model
   */
  model(model: string): this {
    this.modelValue = model;
    return this;
  }

  /**
   * Set max tokens
   */
  maxTokens(tokens: number): this {
    this.maxTokensValue = tokens;
    return this;
  }

  /**
   * Set temperature
   */
  temperature(temp: number): this {
    this.temperatureValue = temp;
    return this;
  }

  /**
   * Get messages array
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Get system prompt
   */
  getSystemPrompt(): SystemPrompt | undefined {
    return this.systemPromptValue;
  }

  /**
   * Get tools
   */
  getTools(): ToolDefinition[] | undefined {
    return this.toolsValue;
  }

  /**
   * Build the complete request
   */
  build(): CreateMessageRequest {
    if (this.messages.length === 0) {
      throw new Error('At least one message is required');
    }
    if (!this.modelValue) {
      throw new Error('Model is required');
    }
    if (!this.maxTokensValue) {
      throw new Error('Max tokens is required');
    }

    return {
      model: this.modelValue,
      max_tokens: this.maxTokensValue,
      messages: this.messages,
      system: this.systemPromptValue,
      tools: this.toolsValue,
      temperature: this.temperatureValue,
    };
  }

  /**
   * Build partial request (without required checks)
   */
  buildPartial(): Partial<CreateMessageRequest> {
    return {
      model: this.modelValue,
      max_tokens: this.maxTokensValue,
      messages: this.messages.length > 0 ? this.messages : undefined,
      system: this.systemPromptValue,
      tools: this.toolsValue,
      temperature: this.temperatureValue,
    };
  }

  /**
   * Clone the builder
   */
  clone(): MessageBuilder {
    const cloned = new MessageBuilder();
    cloned.messages = [...this.messages];
    cloned.systemPromptValue = this.systemPromptValue;
    cloned.toolsValue = this.toolsValue ? [...this.toolsValue] : undefined;
    cloned.modelValue = this.modelValue;
    cloned.maxTokensValue = this.maxTokensValue;
    cloned.temperatureValue = this.temperatureValue;
    return cloned;
  }

  /**
   * Clear all messages (keep other config)
   */
  clearMessages(): this {
    this.messages = [];
    return this;
  }

  /**
   * Reset everything
   */
  reset(): this {
    this.messages = [];
    this.systemPromptValue = undefined;
    this.toolsValue = undefined;
    this.modelValue = undefined;
    this.maxTokensValue = undefined;
    this.temperatureValue = undefined;
    return this;
  }
}

/**
 * Create a new message builder
 */
export function createMessageBuilder(): MessageBuilder {
  return new MessageBuilder();
}

// ============================================================================
// Conversation Utilities
// ============================================================================

/**
 * Extract the last assistant message text
 */
export function getLastAssistantText(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    if (typeof msg.content === 'string') {
      return msg.content;
    }

    const textBlocks = (msg.content as ContentBlock[]).filter(
      b => b.type === 'text'
    ) as TextBlock[];

    if (textBlocks.length > 0) {
      return textBlocks.map(b => b.text).join('');
    }
  }
  return null;
}

/**
 * Extract all tool uses from messages
 */
export function extractToolUses(
  messages: Message[]
): Array<{ message: Message; toolUse: ToolUseBlock }> {
  const results: Array<{ message: Message; toolUse: ToolUseBlock }> = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    if (typeof msg.content === 'string') continue;

    const toolUses = (msg.content as ContentBlock[]).filter(
      b => b.type === 'tool_use'
    ) as ToolUseBlock[];

    for (const toolUse of toolUses) {
      results.push({ message: msg, toolUse });
    }
  }

  return results;
}

/**
 * Check if messages end with a tool use (needs tool result)
 */
export function needsToolResult(messages: Message[]): boolean {
  if (messages.length === 0) return false;

  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role !== 'assistant') return false;
  if (typeof lastMsg.content === 'string') return false;

  return (lastMsg.content as ContentBlock[]).some(b => b.type === 'tool_use');
}

/**
 * Get pending tool uses (those without results)
 */
export function getPendingToolUses(messages: Message[]): ToolUseBlock[] {
  const toolUses = new Map<string, ToolUseBlock>();
  const answeredIds = new Set<string>();

  for (const msg of messages) {
    if (typeof msg.content === 'string') continue;

    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'tool_use') {
        toolUses.set(block.id, block);
      } else if (block.type === 'tool_result') {
        answeredIds.add(block.tool_use_id);
      }
    }
  }

  return Array.from(toolUses.values()).filter(tu => !answeredIds.has(tu.id));
}

/**
 * Validate message array structure
 */
export function validateMessages(messages: Message[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (messages.length === 0) {
    errors.push('Messages array cannot be empty');
    return { valid: false, errors };
  }

  // Check first message is from user
  if (messages[0].role !== 'user') {
    errors.push('First message must be from user');
  }

  // Check alternating pattern and tool result rules
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    // Check for consecutive same-role messages (except tool results)
    if (prev.role === curr.role && curr.role !== 'user') {
      errors.push(`Consecutive ${curr.role} messages at index ${i - 1} and ${i}`);
    }

    // Check tool result follows tool use
    if (curr.role === 'user' && Array.isArray(curr.content)) {
      const hasToolResult = (curr.content as ContentBlock[]).some(
        b => b.type === 'tool_result'
      );
      if (hasToolResult && prev.role !== 'assistant') {
        errors.push(`Tool result at index ${i} must follow assistant message`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
