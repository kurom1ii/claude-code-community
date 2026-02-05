/**
 * DiagnosticRunner - Orchestrates diagnostic checks
 */

import {
  DiagnosticCheck,
  DiagnosticCategory,
  DiagnosticResult,
  DiagnosticReport,
  DiagnosticOptions,
  CheckMetadata,
} from './types.js';

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const VERSION = '1.0.0';

/**
 * Runner for diagnostic checks
 * Manages check registration and execution
 */
export class DiagnosticRunner {
  private checks: Map<string, CheckMetadata> = new Map();
  private options: Required<DiagnosticOptions>;

  constructor(options: DiagnosticOptions = {}) {
    this.options = {
      parallel: options.parallel ?? true,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      categories: options.categories ?? [],
      skip: options.skip ?? [],
      verbose: options.verbose ?? false,
    };
  }

  /**
   * Register a diagnostic check
   */
  registerCheck(check: DiagnosticCheck, dependsOn?: string[]): void {
    if (this.checks.has(check.name)) {
      throw new Error(`Check "${check.name}" is already registered`);
    }

    this.checks.set(check.name, {
      check,
      enabled: true,
      dependsOn,
    });
  }

  /**
   * Unregister a check by name
   */
  unregisterCheck(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Enable or disable a check
   */
  setCheckEnabled(name: string, enabled: boolean): void {
    const metadata = this.checks.get(name);
    if (metadata) {
      metadata.enabled = enabled;
    }
  }

  /**
   * Get all registered check names
   */
  getCheckNames(): string[] {
    return Array.from(this.checks.keys());
  }

  /**
   * Get checks by category
   */
  getChecksByCategory(category: DiagnosticCategory): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];
    for (const metadata of this.checks.values()) {
      if (metadata.check.category === category && metadata.enabled) {
        checks.push(metadata.check);
      }
    }
    return checks;
  }

  /**
   * Run all registered checks
   */
  async runAll(): Promise<DiagnosticReport> {
    const startTime = Date.now();
    const results: DiagnosticResult[] = [];

    // Get checks to run, respecting categories filter
    const checksToRun = this.getChecksToRun();

    if (this.options.parallel) {
      // Group checks by dependencies for parallel execution
      const groups = this.groupChecksByDependencies(checksToRun);

      for (const group of groups) {
        const groupResults = await Promise.all(
          group.map((check) => this.executeCheck(check))
        );
        results.push(...groupResults);
      }
    } else {
      // Sequential execution
      for (const check of checksToRun) {
        const result = await this.executeCheck(check);
        results.push(result);
      }
    }

    return this.createReport(results);
  }

  /**
   * Run checks for a specific category
   */
  async runCategory(category: DiagnosticCategory): Promise<DiagnosticResult[]> {
    const checks = this.getChecksByCategory(category);
    const filteredChecks = checks.filter(
      (c) => !this.options.skip.includes(c.name)
    );

    if (this.options.parallel) {
      return Promise.all(
        filteredChecks.map((check) => this.executeCheck(check))
      );
    }

    const results: DiagnosticResult[] = [];
    for (const check of filteredChecks) {
      results.push(await this.executeCheck(check));
    }
    return results;
  }

  /**
   * Run a specific check by name
   */
  async runCheck(name: string): Promise<DiagnosticResult> {
    const metadata = this.checks.get(name);
    if (!metadata) {
      return {
        check: name,
        status: 'skip',
        message: `Check "${name}" not found`,
      };
    }

    if (!metadata.enabled) {
      return {
        check: name,
        status: 'skip',
        message: `Check "${name}" is disabled`,
      };
    }

    // Run dependencies first
    if (metadata.dependsOn) {
      for (const depName of metadata.dependsOn) {
        const depResult = await this.runCheck(depName);
        if (depResult.status === 'fail') {
          return {
            check: name,
            status: 'skip',
            message: `Skipped due to failed dependency: ${depName}`,
            details: depResult.message,
          };
        }
      }
    }

    return this.executeCheck(metadata.check);
  }

  /**
   * Execute a single check with timeout
   */
  private async executeCheck(check: DiagnosticCheck): Promise<DiagnosticResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        check.run(),
        this.createTimeout(check.name),
      ]);

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      return {
        check: check.name,
        status: 'fail',
        message: `Check threw an error: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(checkName: string): Promise<DiagnosticResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Check "${checkName}" timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });
  }

  /**
   * Get checks to run based on options
   */
  private getChecksToRun(): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    for (const metadata of this.checks.values()) {
      if (!metadata.enabled) continue;
      if (this.options.skip.includes(metadata.check.name)) continue;

      if (
        this.options.categories.length === 0 ||
        this.options.categories.includes(metadata.check.category)
      ) {
        checks.push(metadata.check);
      }
    }

    return checks;
  }

  /**
   * Group checks by dependencies for parallel execution
   * Returns groups where each group can run in parallel
   */
  private groupChecksByDependencies(
    checks: DiagnosticCheck[]
  ): DiagnosticCheck[][] {
    const groups: DiagnosticCheck[][] = [];
    const scheduled = new Set<string>();
    const remaining = new Map<string, DiagnosticCheck>();

    for (const check of checks) {
      remaining.set(check.name, check);
    }

    while (remaining.size > 0) {
      const group: DiagnosticCheck[] = [];

      for (const [name, check] of remaining) {
        const metadata = this.checks.get(name);
        const deps = metadata?.dependsOn ?? [];

        // Check if all dependencies are scheduled
        const depsScheduled = deps.every((dep) => scheduled.has(dep));

        if (depsScheduled) {
          group.push(check);
        }
      }

      if (group.length === 0) {
        // Circular dependency or missing dependency - add remaining checks
        for (const check of remaining.values()) {
          group.push(check);
        }
      }

      for (const check of group) {
        scheduled.add(check.name);
        remaining.delete(check.name);
      }

      if (group.length > 0) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Create a diagnostic report from results
   */
  private createReport(results: DiagnosticResult[]): DiagnosticReport {
    const summary = {
      passed: 0,
      warnings: 0,
      failed: 0,
      skipped: 0,
    };

    for (const result of results) {
      switch (result.status) {
        case 'pass':
          summary.passed++;
          break;
        case 'warn':
          summary.warnings++;
          break;
        case 'fail':
          summary.failed++;
          break;
        case 'skip':
          summary.skipped++;
          break;
      }
    }

    return {
      timestamp: new Date(),
      version: VERSION,
      platform: process.platform,
      nodeVersion: process.version,
      results,
      summary,
    };
  }
}
