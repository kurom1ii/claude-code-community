/**
 * Sensitive File Detector
 *
 * Detects sensitive files such as credentials, private keys, environment files,
 * and other files that should not be exposed or modified without careful consideration.
 */

import * as path from 'path';
import {
  SensitiveFileResult,
  SensitiveFileType,
  RiskLevel,
} from './types.js';

/**
 * Pattern definition for sensitive file detection
 */
interface SensitivePattern {
  pattern: RegExp;
  type: SensitiveFileType;
  confidence: number;
  description: string;
  recommendation: string;
}

/**
 * Configuration for the sensitive file detector
 */
export interface SensitiveFileDetectorConfig {
  /** Additional patterns to check */
  additionalPatterns?: SensitivePattern[];
  /** Patterns to exclude from detection */
  excludePatterns?: RegExp[];
  /** Enable debug logging */
  debug?: boolean;
  /** Custom file type handlers */
  customHandlers?: Map<string, (filePath: string) => SensitiveFileResult | null>;
}

/**
 * Detects sensitive files based on name, extension, and path patterns
 */
export class SensitiveFileDetector {
  private patterns: SensitivePattern[];
  private excludePatterns: RegExp[];
  private debug: boolean;
  private customHandlers: Map<string, (filePath: string) => SensitiveFileResult | null>;

  constructor(config: SensitiveFileDetectorConfig = {}) {
    this.patterns = [...this.initializePatterns(), ...(config.additionalPatterns ?? [])];
    this.excludePatterns = config.excludePatterns ?? [];
    this.debug = config.debug ?? false;
    this.customHandlers = config.customHandlers ?? new Map();
  }

