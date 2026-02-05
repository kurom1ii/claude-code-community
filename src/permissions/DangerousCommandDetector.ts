/**
 * Dangerous Command Detector
 *
 * Detects potentially dangerous patterns in shell commands and other
 * executable instructions. Provides risk assessment and safer alternatives.
 */

import {
  CommandAnalysisResult,
  DangerousPattern,
  DangerCategory,
  RiskLevel,
} from './types.js';

/**
 * Pattern definition for dangerous command detection
 */
interface PatternDefinition {
  pattern: RegExp;
  category: DangerCategory;
  description: string;
  severity: RiskLevel;
  saferAlternative?: string;
}

/**
 * Detects dangerous commands and provides risk assessment
 */
export class DangerousCommandDetector {
  private patterns: PatternDefinition[];
  private customPatterns: PatternDefinition[];
  private debug: boolean;

  constructor(options: { debug?: boolean; customPatterns?: PatternDefinition[] } = {}) {
    this.debug = options.debug ?? false;
    this.customPatterns = options.customPatterns ?? [];
    this.patterns = this.initializePatterns();
  }

  /**
   * Initialize built-in dangerous patterns
   */
  private initializePatterns(): PatternDefinition[] {
    return [
      // File destruction patterns
      {
        pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/i,
        category: 'file_destruction',
        description: 'Recursive force delete can destroy entire directory trees',
        severity: 'critical',
        saferAlternative: 'Use rm -ri for interactive deletion or move to trash',
      },
      {
        pattern: /\brm\s+-rf\s+[\/~]/,
        category: 'file_destruction',
        description: 'Force delete from root or home directory',
        severity: 'critical',
        saferAlternative: 'Specify exact paths and use -i flag for confirmation',
      },
      {
        pattern: /\brm\s+-rf\s+\$\{?[A-Za-z_][A-Za-z0-9_]*\}?[\/]?\s*$/,
        category: 'file_destruction',
        description: 'rm -rf with unquoted variable (could expand to dangerous path)',
        severity: 'critical',
        saferAlternative: 'Always quote variables: rm -rf "${VAR:?}"',
      },
      {
        pattern: />\s*\/dev\/sd[a-z]/,
        category: 'file_destruction',
        description: 'Direct write to block device can destroy disk',
        severity: 'critical',
      },
      {
        pattern: /\bdd\s+.*\bof=\/dev\/sd[a-z]/,
        category: 'file_destruction',
        description: 'dd to block device can overwrite disk',
        severity: 'critical',
      },
      {
        pattern: /\bmkfs\b/,
        category: 'file_destruction',
        description: 'Filesystem creation destroys all data on device',
        severity: 'critical',
      },
      {
        pattern: /\bformat\s+[A-Za-z]:/i,
        category: 'file_destruction',
        description: 'Drive formatting destroys all data',
        severity: 'critical',
      },

      // Permission escalation patterns
      {
        pattern: /\bsudo\s/,
        category: 'permission_escalation',
        description: 'Elevated privileges can bypass security controls',
        severity: 'high',
        saferAlternative: 'Run without sudo if possible',
      },
      {
        pattern: /\bsu\s+-\s/,
        category: 'permission_escalation',
        description: 'Switching to root user',
        severity: 'high',
      },
      {
        pattern: /\bchmod\s+777\b/,
        category: 'permission_escalation',
        description: 'World-writable permissions are insecure',
        severity: 'high',
        saferAlternative: 'Use chmod 755 or more restrictive permissions',
      },
      {
        pattern: /\bchmod\s+[0-7]*7[0-7]*7\b/,
        category: 'permission_escalation',
        description: 'World-readable/writable permissions',
        severity: 'medium',
        saferAlternative: 'Restrict permissions to owner and group only',
      },
      {
        pattern: /\bchown\s+.*:?root\b/,
        category: 'permission_escalation',
        description: 'Changing ownership to root',
        severity: 'medium',
      },
      {
        pattern: /\bsetuid\b|\bsetgid\b|\bchmod\s+[ug]\+s/,
        category: 'permission_escalation',
        description: 'Setting setuid/setgid bits enables privilege escalation',
        severity: 'critical',
      },

      // Credential exposure patterns
      {
        pattern: /\b(password|passwd|pwd|secret|token|api[_-]?key|auth)\s*[=:]/i,
        category: 'credential_exposure',
        description: 'Potential credential in command line',
        severity: 'high',
        saferAlternative: 'Use environment variables or secure credential storage',
      },
      {
        pattern: /\becho\s+.*\b(password|secret|token|key)\b/i,
        category: 'credential_exposure',
        description: 'Echoing credentials may expose them in logs',
        severity: 'medium',
      },
      {
        pattern: /\bcat\s+.*\.(env|pem|key|credentials)/i,
        category: 'credential_exposure',
        description: 'Reading sensitive credential files',
        severity: 'medium',
      },
      {
        pattern: /\bprintenv\b|\benv\b|\bset\s*$/,
        category: 'credential_exposure',
        description: 'Printing environment may expose secrets',
        severity: 'low',
      },

      // Network attack patterns
      {
        pattern: /\bcurl\s+.*\|\s*(ba)?sh/i,
        category: 'code_injection',
        description: 'Piping curl to shell executes remote code',
        severity: 'critical',
        saferAlternative: 'Download first, inspect, then execute',
      },
      {
        pattern: /\bwget\s+.*\|\s*(ba)?sh/i,
        category: 'code_injection',
        description: 'Piping wget to shell executes remote code',
        severity: 'critical',
        saferAlternative: 'Download first, inspect, then execute',
      },
      {
        pattern: /\bcurl\s+.*-o\s*-\s*\|\s*(ba)?sh/i,
        category: 'code_injection',
        description: 'Curl output to shell',
        severity: 'critical',
      },
      {
        pattern: /\beval\s+"?\$\(/,
        category: 'code_injection',
        description: 'eval with command substitution is dangerous',
        severity: 'high',
        saferAlternative: 'Avoid eval; use direct execution or safer alternatives',
      },
      {
        pattern: /\beval\s/,
        category: 'code_injection',
        description: 'eval can execute arbitrary code',
        severity: 'medium',
      },
      {
        pattern: /\bnc\s+(-[a-z]*l|-[a-z]*e)/i,
        category: 'network_attack',
        description: 'Netcat listener or command execution',
        severity: 'high',
      },
      {
        pattern: /\btelnet\s/,
        category: 'network_attack',
        description: 'Telnet is unencrypted',
        severity: 'low',
      },
      {
        pattern: /\bssh\s+.*-o\s*StrictHostKeyChecking\s*=\s*no/i,
        category: 'network_attack',
        description: 'Disabling SSH host key verification',
        severity: 'medium',
      },

      // Data exfiltration patterns
      {
        pattern: /\bcurl\s+.*(-d|--data|--data-raw|--data-binary)\s+.*@/,
        category: 'data_exfiltration',
        description: 'Uploading file contents via curl',
        severity: 'medium',
      },
      {
        pattern: /\bscp\s+.*\s+[^:]+@[^:]+:/,
        category: 'data_exfiltration',
        description: 'Copying files to remote server',
        severity: 'low',
      },
      {
        pattern: /\brsync\s+.*\s+[^:]+@[^:]+:/,
        category: 'data_exfiltration',
        description: 'Syncing files to remote server',
        severity: 'low',
      },

      // System modification patterns
      {
        pattern: /\bsystemctl\s+(stop|disable|mask)\b/,
        category: 'system_modification',
        description: 'Stopping or disabling system services',
        severity: 'high',
      },
      {
        pattern: /\bservice\s+\w+\s+stop\b/,
        category: 'system_modification',
        description: 'Stopping system service',
        severity: 'high',
      },
      {
        pattern: /\biptables\s+(-F|-X|--flush)/,
        category: 'system_modification',
        description: 'Flushing firewall rules',
        severity: 'critical',
      },
      {
        pattern: /\bufw\s+(disable|reset)\b/,
        category: 'system_modification',
        description: 'Disabling or resetting firewall',
        severity: 'critical',
      },
      {
        pattern: /\bsetenforce\s+0\b/,
        category: 'system_modification',
        description: 'Disabling SELinux',
        severity: 'high',
      },
      {
        pattern: />\s*\/etc\//,
        category: 'system_modification',
        description: 'Writing to system configuration directory',
        severity: 'high',
      },

      // Process manipulation patterns
      {
        pattern: /\bkill\s+-9\b|\bkillall\b|\bpkill\b/,
        category: 'process_manipulation',
        description: 'Force killing processes',
        severity: 'medium',
      },
      {
        pattern: /:\(\)\s*{\s*:\|:\s*&\s*}\s*;:/,
        category: 'process_manipulation',
        description: 'Fork bomb - will crash the system',
        severity: 'critical',
      },
      {
        pattern: /\bwhile\s+true\s*;\s*do/,
        category: 'process_manipulation',
        description: 'Infinite loop detected',
        severity: 'low',
      },
      {
        pattern: /\bnohup\s+.*&\s*$/,
        category: 'process_manipulation',
        description: 'Background process that survives logout',
        severity: 'low',
      },

      // Database destructive operations
      {
        pattern: /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i,
        category: 'file_destruction',
        description: 'Dropping database objects',
        severity: 'critical',
        saferAlternative: 'Use DROP ... IF EXISTS and ensure backups',
      },
      {
        pattern: /\bTRUNCATE\s+TABLE\b/i,
        category: 'file_destruction',
        description: 'Truncating table removes all data',
        severity: 'high',
      },
      {
        pattern: /\bDELETE\s+FROM\s+\w+\s*(;|$)/i,
        category: 'file_destruction',
        description: 'DELETE without WHERE clause removes all rows',
        severity: 'critical',
        saferAlternative: 'Always use a WHERE clause with DELETE',
      },
      {
        pattern: /\bUPDATE\s+\w+\s+SET\s+.*(?!WHERE)/i,
        category: 'file_destruction',
        description: 'UPDATE without WHERE clause affects all rows',
        severity: 'high',
        saferAlternative: 'Always use a WHERE clause with UPDATE',
      },

      // Git dangerous operations
      {
        pattern: /\bgit\s+push\s+.*--force\b/,
        category: 'file_destruction',
        description: 'Force pushing can overwrite remote history',
        severity: 'high',
        saferAlternative: 'Use --force-with-lease for safer force push',
      },
      {
        pattern: /\bgit\s+reset\s+--hard\b/,
        category: 'file_destruction',
        description: 'Hard reset discards all uncommitted changes',
        severity: 'medium',
        saferAlternative: 'Stash changes first or use --soft',
      },
      {
        pattern: /\bgit\s+clean\s+-[a-z]*f[a-z]*d/i,
        category: 'file_destruction',
        description: 'git clean removes untracked files and directories',
        severity: 'medium',
        saferAlternative: 'Use git clean -n first to preview',
      },
    ];
  }

