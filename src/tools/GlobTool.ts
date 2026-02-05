/**
 * GlobTool - Tool tim kiem file theo pattern
 *
 * Tim kiem nhanh cac file trong codebase bang glob patterns.
 *
 * Dac diem:
 * - Ho tro glob patterns nhu "**\/*.js", "src/**\/*.ts"
 * - Ket qua sap xep theo thoi gian modify
 * - Hoat dong voi moi kich thuoc codebase
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Tham so dau vao cho GlobTool
 */
export interface GlobToolInput {
  /** Glob pattern de match files */
  pattern: string;
  /** Thu muc goc de tim kiem (mac dinh: working directory) */
  path?: string;
}

/**
 * Thong tin ve mot file tim duoc
 */
export interface MatchedFile {
  /** Duong dan tuyet doi */
  absolutePath: string;
  /** Duong dan tuong doi tu search root */
  relativePath: string;
  /** Thoi gian modify cuoi cung */
  modifiedTime: Date;
  /** Kich thuoc file (bytes) */
  size: number;
  /** La file hay thu muc */
  isDirectory: boolean;
}

/**
 * Ket qua tra ve tu GlobTool
 */
export interface GlobToolOutput {
  /** Danh sach files tim duoc */
  files: MatchedFile[];
  /** Tong so files match */
  totalMatches: number;
  /** Pattern da su dung */
  pattern: string;
  /** Thu muc da tim kiem */
  searchPath: string;
  /** Co bi truncate khong */
  truncated: boolean;
}

// ============================================================================
// Constants - Cac hang so
// ============================================================================

/** So file toi da tra ve */
const MAX_RESULTS = 1000;

/** Cac thu muc mac dinh bi bo qua */
export const DEFAULT_IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.cache',
  '.next',
  '.nuxt',
  'vendor',
];

/** Cac patterns file bi ignore */
const DEFAULT_IGNORE_PATTERNS = [
  '*.log',
  '*.lock',
  '.DS_Store',
  'Thumbs.db',
];

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Dinh nghia cua GlobTool
 */