  /**
   * Initialize built-in sensitive file patterns
   */
  private initializePatterns(): SensitivePattern[] {
    return [
      // Environment files
      {
        pattern: /^\.env$/,
        type: 'environment_file',
        confidence: 1.0,
        description: 'Environment file containing configuration and secrets',
        recommendation: 'Never commit to version control. Use .env.example for templates.',
      },
      {
        pattern: /^\.env\.[a-zA-Z0-9_-]+$/,
        type: 'environment_file',
        confidence: 1.0,
        description: 'Environment-specific configuration file',
        recommendation: 'Keep out of version control. Use secret management for production.',
      },
      {
        pattern: /^\.env\.local$/,
        type: 'environment_file',
        confidence: 1.0,
        description: 'Local environment overrides',
        recommendation: 'Contains local-only secrets. Never share or commit.',
      },
      {
        pattern: /^\.env\.development\.local$/,
        type: 'environment_file',
        confidence: 1.0,
        description: 'Local development environment file',
        recommendation: 'Keep local and never commit.',
      },

      // Credentials files
      {
        pattern: /^credentials\.(json|yaml|yml|xml|ini|conf)$/i,
        type: 'credentials_file',
        confidence: 1.0,
        description: 'Credentials configuration file',
        recommendation: 'Use encrypted credential stores or secret managers.',
      },
      {
        pattern: /^\.credentials$/,
        type: 'credentials_file',
        confidence: 1.0,
        description: 'Hidden credentials file',
        recommendation: 'Encrypt or use secure credential storage.',
      },
      {
        pattern: /^service[_-]?account[_-]?key\.json$/i,
        type: 'credentials_file',
        confidence: 1.0,
        description: 'Service account key file (likely GCP)',
        recommendation: 'Use workload identity or secure key management.',
      },
      {
        pattern: /^gcp[_-]?credentials\.json$/i,
        type: 'credentials_file',
        confidence: 1.0,
        description: 'Google Cloud Platform credentials',
        recommendation: 'Use environment variables or secret manager.',
      },
      {
        pattern: /^aws[_-]?credentials$/i,
        type: 'credentials_file',
        confidence: 1.0,
        description: 'AWS credentials file',
        recommendation: 'Use IAM roles or AWS Secrets Manager.',
      },

      // Secret files
      {
        pattern: /^secrets?\.(json|yaml|yml|xml|ini|conf|txt)$/i,
        type: 'credentials_file',
        confidence: 0.95,
        description: 'Secrets configuration file',
        recommendation: 'Use a secrets manager like Vault, AWS Secrets Manager, or similar.',
      },
      {
        pattern: /^\.secrets?$/,
        type: 'credentials_file',
        confidence: 0.95,
        description: 'Hidden secrets file',
        recommendation: 'Move to secure secrets management.',
      },

      // Private keys
      {
        pattern: /\.pem$/i,
        type: 'private_key',
        confidence: 0.9,
        description: 'PEM-encoded certificate or key file',
        recommendation: 'Store securely and restrict file permissions to 600.',
      },
      {
        pattern: /\.key$/i,
        type: 'private_key',
        confidence: 0.9,
        description: 'Private key file',
        recommendation: 'Never share. Store with restricted permissions.',
      },
      {
        pattern: /^id_rsa$/,
        type: 'private_key',
        confidence: 1.0,
        description: 'RSA private key',
        recommendation: 'Keep permissions at 600. Never commit to version control.',
      },
      {
        pattern: /^id_ed25519$/,
        type: 'private_key',
        confidence: 1.0,
        description: 'Ed25519 private key',
        recommendation: 'Keep permissions at 600. Never commit to version control.',
      },
      {
        pattern: /^id_ecdsa$/,
        type: 'private_key',
        confidence: 1.0,
        description: 'ECDSA private key',
        recommendation: 'Keep permissions at 600. Never commit to version control.',
      },
      {
        pattern: /^id_dsa$/,
        type: 'private_key',
        confidence: 1.0,
        description: 'DSA private key (deprecated)',
        recommendation: 'Upgrade to Ed25519. Keep permissions at 600.',
      },
      {
        pattern: /\.ppk$/i,
        type: 'private_key',
        confidence: 1.0,
        description: 'PuTTY private key',
        recommendation: 'Keep secure and never share.',
      },

      // Certificates (public but may contain private key)
      {
        pattern: /\.p12$/i,
        type: 'certificate',
        confidence: 0.9,
        description: 'PKCS#12 certificate bundle (may contain private key)',
        recommendation: 'Store securely with appropriate access controls.',
      },
      {
        pattern: /\.pfx$/i,
        type: 'certificate',
        confidence: 0.9,
        description: 'PFX certificate bundle (may contain private key)',
        recommendation: 'Store securely with appropriate access controls.',
      },
      {
        pattern: /\.keystore$/i,
        type: 'certificate',
        confidence: 0.85,
        description: 'Java keystore file',
        recommendation: 'Protect with strong password and access controls.',
      },
      {
        pattern: /\.jks$/i,
        type: 'certificate',
        confidence: 0.85,
        description: 'Java keystore file',
        recommendation: 'Protect with strong password and access controls.',
      },

      // Password files
      {
        pattern: /^\.htpasswd$/,
        type: 'password_file',
        confidence: 1.0,
        description: 'Apache password file',
        recommendation: 'Keep outside web root. Use strong hashing.',
      },
      {
        pattern: /^passwd$/,
        type: 'password_file',
        confidence: 0.7,
        description: 'Password file',
        recommendation: 'Ensure proper access restrictions.',
      },
      {
        pattern: /^shadow$/,
        type: 'password_file',
        confidence: 1.0,
        description: 'Shadow password file',
        recommendation: 'System file - should not be accessible.',
      },
      {
        pattern: /passwords?\.(txt|csv|json|yaml|yml)$/i,
        type: 'password_file',
        confidence: 0.9,
        description: 'Password list file',
        recommendation: 'Use a password manager instead.',
      },

      // Token files
      {
        pattern: /^\.token$/,
        type: 'token_file',
        confidence: 0.95,
        description: 'Authentication token file',
        recommendation: 'Use secure token storage and rotation.',
      },
      {
        pattern: /tokens?\.(json|txt|yaml|yml)$/i,
        type: 'token_file',
        confidence: 0.85,
        description: 'Token storage file',
        recommendation: 'Use encrypted token storage.',
      },
      {
        pattern: /^\.api[_-]?key$/i,
        type: 'token_file',
        confidence: 0.95,
        description: 'API key file',
        recommendation: 'Use environment variables or secret managers.',
      },
      {
        pattern: /^api[_-]?keys?\.(json|txt|yaml|yml)$/i,
        type: 'token_file',
        confidence: 0.9,
        description: 'API keys file',
        recommendation: 'Use environment variables or secret managers.',
      },

      // Config files with potential secrets
      {
        pattern: /^\.npmrc$/,
        type: 'config_with_secrets',
        confidence: 0.8,
        description: 'NPM configuration (may contain registry tokens)',
        recommendation: 'Use npm login and environment variables for tokens.',
      },
      {
        pattern: /^\.pypirc$/,
        type: 'config_with_secrets',
        confidence: 0.9,
        description: 'PyPI configuration with credentials',
        recommendation: 'Use keyring or environment variables.',
      },
      {
        pattern: /^\.netrc$/,
        type: 'config_with_secrets',
        confidence: 0.95,
        description: 'Network credentials file',
        recommendation: 'Ensure file permissions are 600.',
      },
      {
        pattern: /^\.dockercfg$/,
        type: 'config_with_secrets',
        confidence: 0.9,
        description: 'Docker registry credentials',
        recommendation: 'Use docker credential helpers.',
      },
      {
        pattern: /^config\.json$/i,
        type: 'config_with_secrets',
        confidence: 0.5,
        description: 'Configuration file (may contain secrets)',
        recommendation: 'Separate secrets from configuration.',
      },
      {
        pattern: /^\.kube\/config$/,
        type: 'config_with_secrets',
        confidence: 0.95,
        description: 'Kubernetes configuration with cluster credentials',
        recommendation: 'Use RBAC and restrict file access.',
      },
      {
        pattern: /^kubeconfig$/i,
        type: 'config_with_secrets',
        confidence: 0.9,
        description: 'Kubernetes configuration file',
        recommendation: 'Store securely with restricted access.',
      },

      // Database files
      {
        pattern: /\.sqlite3?$/i,
        type: 'database_file',
        confidence: 0.7,
        description: 'SQLite database file',
        recommendation: 'May contain sensitive data. Restrict access.',
      },
      {
        pattern: /\.db$/i,
        type: 'database_file',
        confidence: 0.6,
        description: 'Database file',
        recommendation: 'May contain sensitive data. Restrict access.',
      },
      {
        pattern: /\.mdb$/i,
        type: 'database_file',
        confidence: 0.7,
        description: 'Microsoft Access database',
        recommendation: 'May contain sensitive data. Consider encryption.',
      },

      // Backup files
      {
        pattern: /\.(bak|backup|old|orig)$/i,
        type: 'backup_file',
        confidence: 0.6,
        description: 'Backup file',
        recommendation: 'May contain sensitive data from original file.',
      },
      {
        pattern: /~$/,
        type: 'backup_file',
        confidence: 0.5,
        description: 'Backup file (tilde suffix)',
        recommendation: 'Clean up backup files regularly.',
      },
      {
        pattern: /\.swp$/,
        type: 'backup_file',
        confidence: 0.4,
        description: 'Vim swap file',
        recommendation: 'May contain unsaved sensitive content.',
      },

      // Log files (may contain secrets)
      {
        pattern: /\.(log|logs)$/i,
        type: 'log_file',
        confidence: 0.4,
        description: 'Log file (may contain sensitive information)',
        recommendation: 'Ensure logs do not contain credentials or PII.',
      },
      {
        pattern: /^debug\.log$/i,
        type: 'log_file',
        confidence: 0.5,
        description: 'Debug log file',
        recommendation: 'May contain verbose output including secrets.',
      },

      // History files
      {
        pattern: /^\.bash_history$/,
        type: 'log_file',
        confidence: 0.7,
        description: 'Bash command history',
        recommendation: 'May contain commands with inline credentials.',
      },
      {
        pattern: /^\.zsh_history$/,
        type: 'log_file',
        confidence: 0.7,
        description: 'Zsh command history',
        recommendation: 'May contain commands with inline credentials.',
      },
      {
        pattern: /^\.mysql_history$/,
        type: 'log_file',
        confidence: 0.8,
        description: 'MySQL command history',
        recommendation: 'May contain queries with sensitive data.',
      },
      {
        pattern: /^\.psql_history$/,
        type: 'log_file',
        confidence: 0.8,
        description: 'PostgreSQL command history',
        recommendation: 'May contain queries with sensitive data.',
      },
    ];
  }