  /**
   * Analyze a command for dangerous patterns
   */
  analyze(command: string): CommandAnalysisResult {
    const detectedPatterns: DangerousPattern[] = [];
    const allPatterns = [...this.patterns, ...this.customPatterns];

    for (const def of allPatterns) {
      const match = def.pattern.exec(command);
      if (match) {
        detectedPatterns.push({
          pattern: match[0],
          category: def.category,
          description: def.description,
          severity: def.severity,
          position: match.index,
        });

        if (this.debug) {
          console.log(`[DangerousCommandDetector] Matched: ${def.pattern} at position ${match.index}`);
        }
      }
    }

    const isDangerous = detectedPatterns.length > 0;
    const riskLevel = this.calculateOverallRisk(detectedPatterns);
    const saferAlternatives = this.getSaferAlternatives(detectedPatterns);

    return {
      allowed: !this.hasCriticalPatterns(detectedPatterns),
      isDangerous,
      riskLevel,
      detectedPatterns,
      reason: this.buildReason(detectedPatterns),
      saferAlternatives,
    };
  }

  /**
   * Check if command contains any dangerous patterns
   */
  isDangerous(command: string): boolean {
    return this.analyze(command).isDangerous;
  }

  /**
   * Get the risk level of a command
   */
  getRiskLevel(command: string): RiskLevel {
    return this.analyze(command).riskLevel;
  }

