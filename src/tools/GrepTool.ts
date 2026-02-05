/**
 * GrepTool - Tool tim kiem noi dung trong files
 *
 * Tim kiem manh me dua tren ripgrep.
 *
 * Dac diem:
 * - Ho tro full regex syntax
 * - Loc file theo glob pattern hoac file type
 * - Nhieu output modes: content, files_with_matches, count
 * - Ho tro context lines (-A, -B, -C)
 * - Multiline matching
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Output mode cho ket qua tim kiem
 */
export type GrepOutputMode = 'content' | 'files_with_matches' | 'count';

/**
 * Tham so dau vao cho GrepTool
 */
export interface GrepToolInput {
  /** Regex pattern can tim */
  pattern: string;
  /** File hoac thu muc can tim (mac dinh: working directory) */
  path?: string;
  /** Glob pattern de loc files */
  glob?: string;
  /** Loai file de tim (VD: "js", "py", "ts") */
  type?: string;
  /** Output mode */
  outputMode?: GrepOutputMode;
  /** So dong hien thi sau moi match */
  afterContext?: number;
  /** So dong hien thi truoc moi match */
  beforeContext?: number;
  /** So dong context truoc va sau */
  context?: number;
  /** Tim kiem case insensitive */
  caseInsensitive?: boolean;
  /** Hien thi line numbers */
  showLineNumbers?: boolean;
  /** Enable multiline mode */
  multiline?: boolean;
  /** Gioi han so ket qua */
  headLimit?: number;
  /** Bo qua N ket qua dau */
  offset?: number;
}

/**
 * Mot match result
 */
export interface GrepMatch {
  /** Duong dan file */
  filePath: string;
  /** So dong (neu co) */
  lineNumber?: number;
  /** Noi dung dong match (neu outputMode = content) */
  content?: string;
  /** So lan match (neu outputMode = count) */
  count?: number;
  /** Context lines truoc */
  beforeLines?: string[];
  /** Context lines sau */
  afterLines?: string[];
}

/**
 * Ket qua tra ve tu GrepTool
 */
export interface GrepToolOutput {
  /** Danh sach matches */
  matches: GrepMatch[];
  /** Tong so matches */
  totalMatches: number;
  /** Pattern da su dung */
  pattern: string;
  /** Thu muc da tim */
  searchPath: string;
  /** Output mode da su dung */
  outputMode: GrepOutputMode;
  /** Co bi truncate khong */
  truncated: boolean;
}

// ============================================================================
// Constants - Cac hang so
// ============================================================================

/** So ket qua toi da mac dinh */
const DEFAULT_HEAD_LIMIT = 100;

/** So ket qua toi da tuyet doi */
const MAX_RESULTS = 1000;

/** Mapping tu type sang glob pattern */
export const TYPE_TO_GLOB: Record<string, string> = {
  js: '*.js',
  ts: '*.ts',
  tsx: '*.tsx',
  jsx: '*.jsx',
  py: '*.py',
  java: '*.java',
  go: '*.go',
  rust: '*.rs',
  cpp: '*.cpp',
  c: '*.c',
  h: '*.h',
  css: '*.css',
  scss: '*.scss',
  html: '*.html',
  json: '*.json',
  yaml: '*.{yaml,yml}',
  md: '*.md',
  sql: '*.sql',
  sh: '*.sh',
  bash: '*.{sh,bash}',
  ruby: '*.rb',
  php: '*.php',
  swift: '*.swift',
  kotlin: '*.kt',
};

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Dinh nghia cua GrepTool
 */
