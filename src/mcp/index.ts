/**
 * Model Context Protocol (MCP) Module
 *
 * MCP (Model Context Protocol) cho phép Claude tương tác với các external tools
 * và services một cách an toàn và có cấu trúc.
 *
 * Module này bao gồm:
 * - MCPClient: Client để connect đến MCP servers
 * - MCPServer: Server để cung cấp tools/resources/prompts
 * - Transport: Các transport layers (stdio, SSE, HTTP)
 * - ToolRegistry: Quản lý và tìm kiếm tools
 * - ResourceManager: Quản lý và cache resources
 *
 * @example
 * ```typescript
 * import {
 *   MCPClient,
 *   StdioTransport,
 *   ToolRegistry,
 * } from './mcp';
 *
 * // Tạo client và connect đến server
 * const transport = new StdioTransport({
 *   command: 'node',
 *   args: ['./my-server.js'],
 * });
 *
 * const client = new MCPClient({
 *   clientInfo: { name: 'my-app', version: '1.0.0' },
 * });
 *
 * await client.connect(transport);
 *
 * // Liệt kê và gọi tools
 * const tools = await client.listTools();
 * const result = await client.callTool('my-tool', { arg: 'value' });
 * ```
 *
 * @see https://modelcontextprotocol.io/
 */

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  // JSON-RPC Types
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcError,
  McpMessage,

  // Initialization Types
  ClientCapabilities,
  ServerCapabilities,
  ImplementationInfo,
  InitializeRequest,
  InitializeResult,
  InitializedNotification,

  // Tool Types
  ToolInputSchema,
  JsonSchemaProperty,
  JsonSchemaType,
  McpTool,
  ListToolsRequest,
  ListToolsResult,
  CallToolRequest,
  CallToolResult,
  ToolResultContent,
  ToolListChangedNotification,

  // Resource Types
  McpResource,
  ResourceAnnotations,
  ResourceReference,
  ResourceTemplate,
  ResourceContent,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ReadResourceRequest,
  ReadResourceResult,
  SubscribeResourceRequest,
  UnsubscribeResourceRequest,
  ResourceUpdatedNotification,
  ResourceListChangedNotification,

  // Prompt Types
  PromptArgument,
  McpPrompt,
  PromptMessage,
  PromptMessageContent,
  ListPromptsRequest,
  ListPromptsResult,
  GetPromptRequest,
  GetPromptResult,
  PromptListChangedNotification,

  // Logging Types
  LogLevel,
  SetLogLevelRequest,
  LogMessageNotification,

  // Sampling Types
  CreateSamplingMessageRequest,
  SamplingMessage,
  SamplingContent,
  ModelPreferences,
  ModelHint,
  CreateSamplingMessageResult,

  // Roots Types
  Root,
  ListRootsRequest,
  ListRootsResult,
  RootsListChangedNotification,

  // Progress Types
  ProgressToken,
  ProgressNotification,

  // Cancellation Types
  CancelledNotification,

  // Transport Types
  TransportState,
  TransportOptions,
  TransportEventHandlers,
  McpTransport,

  // Server Config Types
  McpTransportType,
  McpServerConfig,
  McpServerState,
  McpServerInfo,
} from './types';

// Import types for internal use
import type {
  McpTransport,
  ImplementationInfo,
  ServerCapabilities,
} from './types';

// Export constants và utilities từ types
export {
  JSONRPC_VERSION,
  MCP_PROTOCOL_VERSION,
  JsonRpcErrorCode,
  createRequestId,
} from './types';

// ============================================================================
// Re-export Transport Classes và Types
// ============================================================================

export {
  // Base class
  BaseTransport,

  // Transport implementations
  StdioTransport,
  SseTransport,
  StreamableHttpTransport,

  // Factory function
  createTransport,
} from './Transport';

export type {
  StdioTransportOptions,
  SseTransportOptions,
  StreamableHttpTransportOptions,
  ReconnectionOptions,
  StreamableHttpSendOptions,
} from './Transport';

// ============================================================================
// Re-export MCP Client
// ============================================================================

export {
  MCPClient,
  McpError,
  McpTimeoutError,
  McpNotInitializedError,
  createMcpClient,
} from './MCPClient';

export type {
  McpClientOptions,
  McpClientEvents,
} from './MCPClient';

// ============================================================================
// Re-export MCP Server
// ============================================================================

export {
  MCPServer,
  createMcpServer,

  // Helper functions cho tool results
  textResult,
  jsonResult,
  imageResult,
  errorResult,

  // Helper functions cho prompt messages
  userMessage,
  assistantMessage,
} from './MCPServer';

export type {
  McpServerOptions,
  ToolHandler,
  RegisteredTool as ServerRegisteredTool,
  ResourceHandler,
  RegisteredResource as ServerRegisteredResource,
  PromptHandler,
  RegisteredPrompt as ServerRegisteredPrompt,
  ServerState,
} from './MCPServer';

