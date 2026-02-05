/**
 * ApiCheck - Check API connectivity and validity
 * Verifies API key, endpoint reachability, and model availability
 */

import { DiagnosticCheck, DiagnosticCategory, DiagnosticResult } from '../types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Default API endpoints
const DEFAULT_ENDPOINTS = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
};

// Models to check
const AVAILABLE_MODELS = {
  anthropic: [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
  ],
  openai: [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
};

/**
 * Get API key from environment or config
 */
async function getApiKey(): Promise<string | null> {
  // Check environment variables
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.CLAUDE_API_KEY) return process.env.CLAUDE_API_KEY;

  // Check config file
  const configPath = path.join(os.homedir(), '.claude-code', 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    if (config.apiKey) return config.apiKey;
  } catch {
    // Config not found or invalid
  }

  return null;
}

/**
 * Get base URL from environment or config
 */
async function getBaseUrl(): Promise<string> {
  if (process.env.CLAUDE_BASE_URL) return process.env.CLAUDE_BASE_URL;
  if (process.env.ANTHROPIC_BASE_URL) return process.env.ANTHROPIC_BASE_URL;

  const configPath = path.join(os.homedir(), '.claude-code', 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    if (config.baseUrl) return config.baseUrl;
  } catch {
    // Config not found or invalid
  }

  return DEFAULT_ENDPOINTS.anthropic;
}

/**
 * Check if API key format is valid
 */
export class ApiKeyFormatCheck implements DiagnosticCheck {
  name = 'api-key-format';
  description = 'Check API key format is valid';
  category: DiagnosticCategory = 'api';

  async run(): Promise<DiagnosticResult> {
    const apiKey = await getApiKey();

    if (!apiKey) {
      return {
        check: this.name,
        status: 'fail',
        message: 'No API key found',
        suggestion: 'Set ANTHROPIC_API_KEY environment variable or add to config',
      };
    }

    // Check Anthropic key format (starts with sk-ant-)
    if (apiKey.startsWith('sk-ant-')) {
      return {
        check: this.name,
        status: 'pass',
        message: 'API key has valid Anthropic format',
        details: `Key prefix: sk-ant-****`,
      };
    }

    // Check OpenAI key format (starts with sk-)
    if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-ant-')) {
      return {
        check: this.name,
        status: 'pass',
        message: 'API key has valid OpenAI format',
        details: 'Key prefix: sk-****',
      };
    }

    // Unknown format - might still be valid for custom providers
    return {
      check: this.name,
      status: 'warn',
      message: 'API key format not recognized',
      details: 'Key does not match known provider formats',
      suggestion: 'Verify the API key is correct for your provider',
    };
  }
}

/**
 * Check API endpoint is reachable
 */
export class ApiEndpointCheck implements DiagnosticCheck {
  name = 'api-endpoint';
  description = 'Check API endpoint is reachable';
  category: DiagnosticCategory = 'api';

  async run(): Promise<DiagnosticResult> {
    const baseUrl = await getBaseUrl();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const startTime = Date.now();
      const response = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      const latency = Date.now() - startTime;

      clearTimeout(timeout);

      // API endpoints typically return 401/403 without auth, or 404 for base URL
      // This is fine - we just want to verify connectivity
      if (response.status < 500) {
        return {
          check: this.name,
          status: 'pass',
          message: 'API endpoint is reachable',
          details: `URL: ${baseUrl}, Latency: ${latency}ms, Status: ${response.status}`,
        };
      }

      return {
        check: this.name,
        status: 'warn',
        message: 'API endpoint returned server error',
        details: `URL: ${baseUrl}, Status: ${response.status}`,
        suggestion: 'The API service may be experiencing issues',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          check: this.name,
          status: 'fail',
          message: 'API endpoint connection timed out',
          details: `URL: ${baseUrl}`,
          suggestion: 'Check your internet connection or firewall settings',
        };
      }

      return {
        check: this.name,
        status: 'fail',
        message: 'Failed to connect to API endpoint',
        details: `URL: ${baseUrl}, Error: ${error instanceof Error ? error.message : String(error)}`,
        suggestion: 'Check your internet connection and endpoint URL',
      };
    }
  }
}