  /**
   * Check if a file is sensitive
   */
  isSensitive(filePath: string): SensitiveFileResult {
    const fileName = path.basename(filePath);
    const fullPath = path.normalize(filePath);

    // Check exclusion patterns first
    for (const exclude of this.excludePatterns) {
      if (exclude.test(fileName) || exclude.test(fullPath)) {
        if (this.debug) {
          console.log(`[SensitiveFileDetector] Excluded by pattern: ${exclude}`);
        }
        return {
          isSensitive: false,
          confidence: 1.0,
          reason: 'Excluded by pattern',
        };
      }
    }

    // Check custom handlers
    const ext = path.extname(fileName).toLowerCase();
    const handler = this.customHandlers.get(ext);
    if (handler) {
      const result = handler(filePath);
      if (result) {
        return result;
      }
    }

    // Check patterns
    let bestMatch: SensitiveFileResult | null = null;
    let highestConfidence = 0;

    for (const pattern of this.patterns) {
      if (pattern.pattern.test(fileName)) {
        if (pattern.confidence > highestConfidence) {
          highestConfidence = pattern.confidence;
          bestMatch = {
            isSensitive: true,
            sensitiveType: pattern.type,
            confidence: pattern.confidence,
            reason: pattern.description,
            recommendation: pattern.recommendation,
          };

          if (this.debug) {
            console.log(`[SensitiveFileDetector] Matched: ${pattern.pattern} with confidence ${pattern.confidence}`);
          }
        }
      }
    }

    // Also check for sensitive path components
    const pathResult = this.checkPathComponents(fullPath);
    if (pathResult && pathResult.confidence > highestConfidence) {
      return pathResult;
    }

    if (bestMatch) {
      return bestMatch;
    }

    return {
      isSensitive: false,
      confidence: 1.0,
      reason: 'No sensitive patterns matched',
    };
  }