// ============================================================================
// Re-export Tool Registry
// ============================================================================

export {
  ToolRegistry,
  createToolRegistry,
  parseQualifiedName,
  isMcpToolName,
} from './ToolRegistry';

export type {
  RegisteredTool,
  ToolFilterOptions,
  ValidationResult,
  ValidationError,
  RegistryStats,
} from './ToolRegistry';

// ============================================================================
// Re-export Resource Manager
// ============================================================================

export {
  ResourceManager,
  createResourceManager,
  expandUriTemplate,
  matchUriTemplate,
} from './ResourceManager';

export type {
  ManagedResource,
  ManagedResourceTemplate,
  ResourceFilterOptions,
  CacheOptions,
  ResourceUpdateCallback,
  ResourceReadHandler,
  ResourceManagerStats,
} from './ResourceManager';

// ============================================================================
// Convenience Types
// ============================================================================

/**
 * Type để represent một MCP server connection
 */
export interface McpConnection {
  /** Client instance */
  client: import('./MCPClient').MCPClient;
  /** Transport instance */
  transport: McpTransport;
  /** Server config */
  config: import('./types').McpServerConfig;
  /** Server info sau khi connect */
  serverInfo?: ImplementationInfo;
  /** Server capabilities */
  capabilities?: ServerCapabilities;
}

/**
 * Options cho việc tạo connection
 */
export interface CreateConnectionOptions {
  /** Server configuration */
  config: import('./types').McpServerConfig;
  /** Client options */
  clientOptions?: Partial<import('./MCPClient').McpClientOptions>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Tạo connection đến MCP server từ config
 *
 * @param options - Connection options
 * @returns Connection object
 *
 * @example
 * ```typescript
 * const connection = await createConnection({
 *   config: {
 *     name: 'my-server',
 *     transport: 'stdio',
 *     command: 'node',
 *     args: ['./server.js'],
 *   },
 * });
 *
 * // Use the connection
 * const tools = await connection.client.listTools();
 *
 * // Disconnect when done
 * await connection.client.disconnect();
 * ```
 */
export async function createConnection(
  options: CreateConnectionOptions
): Promise<McpConnection> {
  const { config, clientOptions = {} } = options;

  // Import dynamically để tránh circular dependencies
  const { MCPClient } = await import('./MCPClient');
  const { createTransport } = await import('./Transport');

  // Tạo transport dựa vào config
  let transport: McpTransport;

  switch (config.transport) {
    case 'stdio':
      if (!config.command) {
        throw new Error('Command is required for stdio transport');
      }
      transport = createTransport('stdio', {
        command: config.command,
        args: config.args,
        env: config.env,
        timeout: config.timeout,
      });
      break;

    case 'sse':
      if (!config.url) {
        throw new Error('URL is required for SSE transport');
      }
      transport = createTransport('sse', {
        url: config.url,
        timeout: config.timeout,
      });
      break;

    case 'streamable-http':
      if (!config.url) {
        throw new Error('URL is required for streamable-http transport');
      }
      transport = createTransport('streamable-http', {
        url: config.url,
        timeout: config.timeout,
      });
      break;

    default:
      throw new Error(`Unknown transport type: ${config.transport}`);
  }

  // Tạo client
  const client = new MCPClient({
    clientInfo: {
      name: clientOptions.clientInfo?.name || 'claude-code',
      version: clientOptions.clientInfo?.version || '1.0.0',
    },
    capabilities: clientOptions.capabilities,
    requestTimeout: config.timeout,
    ...clientOptions,
  });

  // Connect đến server
  const initResult = await client.connect(transport);

  return {
    client,
    transport,
    config,
    serverInfo: initResult.serverInfo,
    capabilities: initResult.capabilities,
  };
}

/**
 * Tạo simple server với basic setup
 *
 * @param name - Server name
 * @param version - Server version
 * @returns MCPServer instance đã được configure
 *
 * @example
 * ```typescript
 * const server = createSimpleServer('my-server', '1.0.0');
 *
 * // Add tools
 * server.tool('greet', 'Greet a user', {
 *   properties: {
 *     name: { type: 'string', description: 'Name to greet' }
 *   },
 *   required: ['name'],
 * }, async (args) => {
 *   return textResult(`Hello, ${args.name}!`);
 * });
 *
 * // Start with stdio transport
 * const transport = new StdioTransport({ ... });
 * await server.start(transport);
 * ```
 */
export function createSimpleServer(
  name: string,
  version: string
): import('./MCPServer').MCPServer {
  const { MCPServer } = require('./MCPServer');

  return new MCPServer({
    serverInfo: { name, version },
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    },
  });
}
