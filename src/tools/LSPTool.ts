/**
 * LSPTool - Tool tich hop Language Server Protocol
 *
 * Cung cap cac tinh nang tu Language Servers:
 * - Go to definition
 * - Find references
 * - Hover information
 * - Diagnostics (errors/warnings)
 * - Code completion
 *
 * QUAN TRONG:
 * - Can co LSP server chay cho ngon ngu tuong ung
 * - Duong dan file phai tuyet doi
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Cac operation co the thuc hien voi LSP
 */
export type LSPOperation =
  | 'getDiagnostics'      // Lay errors/warnings
  | 'goToDefinition'      // Tim dinh nghia
  | 'findReferences'      // Tim cac vi tri su dung
  | 'hover'               // Lay thong tin hover
  | 'completion'          // Lay goi y code
  | 'documentSymbols'     // Lay cac symbols trong file
  | 'workspaceSymbols';   // Tim symbols trong workspace

/**
 * Vi tri trong file
 */
export interface Position {
  /** So dong (0-indexed) */
  line: number;
  /** So cot (0-indexed) */
  character: number;
}

/**
 * Khoang trong file
 */
export interface Range {
  /** Vi tri bat dau */
  start: Position;
  /** Vi tri ket thuc */
  end: Position;
}

/**
 * Vi tri trong codebase (bao gom file)
 */
export interface Location {
  /** Duong dan file */
  filePath: string;
  /** Khoang trong file */
  range: Range;
}

/**
 * Tham so dau vao cho LSPTool
 */
export interface LSPToolInput {
  /** Operation can thuc hien */
  operation: LSPOperation;
  /** Duong dan file */
  filePath?: string;
  /** Vi tri cursor (cho definition, references, hover) */
  position?: Position;
  /** Query tim kiem (cho workspaceSymbols) */
  query?: string;
}

/**
 * Mot diagnostic (error/warning)
 */
export interface Diagnostic {
  /** Vi tri trong file */
  range: Range;
  /** Thong bao */
  message: string;
  /** Muc do: error, warning, information, hint */
  severity: 'error' | 'warning' | 'information' | 'hint';
  /** Ma loi (neu co) */
  code?: string | number;
  /** Nguon cua diagnostic */
  source?: string;
}

/**
 * Thong tin hover
 */
export interface HoverInfo {
  /** Noi dung hover (co the la markdown) */
  contents: string;
  /** Khoang ma hover ap dung */
  range?: Range;
}

/**
 * Mot goi y completion
 */
export interface CompletionItem {
  /** Nhan hien thi */
  label: string;
  /** Loai item: function, variable, class, etc. */
  kind: string;
  /** Mo ta */
  detail?: string;
  /** Documentation */
  documentation?: string;
  /** Text se chen vao */
  insertText?: string;
}

/**
 * Mot symbol trong document
 */
export interface DocumentSymbol {
  /** Ten symbol */
  name: string;
  /** Loai symbol */
  kind: string;
  /** Vi tri trong file */
  range: Range;
  /** Chi tiet them */
  detail?: string;
  /** Cac symbols con */
  children?: DocumentSymbol[];
}

/**
 * Ket qua tra ve tu LSPTool
 */
export interface LSPToolOutput {
  /** Operation da thuc hien */
  operation: LSPOperation;
  /** Diagnostics (neu getDiagnostics) */
  diagnostics?: Diagnostic[];
  /** Locations (neu goToDefinition hoac findReferences) */
  locations?: Location[];
  /** Hover info (neu hover) */
  hoverInfo?: HoverInfo;
  /** Completions (neu completion) */
  completions?: CompletionItem[];
  /** Symbols (neu documentSymbols hoac workspaceSymbols) */
  symbols?: DocumentSymbol[];
  /** Thoi gian thuc hien (ms) */
  executionTime: number;
}

// ============================================================================
// Constants - Cac hang so
// ============================================================================

/** Timeout cho LSP request: 10 giay */
const LSP_REQUEST_TIMEOUT_MS = 10000;

/** So ket qua toi da cho references */
const MAX_REFERENCES = 100;

