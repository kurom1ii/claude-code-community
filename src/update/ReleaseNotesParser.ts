/**
 * Claude Code Community - Release Notes Parser
 * Parse and format release notes from GitHub and npm
 */

import type { ReleaseInfo } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed section from release notes
 */
export interface ReleaseSection {
  /** Section title (e.g., "Breaking Changes", "Features") */
  title: string;
  /** Items in this section */
  items: string[];
  /** Whether this section indicates breaking changes */
  isBreaking: boolean;
  /** Whether this section indicates security fixes */
  isSecurity: boolean;
}

/**
 * Parsed release notes
 */
export interface ParsedReleaseNotes {
  /** Release title/summary */
  title?: string;
  /** Full description */
  description?: string;
  /** Parsed sections */
  sections: ReleaseSection[];
  /** Breaking changes extracted */
  breakingChanges: string[];
  /** Security fixes extracted */
  securityFixes: string[];
  /** New features */
  features: string[];
  /** Bug fixes */
  bugFixes: string[];
  /** Other changes */
  other: string[];
  /** Contributors mentioned */
  contributors: string[];
}

/**
 * Options for parsing release notes
 */
export interface ParseOptions {
  /** Maximum items per section for display */
  maxItemsPerSection?: number;
  /** Whether to include contributor mentions */
  includeContributors?: boolean;
  /** Whether to parse commit references */
  parseCommitRefs?: boolean;
}

// ============================================================================
// Section Patterns
// ============================================================================