/**
 * Check API authentication
 */
export class ApiAuthCheck implements DiagnosticCheck {
  name = 'api-auth';
  description = 'Check API authentication works';
  category: DiagnosticCategory = 'api';

  async run(): Promise<DiagnosticResult> {
    const apiKey = await getApiKey();
    const baseUrl = await getBaseUrl();

    if (!apiKey) {
      return {
        check: this.name,
        status: 'skip',
        message: 'Skipping auth check - no API key configured',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Try to hit a lightweight endpoint to verify auth
      const endpoint = baseUrl.includes('anthropic')
        ? `${baseUrl}/v1/models`
        : `${baseUrl}/v1/models`;

      const startTime = Date.now();
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
      });
      const latency = Date.now() - startTime;

      clearTimeout(timeout);

      if (response.ok) {
        return {
          check: this.name,
          status: 'pass',
          message: 'API authentication successful',
          details: `Latency: ${latency}ms`,
        };
      }

      if (response.status === 401) {
        return {
          check: this.name,
          status: 'fail',
          message: 'API authentication failed - invalid key',
          details: `Status: ${response.status}`,
          suggestion: 'Verify your API key is correct and active',
        };
      }

      if (response.status === 403) {
        return {
          check: this.name,
          status: 'fail',
          message: 'API access forbidden - insufficient permissions',
          details: `Status: ${response.status}`,
          suggestion: 'Check your API key permissions',
        };
      }

      if (response.status === 429) {
        return {
          check: this.name,
          status: 'warn',
          message: 'API rate limit reached',
          details: `Status: ${response.status}`,
          suggestion: 'Wait and try again, or check your rate limits',
        };
      }

      return {
        check: this.name,
        status: 'warn',
        message: `Unexpected API response`,
        details: `Status: ${response.status}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          check: this.name,
          status: 'fail',
          message: 'API authentication request timed out',
          suggestion: 'Check your internet connection',
        };
      }

      return {
        check: this.name,
        status: 'fail',
        message: 'API authentication check failed',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Check model availability
 */
export class ModelAvailabilityCheck implements DiagnosticCheck {
  name = 'model-availability';
  description = 'Check configured model is available';
  category: DiagnosticCategory = 'api';

  async run(): Promise<DiagnosticResult> {
    // Get configured model
    let model: string | null = null;

    if (process.env.CLAUDE_MODEL) {
      model = process.env.CLAUDE_MODEL;
    } else {
      const configPath = path.join(os.homedir(), '.claude-code', 'config.json');
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        if (config.model) model = config.model;
      } catch {
        // Config not found
      }
    }

    if (!model) {
      return {
        check: this.name,
        status: 'pass',
        message: 'No specific model configured (using default)',
      };
    }

    // Check if model is in known list
    const allModels = [
      ...AVAILABLE_MODELS.anthropic,
      ...AVAILABLE_MODELS.openai,
    ];

    if (allModels.some((m) => model!.includes(m) || m.includes(model!))) {
      return {
        check: this.name,
        status: 'pass',
        message: `Model "${model}" is recognized`,
      };
    }

    return {
      check: this.name,
      status: 'warn',
      message: `Model "${model}" is not in the known models list`,
      details: 'This may be a new or custom model',
      suggestion: 'Verify the model name is correct',
    };
  }
}

/**
 * Check API usage/quota (informational)
 */
export class ApiQuotaCheck implements DiagnosticCheck {
  name = 'api-quota';
  description = 'Check API usage information';
  category: DiagnosticCategory = 'api';

  async run(): Promise<DiagnosticResult> {
    // This would require actual API calls to check quota
    // For now, just report that quota checking is not implemented
    return {
      check: this.name,
      status: 'pass',
      message: 'API quota check not implemented',
      details: 'Visit your provider dashboard to check usage',
    };
  }
}

/**
 * All API checks combined
 */
export const apiChecks: DiagnosticCheck[] = [
  new ApiKeyFormatCheck(),
  new ApiEndpointCheck(),
  new ApiAuthCheck(),
  new ModelAvailabilityCheck(),
  new ApiQuotaCheck(),
];