/** So ket qua toi da cho completions */
const MAX_COMPLETIONS = 50;

/** Mapping severity tu LSP */
export const SEVERITY_MAP: Record<number, Diagnostic['severity']> = {
  1: 'error',
  2: 'warning',
  3: 'information',
  4: 'hint',
};

/** Mapping symbol kind tu LSP */
export const SYMBOL_KIND_MAP: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Dinh nghia cua LSPTool
 */
export const lspToolDefinition: ToolDefinition = {
  name: 'LSP',
  description: 'Interact with Language Server Protocol for code intelligence',
  category: 'utility',
  requiresConfirmation: false,
  parameters: {
    operation: {
      type: 'string',
      description: 'The LSP operation to perform',
      required: true,
      enum: ['getDiagnostics', 'goToDefinition', 'findReferences', 'hover', 'completion', 'documentSymbols', 'workspaceSymbols'],
    },
    file_path: {
      type: 'string',
      description: 'The file path for the operation',
      required: false,
    },
    position: {
      type: 'object',
      description: 'Cursor position (line and character, 0-indexed)',
      required: false,
    },
    query: {
      type: 'string',
      description: 'Search query for workspace symbols',
      required: false,
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Position sang chuoi readable
 * @param pos - Position
 * @returns String "line:character"
 */
export function formatPosition(pos: Position): string {
  return `${pos.line + 1}:${pos.character + 1}`;
}

/**
 * Convert Range sang chuoi readable
 * @param range - Range
 * @returns String "start-end"
 */
export function formatRange(range: Range): string {
  return `${formatPosition(range.start)}-${formatPosition(range.end)}`;
}

/**
 * Convert Location sang chuoi readable
 * @param loc - Location
 * @returns String "file:line:character"
 */
export function formatLocation(loc: Location): string {
  return `${loc.filePath}:${formatPosition(loc.range.start)}`;
}

/**
 * Validate input cho LSPTool
 * @param input - Input can validate
 * @returns true neu hop le, string neu co loi
 */
export function validateLSPInput(input: LSPToolInput): boolean | string {
  // Kiem tra operation bat buoc
  if (!input.operation || typeof input.operation !== 'string') {
    return 'operation is required and must be a string';
  }

  const validOps: LSPOperation[] = [
    'getDiagnostics', 'goToDefinition', 'findReferences',
    'hover', 'completion', 'documentSymbols', 'workspaceSymbols'
  ];
  if (!validOps.includes(input.operation)) {
    return `operation must be one of: ${validOps.join(', ')}`;
  }

  // Kiem tra file_path cho cac operation can
  const needsFilePath: LSPOperation[] = [
    'getDiagnostics', 'goToDefinition', 'findReferences',
    'hover', 'completion', 'documentSymbols'
  ];
  if (needsFilePath.includes(input.operation)) {
    if (!input.filePath || typeof input.filePath !== 'string') {
      return `file_path is required for operation "${input.operation}"`;
    }
    if (!input.filePath.startsWith('/')) {
      return 'file_path must be an absolute path';
    }
  }

  // Kiem tra position cho cac operation can
  const needsPosition: LSPOperation[] = [
    'goToDefinition', 'findReferences', 'hover', 'completion'
  ];
  if (needsPosition.includes(input.operation)) {
    if (!input.position) {
      return `position is required for operation "${input.operation}"`;
    }
    if (typeof input.position.line !== 'number' || input.position.line < 0) {
      return 'position.line must be a non-negative number';
    }
    if (typeof input.position.character !== 'number' || input.position.character < 0) {
      return 'position.character must be a non-negative number';
    }
  }

  // Kiem tra query cho workspaceSymbols
  if (input.operation === 'workspaceSymbols') {
    if (!input.query || typeof input.query !== 'string') {
      return 'query is required for workspaceSymbols operation';
    }
  }

  return true;
}

// ============================================================================
// Tool Handler Implementation
// ============================================================================

/**
 * Tao LSPTool handler
 * @param context - Execution context
 * @returns Tool handler instance
 */
export function createLSPToolHandler(context: ExecutionContext): ToolHandler<LSPToolInput, LSPToolOutput> {
  return {
    name: 'LSP',
    definition: lspToolDefinition,

    validateInput(input: LSPToolInput): boolean | string {
      return validateLSPInput(input);
    },

    async execute(input: LSPToolInput, ctx: ExecutionContext): Promise<LSPToolOutput> {
      const startTime = Date.now();

      // NOTE: Day la placeholder implementation
      // Trong thuc te, can:
      // 1. Connect toi LSP server tuong ung (tsserver, pyright, etc.)
      // 2. Gui LSP request
      // 3. Xu ly response

      switch (input.operation) {
        case 'getDiagnostics':
          return {
            operation: 'getDiagnostics',
            diagnostics: await simulateGetDiagnostics(input.filePath!),
            executionTime: Date.now() - startTime,
          };

        case 'goToDefinition':
          return {
            operation: 'goToDefinition',
            locations: await simulateGoToDefinition(input.filePath!, input.position!),
            executionTime: Date.now() - startTime,
          };

        case 'findReferences':
          return {
            operation: 'findReferences',
            locations: await simulateFindReferences(input.filePath!, input.position!),
            executionTime: Date.now() - startTime,
          };

        case 'hover':
          return {
            operation: 'hover',
            hoverInfo: await simulateHover(input.filePath!, input.position!),
            executionTime: Date.now() - startTime,
          };

        case 'completion':
          return {
            operation: 'completion',
            completions: await simulateCompletion(input.filePath!, input.position!),
            executionTime: Date.now() - startTime,
          };

        case 'documentSymbols':
          return {
            operation: 'documentSymbols',
            symbols: await simulateDocumentSymbols(input.filePath!),
            executionTime: Date.now() - startTime,
          };

        case 'workspaceSymbols':
          return {
            operation: 'workspaceSymbols',
            symbols: await simulateWorkspaceSymbols(input.query!),
            executionTime: Date.now() - startTime,
          };

        default:
          throw new Error(`Unknown operation: ${input.operation}`);
      }
    },
  };
}

// ============================================================================
// Simulation Functions (Placeholder)
// ============================================================================

async function simulateGetDiagnostics(filePath: string): Promise<Diagnostic[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      message: 'Sample diagnostic: File analyzed successfully',
      severity: 'information',
      source: 'lsp-placeholder',
    },
  ];
}

async function simulateGoToDefinition(filePath: string, position: Position): Promise<Location[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    {
      filePath,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 20 } },
    },
  ];
}

