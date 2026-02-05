/**
 * WebFetchTool - Tool fetch noi dung tu URL
 *
 * Lay noi dung tu URL va xu ly bang AI model.
 *
 * Dac diem:
 * - Fetch content va convert HTML to markdown
 * - Xu ly content voi prompt chi dinh
 * - Ho tro redirect handling
 * - Cache 15 phut de toi uu performance
 *
 * QUAN TRONG:
 * - KHONG hoat dong voi authenticated URLs (Google Docs, Jira, etc.)
 * - Voi GitHub URLs, su dung gh CLI thay the
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Tham so dau vao cho WebFetchTool
 */
export interface WebFetchToolInput {
  /** URL can fetch */
  url: string;
  /** Prompt de xu ly noi dung */
  prompt: string;
}

/**
 * Ket qua tra ve tu WebFetchTool
 */
export interface WebFetchToolOutput {
  /** Noi dung da xu ly */
  content: string;
  /** URL goc */
  url: string;
  /** URL cuoi cung (sau redirect) */
  finalUrl: string;
  /** Content type cua response */
  contentType: string;
  /** Co redirect khong */
  redirected: boolean;
  /** Thoi gian fetch (ms) */
  fetchTime: number;
  /** Da cache chua */
  cached: boolean;
}

// ============================================================================
// Constants - Cac hang so
// ============================================================================

/** Timeout mac dinh cho fetch: 30 giay */
const DEFAULT_FETCH_TIMEOUT_MS = 30000;

/** Kich thuoc toi da cua content: 1MB */
const MAX_CONTENT_SIZE = 1024 * 1024;

/** Thoi gian cache: 15 phut */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** User-Agent mac dinh */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; ClaudeCode/1.0; +https://claude.ai)';

/** Cac domain can authenticated (canh bao) */
export const AUTHENTICATED_DOMAINS = [
  'docs.google.com',
  'drive.google.com',
  'confluence',
  'jira',
  'notion.so',
  'linear.app',
  'slack.com',
  'teams.microsoft.com',
];

/** Cac domain nen dung tool khac */
const ALTERNATIVE_TOOL_DOMAINS: Record<string, string> = {
  'github.com': 'Use gh CLI instead (e.g., gh pr view, gh issue view)',
  'gitlab.com': 'Use GitLab CLI or API instead',
};

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Dinh nghia cua WebFetchTool
 */
export const webFetchToolDefinition: ToolDefinition = {
  name: 'WebFetch',
  description: 'Fetches content from a specified URL and processes it using an AI model',
  category: 'web',
  requiresConfirmation: false,
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to fetch content from',
      required: true,
    },
    prompt: {
      type: 'string',
      description: 'The prompt to run on the fetched content',
      required: true,
    },
  },
};

// ============================================================================
// Cache Implementation
// ============================================================================

interface CacheEntry {
  content: string;
  contentType: string;
  finalUrl: string;
  timestamp: number;
}

/** Simple in-memory cache */
const urlCache = new Map<string, CacheEntry>();

/**
 * Lay tu cache neu con hieu luc
 * @param url - URL can check
 * @returns Cache entry hoac undefined
 */
function getFromCache(url: string): CacheEntry | undefined {
  const entry = urlCache.get(url);
  if (!entry) return undefined;

  // Kiem tra con hieu luc khong
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    urlCache.delete(url);
    return undefined;
  }

  return entry;
}

/**
 * Luu vao cache
 * @param url - URL goc
 * @param entry - Cache entry
 */
function saveToCache(url: string, entry: Omit<CacheEntry, 'timestamp'>): void {
  urlCache.set(url, {
    ...entry,
    timestamp: Date.now(),
  });
}

/**
 * Xoa cache cu (tu dong cleanup)
 */
function cleanupCache(): void {
  const now = Date.now();
  for (const [url, entry] of urlCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      urlCache.delete(url);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Kiem tra URL co phai domain can auth khong
 * @param url - URL can check
 * @returns Canh bao neu can auth
 */
export function checkAuthenticatedDomain(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    for (const domain of AUTHENTICATED_DOMAINS) {
      if (hostname.includes(domain)) {
        return `URL may require authentication (${domain}). Consider using a specialized tool.`;
      }
    }

    for (const [domain, message] of Object.entries(ALTERNATIVE_TOOL_DOMAINS)) {
      if (hostname.includes(domain)) {
        return message;
      }
    }

    return undefined;
  } catch {
    return 'Invalid URL format';
  }
}

/**
 * Chuyen HTTP sang HTTPS
 * @param url - URL goc
 * @returns URL voi HTTPS
 */
export function upgradeToHttps(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

/**
 * Convert HTML to basic markdown
 * @param html - HTML content
 * @returns Markdown content
 */
export function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove script va style tags
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');

  // Convert paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Convert bold va italic
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // Convert links
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[ou]l[^>]*>/gi, '\n');

  // Convert code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n');

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&quot;/g, '"');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