/** Patterns for identifying section types */
const SECTION_PATTERNS = {
  breaking: [
    /^#+\s*breaking\s*changes?/i,
    /^#+\s*\u26a0\ufe0f?\s*breaking/i,
    /^#+\s*BREAKING/,
    /^\*\*breaking\s*changes?\*\*/i,
  ],
  security: [
    /^#+\s*security/i,
    /^#+\s*\ud83d\udd12?\s*security/i,
    /^\*\*security\*\*/i,
    /^#+\s*vulnerability/i,
  ],
  features: [
    /^#+\s*features?/i,
    /^#+\s*new\s*features?/i,
    /^#+\s*\u2728?\s*features?/i,
    /^#+\s*added/i,
    /^#+\s*enhancements?/i,
  ],
  fixes: [
    /^#+\s*bug\s*fix(es)?/i,
    /^#+\s*fix(es)?/i,
    /^#+\s*\ud83d\udc1b?\s*fix(es)?/i,
    /^#+\s*resolved/i,
    /^#+\s*fixed/i,
  ],
  deprecations: [
    /^#+\s*deprecat(ed|ions?)/i,
    /^#+\s*\u26a0\ufe0f?\s*deprecat/i,
  ],
  performance: [
    /^#+\s*performance/i,
    /^#+\s*\u26a1?\s*performance/i,
  ],
  documentation: [
    /^#+\s*documentation/i,
    /^#+\s*docs?/i,
    /^#+\s*\ud83d\udcdd?\s*docs?/i,
  ],
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clean markdown formatting from text
 */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1')     // Italic
    .replace(/`([^`]+)`/g, '$1')       // Code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/^[-*+]\s+/, '')          // List markers
    .trim();
}

/**
 * Extract items from a section
 */
function extractItems(content: string): string[] {
  const items: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match list items
    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const item = cleanMarkdown(trimmed.replace(/^[-*+\d.]+\s+/, ''));
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Detect section type from heading
 */
function detectSectionType(heading: string): {
  type: string;
  isBreaking: boolean;
  isSecurity: boolean;
} {
  for (const [type, patterns] of Object.entries(SECTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(heading)) {
        return {
          type,
          isBreaking: type === 'breaking',
          isSecurity: type === 'security',
        };
      }
    }
  }

  return { type: 'other', isBreaking: false, isSecurity: false };
}

/**
 * Extract contributor mentions from text
 */
function extractContributors(text: string): string[] {
  const mentions = new Set<string>();
  const mentionPattern = /@([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    mentions.add(match[1]);
  }

  // Also look for "Thanks to @user" or "by @user" patterns
  const thanksPattern = /(?:thanks?\s+to|by)\s+@([a-zA-Z0-9_-]+)/gi;
  while ((match = thanksPattern.exec(text)) !== null) {
    mentions.add(match[1]);
  }

  return Array.from(mentions);
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse release notes content into structured format
 *
 * @param content - Raw release notes markdown
 * @param options - Parsing options
 * @returns Parsed release notes
 *
 * @example
 * ```typescript
 * const notes = parseReleaseNotes(`
 * ## Breaking Changes
 * - Removed deprecated API
 *
 * ## Features
 * - Added new command
 * `);
 *
 * console.log(notes.breakingChanges); // ['Removed deprecated API']
 * console.log(notes.features); // ['Added new command']
 * ```
 */
export function parseReleaseNotes(
  content: string,
  options: ParseOptions = {}
): ParsedReleaseNotes {
  const { maxItemsPerSection = 20, includeContributors = true } = options;

  const result: ParsedReleaseNotes = {
    sections: [],
    breakingChanges: [],
    securityFixes: [],
    features: [],
    bugFixes: [],
    other: [],
    contributors: [],
  };

  if (!content) {
    return result;
  }

  // Extract title (first heading)
  const titleMatch = content.match(/^#+\s+(.+)$/m);
  if (titleMatch) {
    result.title = cleanMarkdown(titleMatch[1]);
  }

  // Split into sections by headings
  const sections = content.split(/(?=^#+\s)/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    // Get heading
    const headingMatch = section.match(/^(#+)\s+(.+)$/m);
    if (!headingMatch) continue;

    const heading = headingMatch[2];
    const sectionContent = section.slice(headingMatch[0].length);
    const items = extractItems(sectionContent).slice(0, maxItemsPerSection);

    const { type, isBreaking, isSecurity } = detectSectionType(heading);

    // Add to sections
    result.sections.push({
      title: cleanMarkdown(heading),
      items,
      isBreaking,
      isSecurity,
    });

    // Categorize items
    switch (type) {
      case 'breaking':
        result.breakingChanges.push(...items);
        break;
      case 'security':
        result.securityFixes.push(...items);
        break;
      case 'features':
        result.features.push(...items);
        break;
      case 'fixes':
        result.bugFixes.push(...items);
        break;
      default:
        result.other.push(...items);
    }
  }

  // Extract contributors
  if (includeContributors) {
    result.contributors = extractContributors(content);
  }

  // Extract description (text before first section)
  const firstHeading = content.search(/^#+\s/m);
  if (firstHeading > 0) {
    result.description = content.slice(0, firstHeading).trim();
  }

  return result;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Terminal color codes for formatting
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Format release notes for terminal display
 *
 * @param notes - Parsed release notes
 * @param useColors - Whether to use ANSI colors
 * @returns Formatted string for terminal
 */
export function formatForTerminal(
  notes: ParsedReleaseNotes,
  useColors = true
): string {
  const c = useColors ? COLORS : {
    reset: '', bold: '', dim: '', red: '',
    green: '', yellow: '', blue: '',
    magenta: '', cyan: '', white: ''
  };

  const lines: string[] = [];

  // Title
  if (notes.title) {
    lines.push(`${c.bold}${notes.title}${c.reset}`);
    lines.push('');
  }

  // Breaking changes (highlighted)
  if (notes.breakingChanges.length > 0) {
    lines.push(`${c.red}${c.bold}BREAKING CHANGES:${c.reset}`);
    for (const item of notes.breakingChanges) {
      lines.push(`  ${c.red}!${c.reset} ${item}`);
    }
    lines.push('');
  }

  // Security fixes (highlighted)
  if (notes.securityFixes.length > 0) {
    lines.push(`${c.yellow}${c.bold}SECURITY FIXES:${c.reset}`);
    for (const item of notes.securityFixes) {
      lines.push(`  ${c.yellow}*${c.reset} ${item}`);
    }
    lines.push('');
  }

  // Features
  if (notes.features.length > 0) {
    lines.push(`${c.green}${c.bold}New Features:${c.reset}`);
    for (const item of notes.features) {
      lines.push(`  ${c.green}+${c.reset} ${item}`);
    }
    lines.push('');
  }

  // Bug fixes
  if (notes.bugFixes.length > 0) {
    lines.push(`${c.blue}${c.bold}Bug Fixes:${c.reset}`);
    for (const item of notes.bugFixes) {
      lines.push(`  ${c.blue}-${c.reset} ${item}`);
    }
    lines.push('');
  }

  // Other sections
  for (const section of notes.sections) {
    if (section.isBreaking || section.isSecurity) continue;
    if (['features', 'fixes', 'bug fixes'].some(s =>
      section.title.toLowerCase().includes(s)
    )) continue;

    if (section.items.length > 0) {
      lines.push(`${c.bold}${section.title}:${c.reset}`);
      for (const item of section.items.slice(0, 5)) {
        lines.push(`  ${c.dim}-${c.reset} ${item}`);
      }
      if (section.items.length > 5) {
        lines.push(`  ${c.dim}... and ${section.items.length - 5} more${c.reset}`);
      }
      lines.push('');
    }
  }

  // Contributors
  if (notes.contributors.length > 0) {
    lines.push(`${c.magenta}Contributors: ${notes.contributors.map(c => `@${c}`).join(', ')}${c.reset}`);
  }

  return lines.join('\n');
}

/**
 * Format release notes as compact summary
 */
export function formatCompactSummary(notes: ParsedReleaseNotes): string {
  const parts: string[] = [];

  if (notes.breakingChanges.length > 0) {
    parts.push(`${notes.breakingChanges.length} breaking change${notes.breakingChanges.length > 1 ? 's' : ''}`);
  }
  if (notes.securityFixes.length > 0) {
    parts.push(`${notes.securityFixes.length} security fix${notes.securityFixes.length > 1 ? 'es' : ''}`);
  }
  if (notes.features.length > 0) {
    parts.push(`${notes.features.length} new feature${notes.features.length > 1 ? 's' : ''}`);
  }
  if (notes.bugFixes.length > 0) {
    parts.push(`${notes.bugFixes.length} bug fix${notes.bugFixes.length > 1 ? 'es' : ''}`);
  }

  if (parts.length === 0) {
    return 'Minor updates and improvements';
  }

  return parts.join(', ');
}

/**
 * Format release info for display
 */
export function formatReleaseInfo(release: ReleaseInfo, useColors = true): string {
  const c = useColors ? COLORS : {
    reset: '', bold: '', dim: '', red: '',
    green: '', yellow: '', blue: '',
    magenta: '', cyan: '', white: ''
  };

  const lines: string[] = [];

  // Version header
  let header = `${c.bold}v${release.version}${c.reset}`;
  if (release.security) {
    header += ` ${c.yellow}[SECURITY]${c.reset}`;
  }
  if (release.breaking) {
    header += ` ${c.red}[BREAKING]${c.reset}`;
  }
  lines.push(header);

  // Date
  const dateStr = release.publishedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  lines.push(`${c.dim}Released: ${dateStr}${c.reset}`);

  // Notes
  if (release.releaseNotes) {
    const parsed = parseReleaseNotes(release.releaseNotes);
    const summary = formatCompactSummary(parsed);
    lines.push(`${c.dim}${summary}${c.reset}`);
  }

  return lines.join('\n');
}

// ============================================================================
// ReleaseNotesParser Class
// ============================================================================

/**
 * Release notes parser with caching and customization
 */
export class ReleaseNotesParser {
  private readonly options: ParseOptions;
  private cache = new Map<string, ParsedReleaseNotes>();

  constructor(options: ParseOptions = {}) {
    this.options = {
      maxItemsPerSection: 20,
      includeContributors: true,
      parseCommitRefs: true,
      ...options,
    };
  }

  /**
   * Parse release notes with caching
   */
  parse(content: string): ParsedReleaseNotes {
    // Simple hash for caching
    const key = content.slice(0, 100) + content.length;
    let parsed = this.cache.get(key);

    if (!parsed) {
      parsed = parseReleaseNotes(content, this.options);
      this.cache.set(key, parsed);
    }

    return parsed;
  }

  /**
   * Extract breaking changes from notes
   */
  extractBreakingChanges(content: string): string[] {
    return this.parse(content).breakingChanges;
  }

  /**
   * Extract security fixes from notes
   */
  extractSecurityFixes(content: string): string[] {
    return this.parse(content).securityFixes;
  }

  /**
   * Check if release notes indicate breaking changes
   */
  hasBreakingChanges(content: string): boolean {
    return this.parse(content).breakingChanges.length > 0;
  }

  /**
   * Check if release notes indicate security fixes
   */
  hasSecurityFixes(content: string): boolean {
    return this.parse(content).securityFixes.length > 0;
  }

  /**
   * Format for terminal display
   */
  formatForTerminal(content: string, useColors = true): string {
    return formatForTerminal(this.parse(content), useColors);
  }

  /**
   * Get compact summary
   */
  getCompactSummary(content: string): string {
    return formatCompactSummary(this.parse(content));
  }

  /**
   * Clear parse cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Default instance
export const releaseNotesParser = new ReleaseNotesParser();