export const grepToolDefinition: ToolDefinition = {
  name: 'Grep',
  description: 'A powerful search tool built on ripgrep',
  category: 'search',
  requiresConfirmation: false,
  parameters: {
    pattern: {
      type: 'string',
      description: 'The regular expression pattern to search for in file contents',
      required: true,
    },
    path: {
      type: 'string',
      description: 'File or directory to search in. Defaults to current working directory.',
      required: false,
    },
    glob: {
      type: 'string',
      description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
      required: false,
    },
    type: {
      type: 'string',
      description: 'File type to search (e.g., "js", "py", "rust")',
      required: false,
    },
    output_mode: {
      type: 'string',
      description: 'Output mode: "content" shows matching lines, "files_with_matches" shows file paths, "count" shows match counts',
      required: false,
      enum: ['content', 'files_with_matches', 'count'],
    },
    '-A': {
      type: 'number',
      description: 'Number of lines to show after each match',
      required: false,
    },
    '-B': {
      type: 'number',
      description: 'Number of lines to show before each match',
      required: false,
    },
    '-C': {
      type: 'number',
      description: 'Number of lines to show before and after each match (alias for context)',
      required: false,
    },
    context: {
      type: 'number',
      description: 'Number of lines to show before and after each match',
      required: false,
    },
    '-i': {
      type: 'boolean',
      description: 'Case insensitive search',
      required: false,
    },
    '-n': {
      type: 'boolean',
      description: 'Show line numbers in output',
      required: false,
      default: true,
    },
    multiline: {
      type: 'boolean',
      description: 'Enable multiline mode where . matches newlines',
      required: false,
      default: false,
    },
    head_limit: {
      type: 'number',
      description: 'Limit output to first N entries',
      required: false,
    },
    offset: {
      type: 'number',
      description: 'Skip first N entries',
      required: false,
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Tao RegExp tu pattern string
 * @param pattern - Pattern string
 * @param caseInsensitive - Case insensitive flag
 * @param multiline - Multiline flag
 * @returns RegExp object
 */
export function createSearchRegex(
  pattern: string,
  caseInsensitive: boolean = false,
  multiline: boolean = false
): RegExp {
  let flags = 'g';
  if (caseInsensitive) flags += 'i';
  if (multiline) flags += 'm';

  try {
    return new RegExp(pattern, flags);
  } catch {
    // Fallback: escape pattern neu khong phai valid regex
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, flags);
  }
}

/**
 * Lay glob pattern tu type
 * @param type - File type
 * @returns Glob pattern
 */
export function getGlobFromType(type: string): string | undefined {
  return TYPE_TO_GLOB[type.toLowerCase()];
}

/**
 * Validate input cho GrepTool
 * @param input - Input can validate
 * @returns true neu hop le, string neu co loi
 */
export function validateGrepInput(input: GrepToolInput): boolean | string {
  // Kiem tra pattern bat buoc
  if (!input.pattern || typeof input.pattern !== 'string') {
    return 'pattern is required and must be a string';
  }

  // Kiem tra pattern khong rong
  if (input.pattern.trim().length === 0) {
    return 'pattern cannot be empty';
  }

  // Kiem tra output_mode hop le
  if (input.outputMode !== undefined) {
    const validModes: GrepOutputMode[] = ['content', 'files_with_matches', 'count'];
    if (!validModes.includes(input.outputMode)) {
      return `output_mode must be one of: ${validModes.join(', ')}`;
    }
  }

  // Kiem tra context values
  if (input.context !== undefined && (typeof input.context !== 'number' || input.context < 0)) {
    return 'context must be a non-negative number';
  }
  if (input.afterContext !== undefined && (typeof input.afterContext !== 'number' || input.afterContext < 0)) {
    return 'afterContext must be a non-negative number';
  }
  if (input.beforeContext !== undefined && (typeof input.beforeContext !== 'number' || input.beforeContext < 0)) {
    return 'beforeContext must be a non-negative number';
  }

  return true;
}

// ============================================================================
// Tool Handler Implementation
// ============================================================================

/**
 * Tao GrepTool handler
 * @param context - Execution context
 * @returns Tool handler instance
 */
export function createGrepToolHandler(context: ExecutionContext): ToolHandler<GrepToolInput, GrepToolOutput> {
  return {
    name: 'Grep',
    definition: grepToolDefinition,

    validateInput(input: GrepToolInput): boolean | string {
      return validateGrepInput(input);
    },

    async execute(input: GrepToolInput, ctx: ExecutionContext): Promise<GrepToolOutput> {
      const fs = await import('fs/promises');
      const path = await import('path');

      const searchPath = input.path ?? ctx.workingDirectory;
      const outputMode = input.outputMode ?? 'files_with_matches';
      const headLimit = Math.min(input.headLimit ?? DEFAULT_HEAD_LIMIT, MAX_RESULTS);
      const offset = input.offset ?? 0;

      // Tao regex tu pattern
      const regex = createSearchRegex(
        input.pattern,
        input.caseInsensitive,
        input.multiline
      );

      // Xac dinh glob pattern
      let globPattern = input.glob;
      if (!globPattern && input.type) {
        globPattern = getGlobFromType(input.type);
      }

      const matches: GrepMatch[] = [];
      let totalMatches = 0;

      // Ham tim kiem trong mot file
      async function searchFile(filePath: string): Promise<void> {
        if (totalMatches >= headLimit + offset) return;

        let content: string;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          return; // Bo qua file khong doc duoc
        }

        const lines = content.split('\n');
        let fileMatchCount = 0;

        if (outputMode === 'count') {
          // Dem so matches trong file
          const allMatches = content.match(regex);
          if (allMatches && allMatches.length > 0) {
            fileMatchCount = allMatches.length;
            totalMatches++;

            if (totalMatches > offset && matches.length < headLimit) {
              matches.push({
                filePath,
                count: fileMatchCount,
              });
            }
          }
        } else if (outputMode === 'files_with_matches') {
          // Chi ghi nhan file neu co match
          if (regex.test(content)) {
            totalMatches++;

            if (totalMatches > offset && matches.length < headLimit) {
              matches.push({ filePath });
            }
          }
        } else {
          // outputMode === 'content'
          // Tim tung dong
          const beforeCtx = input.beforeContext ?? input.context ?? 0;
          const afterCtx = input.afterContext ?? input.context ?? 0;

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= headLimit) break;

            if (regex.test(lines[i])) {
              totalMatches++;

              if (totalMatches > offset && matches.length < headLimit) {
                const match: GrepMatch = {
                  filePath,
                  lineNumber: i + 1,
                  content: lines[i],
                };

                // Them context neu can
                if (beforeCtx > 0) {
                  match.beforeLines = lines.slice(Math.max(0, i - beforeCtx), i);
                }
                if (afterCtx > 0) {
                  match.afterLines = lines.slice(i + 1, Math.min(lines.length, i + 1 + afterCtx));
                }

                matches.push(match);
              }
            }
          }
        }
      }

      // Ham tim kiem de quy trong thu muc
      async function searchDirectory(dirPath: string): Promise<void> {
        if (matches.length >= headLimit) return;

        let entries;
        try {
          entries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          if (matches.length >= headLimit) break;

          const fullPath = path.join(dirPath, entry.name);

          // Bo qua hidden files va node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isDirectory()) {
            await searchDirectory(fullPath);
          } else if (entry.isFile()) {
            // Kiem tra glob pattern neu co
            if (globPattern) {
              const { default: GlobTool } = await import('./GlobTool');
              const globRegex = GlobTool.globToRegex(globPattern);
              if (!globRegex.test(entry.name)) continue;
            }

            await searchFile(fullPath);
          }
        }
      }

      // Kiem tra searchPath la file hay directory
      const stats = await fs.stat(searchPath);
      if (stats.isFile()) {
        await searchFile(searchPath);
      } else {
        await searchDirectory(searchPath);
      }

      return {
        matches,
        totalMatches,
        pattern: input.pattern,
        searchPath,
        outputMode,
        truncated: totalMatches > headLimit + offset,
      };
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Tim va thay the trong nhieu files
 * @param pattern - Pattern can tim
 * @param replacement - Chuoi thay the
 * @param searchPath - Thu muc tim kiem
 * @param glob - Glob pattern loc files
 */
export async function searchAndReplace(
  pattern: string,
  replacement: string,
  searchPath: string,
  glob?: string
): Promise<{ filesModified: number; totalReplacements: number }> {
  const handler = createGrepToolHandler({
    workingDirectory: searchPath,
    environment: {},
    sandboxMode: false,
    defaultTimeout: 60000,
  });

  // Tim files co match
  const searchResult = await handler.execute(
    { pattern, path: searchPath, glob, outputMode: 'files_with_matches' },
    { workingDirectory: searchPath, environment: {}, sandboxMode: false, defaultTimeout: 60000 }
  );

  const fs = await import('fs/promises');
  const regex = createSearchRegex(pattern, false, false);

  let filesModified = 0;
  let totalReplacements = 0;

  for (const match of searchResult.matches) {
    const content = await fs.readFile(match.filePath, 'utf-8');
    const matches = content.match(regex);

    if (matches) {
      const newContent = content.replace(regex, replacement);
      await fs.writeFile(match.filePath, newContent, 'utf-8');
      filesModified++;
      totalReplacements += matches.length;
    }
  }

  return { filesModified, totalReplacements };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  definition: grepToolDefinition,
  createHandler: createGrepToolHandler,
  validateInput: validateGrepInput,
  createSearchRegex,
  getGlobFromType,
  searchAndReplace,
  TYPE_TO_GLOB,
};