/**
 * Validate input cho WebFetchTool
 * @param input - Input can validate
 * @returns true neu hop le, string neu co loi
 */
export function validateWebFetchInput(input: WebFetchToolInput): boolean | string {
  // Kiem tra url bat buoc
  if (!input.url || typeof input.url !== 'string') {
    return 'url is required and must be a string';
  }

  // Kiem tra url hop le
  try {
    new URL(input.url);
  } catch {
    return 'url must be a valid URL';
  }

  // Kiem tra prompt bat buoc
  if (!input.prompt || typeof input.prompt !== 'string') {
    return 'prompt is required and must be a string';
  }

  // Kiem tra prompt khong rong
  if (input.prompt.trim().length === 0) {
    return 'prompt cannot be empty';
  }

  return true;
}

// ============================================================================
// Tool Handler Implementation
// ============================================================================

/**
 * Tao WebFetchTool handler
 * @param context - Execution context
 * @returns Tool handler instance
 */
export function createWebFetchToolHandler(context: ExecutionContext): ToolHandler<WebFetchToolInput, WebFetchToolOutput> {
  return {
    name: 'WebFetch',
    definition: webFetchToolDefinition,

    validateInput(input: WebFetchToolInput): boolean | string {
      return validateWebFetchInput(input);
    },

    async execute(input: WebFetchToolInput, ctx: ExecutionContext): Promise<WebFetchToolOutput> {
      const startTime = Date.now();

      // Upgrade HTTP to HTTPS
      const url = upgradeToHttps(input.url);

      // Kiem tra domain can auth
      const authWarning = checkAuthenticatedDomain(url);
      if (authWarning) {
        console.warn(`Warning: ${authWarning}`);
      }

      // Kiem tra cache
      const cached = getFromCache(url);
      if (cached) {
        return {
          content: `[Cached content]\n\n${cached.content}`,
          url: input.url,
          finalUrl: cached.finalUrl,
          contentType: cached.contentType,
          redirected: url !== cached.finalUrl,
          fetchTime: Date.now() - startTime,
          cached: true,
        };
      }

      // Fetch content
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

        const response = await fetch(url, {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Kiem tra redirect cross-host
        const finalUrl = response.url;
        const originalHost = new URL(url).hostname;
        const finalHost = new URL(finalUrl).hostname;

        if (originalHost !== finalHost) {
          return {
            content: `Redirect detected to different host: ${finalUrl}\n\nPlease make a new request with the redirect URL.`,
            url: input.url,
            finalUrl,
            contentType: response.headers.get('content-type') ?? 'unknown',
            redirected: true,
            fetchTime: Date.now() - startTime,
            cached: false,
          };
        }

        // Doc content
        const contentType = response.headers.get('content-type') ?? 'text/plain';
        let content = await response.text();

        // Gioi han kich thuoc
        if (content.length > MAX_CONTENT_SIZE) {
          content = content.substring(0, MAX_CONTENT_SIZE) + '\n\n... (content truncated)';
        }

        // Convert HTML to markdown neu can
        if (contentType.includes('text/html')) {
          content = htmlToMarkdown(content);
        }

        // Luu vao cache
        saveToCache(url, {
          content,
          contentType,
          finalUrl,
        });

        // Cleanup cache dinh ky
        cleanupCache();

        return {
          content: `Content from: ${finalUrl}\n\nPrompt: ${input.prompt}\n\n---\n\n${content}`,
          url: input.url,
          finalUrl,
          contentType,
          redirected: url !== finalUrl,
          fetchTime: Date.now() - startTime,
          cached: false,
        };

      } catch (error: unknown) {
        const err = error as Error;

        if (err.name === 'AbortError') {
          throw new Error(`Request timed out after ${DEFAULT_FETCH_TIMEOUT_MS}ms`);
        }

        throw new Error(`Failed to fetch URL: ${err.message}`);
      }
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  definition: webFetchToolDefinition,
  createHandler: createWebFetchToolHandler,
  validateInput: validateWebFetchInput,
  checkAuthenticatedDomain,
  upgradeToHttps,
  htmlToMarkdown,
  AUTHENTICATED_DOMAINS,
};
