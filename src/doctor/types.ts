/**
 * Diagnostic types for Claude Code Community
 * Health checking and troubleshooting system
 */

/**
 * Diagnostic check interface - implement this to create custom checks
 */
export interface DiagnosticCheck {
  /** Unique name for the check */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping */
  category: DiagnosticCategory;
  /** Run the diagnostic check */
  run(): Promise<DiagnosticResult>;
}

/**
 * Categories for organizing diagnostic checks
 */
export type DiagnosticCategory =
  | 'system'
  | 'dependencies'
  | 'configuration'
  | 'api'
  | 'permissions'
  | 'network';

/**
 * Result of a single diagnostic check
 */
export interface DiagnosticResult {
  /** Name of the check that produced this result */
  check: string;
  /** Status of the check */
  status: 'pass' | 'warn' | 'fail' | 'skip';
  /** Human-readable message about the result */
  message: string;
  /** Additional details about the check */
  details?: string;
  /** Suggestion for fixing issues */
  suggestion?: string;
  /** How long the check took in milliseconds */
  duration?: number;
}

/**
 * Complete diagnostic report with all check results
 */
export interface DiagnosticReport {
  /** When the report was generated */
  timestamp: Date;
  /** Version of Claude Code Community */
  version: string;
  /** Operating system platform */
  platform: NodeJS.Platform;
  /** Node.js version */
  nodeVersion: string;
  /** All check results */
  results: DiagnosticResult[];
  /** Summary counts */
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Options for running diagnostics
 */
export interface DiagnosticOptions {
  /** Run checks in parallel when possible */
  parallel?: boolean;
  /** Timeout for each check in milliseconds */
  timeout?: number;
  /** Categories to include (all if not specified) */
  categories?: DiagnosticCategory[];
  /** Skip specific checks by name */
  skip?: string[];
  /** Verbose output with details */
  verbose?: boolean;
}

/**
 * Check metadata for registration
 */
export interface CheckMetadata {
  /** Check implementation */
  check: DiagnosticCheck;
  /** Whether check is enabled */
  enabled: boolean;
  /** Dependencies on other checks */
  dependsOn?: string[];
}