export const globToolDefinition: ToolDefinition = {
  name: 'Glob',
  description: 'Fast file pattern matching tool that works with any codebase size',
  category: 'search',
  requiresConfirmation: false,
  parameters: {
    pattern: {
      type: 'string',
      description: 'The glob pattern to match files against (e.g., "**/*.js", "src/**/*.ts")',
      required: true,
    },
    path: {
      type: 'string',
      description: 'The directory to search in. If not specified, the current working directory will be used.',
      required: false,
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Chuyen glob pattern thanh regex
 * @param pattern - Glob pattern
 * @returns RegExp tuong ung
 */
export function globToRegex(pattern: string): RegExp {
  let regexStr = pattern
    // Escape cac ky tu dac biet cua regex (tru *, ?, [, ])
    .replace(/[.+^${}()|\\]/g, '\\$&')
    // ** match moi thu ke ca /
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    // * match moi thu tru /
    .replace(/\*/g, '[^/]*')
    // ? match 1 ky tu bat ky tru /
    .replace(/\?/g, '[^/]')
    // Tra lai globstar
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  // Dam bao match tu dau den cuoi
  return new RegExp(`^${regexStr}$`);
}

/**
 * Kiem tra path co nen bi ignore khong
 * @param relativePath - Duong dan tuong doi
 * @param ignoreDirs - Cac thu muc can ignore
 * @returns true neu can ignore
 */
export function shouldIgnore(relativePath: string, ignoreDirs: string[] = DEFAULT_IGNORE_DIRS): boolean {
  const parts = relativePath.split('/');

  for (const part of parts) {
    if (ignoreDirs.includes(part)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate input cho GlobTool
 * @param input - Input can validate
 * @returns true neu hop le, string neu co loi
 */
export function validateGlobInput(input: GlobToolInput): boolean | string {
  // Kiem tra pattern bat buoc
  if (!input.pattern || typeof input.pattern !== 'string') {
    return 'pattern is required and must be a string';
  }

  // Kiem tra pattern khong rong
  if (input.pattern.trim().length === 0) {
    return 'pattern cannot be empty';
  }

  // Kiem tra path neu co
  if (input.path !== undefined && typeof input.path !== 'string') {
    return 'path must be a string if provided';
  }

  return true;
}

// ============================================================================
// Tool Handler Implementation
// ============================================================================

/**
 * Tao GlobTool handler
 * @param context - Execution context
 * @returns Tool handler instance
 */
export function createGlobToolHandler(context: ExecutionContext): ToolHandler<GlobToolInput, GlobToolOutput> {
  return {
    name: 'Glob',
    definition: globToolDefinition,

    validateInput(input: GlobToolInput): boolean | string {
      return validateGlobInput(input);
    },

    async execute(input: GlobToolInput, ctx: ExecutionContext): Promise<GlobToolOutput> {
      const fs = await import('fs/promises');
      const path = await import('path');

      const searchPath = input.path ?? ctx.workingDirectory;
      const pattern = input.pattern;
      const regex = globToRegex(pattern);

      // Kiem tra thu muc ton tai
      try {
        const stats = await fs.stat(searchPath);
        if (!stats.isDirectory()) {
          throw new Error(`Path is not a directory: ${searchPath}`);
        }
      } catch (error: unknown) {
        const err = error as Error;
        throw new Error(`Invalid search path: ${err.message}`);
      }

      // Tim kiem files
      const matchedFiles: MatchedFile[] = [];

      async function searchDirectory(dirPath: string, relativeTo: string): Promise<void> {
        if (matchedFiles.length >= MAX_RESULTS) return;

        let entries;
        try {
          entries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch {
          return; // Bo qua thu muc khong doc duoc
        }

        for (const entry of entries) {
          if (matchedFiles.length >= MAX_RESULTS) break;

          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(relativeTo, fullPath);

          // Kiem tra ignore
          if (shouldIgnore(relativePath)) continue;

          if (entry.isDirectory()) {
            // Tim kiem de quy trong thu muc
            await searchDirectory(fullPath, relativeTo);
          } else if (entry.isFile()) {
            // Kiem tra match pattern
            if (regex.test(relativePath) || regex.test(entry.name)) {
              try {
                const stats = await fs.stat(fullPath);
                matchedFiles.push({
                  absolutePath: fullPath,
                  relativePath,
                  modifiedTime: stats.mtime,
                  size: stats.size,
                  isDirectory: false,
                });
              } catch {
                // Bo qua file khong doc duoc stats
              }
            }
          }
        }
      }

      // Bat dau tim kiem
      await searchDirectory(searchPath, searchPath);

      // Sap xep theo thoi gian modify (moi nhat truoc)
      matchedFiles.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());

      return {
        files: matchedFiles,
        totalMatches: matchedFiles.length,
        pattern,
        searchPath,
        truncated: matchedFiles.length >= MAX_RESULTS,
      };
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Tim files voi nhieu patterns
 * @param patterns - Array cac glob patterns
 * @param searchPath - Thu muc tim kiem
 * @returns Array cac files match
 */
export async function multiGlob(
  patterns: string[],
  searchPath: string
): Promise<MatchedFile[]> {
  const allFiles = new Map<string, MatchedFile>();

  for (const pattern of patterns) {
    const handler = createGlobToolHandler({
      workingDirectory: searchPath,
      environment: {},
      sandboxMode: false,
      defaultTimeout: 30000,
    });

    const result = await handler.execute(
      { pattern, path: searchPath },
      { workingDirectory: searchPath, environment: {}, sandboxMode: false, defaultTimeout: 30000 }
    );

    for (const file of result.files) {
      allFiles.set(file.absolutePath, file);
    }
  }

  return Array.from(allFiles.values());
}

/**
 * Tim files theo extension
 * @param extension - Extension can tim (VD: ".ts", ".js")
 * @param searchPath - Thu muc tim kiem
 * @returns Array cac files match
 */
export async function findByExtension(
  extension: string,
  searchPath: string
): Promise<MatchedFile[]> {
  const pattern = `**/*${extension.startsWith('.') ? extension : '.' + extension}`;

  const handler = createGlobToolHandler({
    workingDirectory: searchPath,
    environment: {},
    sandboxMode: false,
    defaultTimeout: 30000,
  });

  const result = await handler.execute(
    { pattern, path: searchPath },
    { workingDirectory: searchPath, environment: {}, sandboxMode: false, defaultTimeout: 30000 }
  );

  return result.files;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  definition: globToolDefinition,
  createHandler: createGlobToolHandler,
  validateInput: validateGlobInput,
  globToRegex,
  shouldIgnore,
  multiGlob,
  findByExtension,
  DEFAULT_IGNORE_DIRS,
};