  /**
   * Check path components for sensitive directories
   */
  private checkPathComponents(filePath: string): SensitiveFileResult | null {
    const sensitivePathPatterns: Array<{
      pattern: RegExp;
      type: SensitiveFileType;
      confidence: number;
      description: string;
    }> = [
      {
        pattern: /[\/\\]\.ssh[\/\\]/,
        type: 'private_key',
        confidence: 0.9,
        description: 'File in SSH directory',
      },
      {
        pattern: /[\/\\]\.gnupg[\/\\]/,
        type: 'private_key',
        confidence: 0.9,
        description: 'File in GnuPG directory',
      },
      {
        pattern: /[\/\\]\.aws[\/\\]/,
        type: 'credentials_file',
        confidence: 0.85,
        description: 'File in AWS configuration directory',
      },
      {
        pattern: /[\/\\]\.docker[\/\\]/,
        type: 'config_with_secrets',
        confidence: 0.8,
        description: 'File in Docker configuration directory',
      },
      {
        pattern: /[\/\\]\.kube[\/\\]/,
        type: 'config_with_secrets',
        confidence: 0.85,
        description: 'File in Kubernetes configuration directory',
      },
      {
        pattern: /[\/\\]secrets?[\/\\]/i,
        type: 'credentials_file',
        confidence: 0.7,
        description: 'File in secrets directory',
      },
      {
        pattern: /[\/\\]private[\/\\]/i,
        type: 'private_key',
        confidence: 0.6,
        description: 'File in private directory',
      },
      {
        pattern: /[\/\\]credentials?[\/\\]/i,
        type: 'credentials_file',
        confidence: 0.7,
        description: 'File in credentials directory',
      },
    ];

    for (const check of sensitivePathPatterns) {
      if (check.pattern.test(filePath)) {
        return {
          isSensitive: true,
          sensitiveType: check.type,
          confidence: check.confidence,
          reason: check.description,
          recommendation: 'Verify this file does not contain sensitive data before processing.',
        };
      }
    }

    return null;
  }

  /**
   * Get the type of sensitive file
   */
  getFileType(filePath: string): SensitiveFileType | null {
    const result = this.isSensitive(filePath);
    return result.isSensitive ? result.sensitiveType ?? null : null;
  }

  /**
   * Get risk level for a sensitive file
   */
  getRiskLevel(filePath: string): RiskLevel {
    const result = this.isSensitive(filePath);

    if (!result.isSensitive) {
      return 'low';
    }

    // Map file types to risk levels
    const riskMap: Record<SensitiveFileType, RiskLevel> = {
      environment_file: 'high',
      credentials_file: 'critical',
      private_key: 'critical',
      certificate: 'high',
      password_file: 'critical',
      token_file: 'critical',
      config_with_secrets: 'high',
      database_file: 'medium',
      backup_file: 'medium',
      log_file: 'low',
    };

    return result.sensitiveType ? riskMap[result.sensitiveType] : 'medium';
  }

  /**
   * Add a custom pattern
   */
  addPattern(pattern: SensitivePattern): void {
    this.patterns.push(pattern);
    if (this.debug) {
      console.log(`[SensitiveFileDetector] Added pattern: ${pattern.pattern}`);
    }
  }

  /**
   * Add an exclusion pattern
   */
  addExclusion(pattern: RegExp): void {
    this.excludePatterns.push(pattern);
    if (this.debug) {
      console.log(`[SensitiveFileDetector] Added exclusion: ${pattern}`);
    }
  }

  /**
   * Register a custom file handler
   */
  registerHandler(
    extension: string,
    handler: (filePath: string) => SensitiveFileResult | null
  ): void {
    this.customHandlers.set(extension.toLowerCase(), handler);
    if (this.debug) {
      console.log(`[SensitiveFileDetector] Registered handler for: ${extension}`);
    }
  }

  /**
   * Check multiple files and return all sensitive ones
   */
  filterSensitive(filePaths: string[]): Array<{ path: string; result: SensitiveFileResult }> {
    return filePaths
      .map(p => ({ path: p, result: this.isSensitive(p) }))
      .filter(({ result }) => result.isSensitive);
  }

  /**
   * Get all patterns by type
   */
  getPatternsByType(type: SensitiveFileType): SensitivePattern[] {
    return this.patterns.filter(p => p.type === type);
  }

  /**
   * Get statistics about patterns
   */
  getStats(): Record<SensitiveFileType, number> {
    const stats: Partial<Record<SensitiveFileType, number>> = {};

    for (const pattern of this.patterns) {
      stats[pattern.type] = (stats[pattern.type] || 0) + 1;
    }

    return stats as Record<SensitiveFileType, number>;
  }
}

// Export singleton instance for convenience
export const sensitiveFileDetector = new SensitiveFileDetector();