async function simulateFindReferences(filePath: string, position: Position): Promise<Location[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    {
      filePath,
      range: { start: position, end: { line: position.line, character: position.character + 10 } },
    },
  ];
}

async function simulateHover(filePath: string, position: Position): Promise<HoverInfo> {
  await new Promise(r => setTimeout(r, 50));
  return {
    contents: `**Symbol at ${formatPosition(position)}**\n\nType information would appear here.`,
    range: { start: position, end: { line: position.line, character: position.character + 5 } },
  };
}

async function simulateCompletion(filePath: string, position: Position): Promise<CompletionItem[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    { label: 'console', kind: 'Module', detail: 'Node.js console module' },
    { label: 'log', kind: 'Function', detail: 'console.log()' },
  ];
}

async function simulateDocumentSymbols(filePath: string): Promise<DocumentSymbol[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    {
      name: 'ExampleClass',
      kind: 'Class',
      range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
      detail: 'class ExampleClass',
      children: [
        {
          name: 'constructor',
          kind: 'Constructor',
          range: { start: { line: 1, character: 2 }, end: { line: 3, character: 3 } },
        },
      ],
    },
  ];
}

async function simulateWorkspaceSymbols(query: string): Promise<DocumentSymbol[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    {
      name: query,
      kind: 'Variable',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: query.length } },
    },
  ];
}

// ============================================================================
// Exports
// ============================================================================

export default {
  definition: lspToolDefinition,
  createHandler: createLSPToolHandler,
  validateInput: validateLSPInput,
  formatPosition,
  formatRange,
  formatLocation,
  SEVERITY_MAP,
  SYMBOL_KIND_MAP,
};