  /**
   * Add a custom pattern
   */
  addPattern(definition: PatternDefinition): void {
    this.customPatterns.push(definition);
    if (this.debug) {
      console.log(`[DangerousCommandDetector] Added custom pattern: ${definition.pattern}`);
    }
  }

  /**
   * Check for patterns by category
   */
  hasCategory(command: string, category: DangerCategory): boolean {
    const result = this.analyze(command);
    return result.detectedPatterns.some(p => p.category === category);
  }

  /**
   * Get all detected categories in a command
   */
  getCategories(command: string): DangerCategory[] {
    const result = this.analyze(command);
    const categories = new Set(result.detectedPatterns.map(p => p.category));
    return Array.from(categories);
  }

  /**
   * Calculate overall risk from detected patterns
   */
  private calculateOverallRisk(patterns: DangerousPattern[]): RiskLevel {
    if (patterns.length === 0) {
      return 'low';
    }

    const severities = patterns.map(p => p.severity);

    if (severities.includes('critical')) {
      return 'critical';
    }
    if (severities.includes('high')) {
      return 'high';
    }
    if (severities.includes('medium')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Check if any patterns are critical
   */
  private hasCriticalPatterns(patterns: DangerousPattern[]): boolean {
    return patterns.some(p => p.severity === 'critical');
  }

  /**
   * Build a human-readable reason string
   */
  private buildReason(patterns: DangerousPattern[]): string {
    if (patterns.length === 0) {
      return 'No dangerous patterns detected';
    }

    const reasons = patterns.map(p => p.description);
    return `Detected ${patterns.length} dangerous pattern(s): ${reasons.join('; ')}`;
  }

  /**
   * Get safer alternatives for detected patterns
   */
  private getSaferAlternatives(patterns: DangerousPattern[]): string[] {
    const alternatives: string[] = [];

    for (const pattern of patterns) {
      const def = [...this.patterns, ...this.customPatterns].find(
        d => d.pattern.source === pattern.pattern || d.description === pattern.description
      );
      if (def?.saferAlternative) {
        alternatives.push(def.saferAlternative);
      }
    }

    return [...new Set(alternatives)];
  }

  /**
   * Validate a command and return detailed analysis
   */
  validate(command: string): { valid: boolean; analysis: CommandAnalysisResult } {
    const analysis = this.analyze(command);
    return {
      valid: analysis.allowed,
      analysis,
    };
  }

  /**
   * Get statistics about pattern categories
   */
  getPatternStats(): Record<DangerCategory, number> {
    const stats: Partial<Record<DangerCategory, number>> = {};

    for (const pattern of [...this.patterns, ...this.customPatterns]) {
      stats[pattern.category] = (stats[pattern.category] || 0) + 1;
    }

    return stats as Record<DangerCategory, number>;
  }
}

// Export singleton instance for convenience
export const dangerousCommandDetector = new DangerousCommandDetector();
