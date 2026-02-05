/**
 * ExitPlanMode Tool
 *
 * Tool để exit plan mode sau khi đã hoàn thành việc lên kế hoạch.
 * Present plan cho user review và approval trước khi implement.
 *
 * Features:
 * - Đọc plan từ file đã viết
 * - Submit plan cho approval
 * - Hỗ trợ teammate workflow với plan_approval_request
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Prompt-based permission cần cho plan
 */
export interface AllowedPrompt {
  /** Tool mà permission áp dụng */
  tool: 'Bash';
  /** Mô tả semantic của action (ví dụ: "run tests", "install dependencies") */
  prompt: string;
}

/**
 * Input của ExitPlanMode tool
 */
export interface ExitPlanModeInput {
  /** Danh sách permissions cần để implement plan */
  allowedPrompts?: AllowedPrompt[];
  /** Push plan to remote session */
  pushToRemote?: boolean;
  /** Remote session ID nếu push to remote */
  remoteSessionId?: string;
  /** Remote session URL */
  remoteSessionUrl?: string;
  /** Remote session title */
  remoteSessionTitle?: string;
}

/**
 * Output của ExitPlanMode tool
 */
export interface ExitPlanModeOutput {
  /** Plan content (đọc từ file hoặc null) */
  plan: string | null;
  /** Có phải agent context không */
  isAgent: boolean;
  /** File path của plan */
  filePath?: string;
  /** Có push to remote không */
  pushToRemote?: boolean;
  /** Remote session ID */
  remoteSessionId?: string;
  /** Remote session URL */
  remoteSessionUrl?: string;
  /** Có Task tool available không */
  hasTaskTool?: boolean;
  /** Đang chờ leader approval (cho teammates) */
  awaitingLeaderApproval?: boolean;
  /** Request ID cho plan approval */
  requestId?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Description của ExitPlanMode tool
 */
const EXIT_PLAN_MODE_DESCRIPTION = `Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to the plan file
- This tool does NOT take the plan content as a parameter - it will read the plan from the file you wrote
- This tool signals that you're done planning and ready for user review
- The user will see your plan when they review it

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning implementation steps for a task that requires writing code.
For research tasks (gathering information, searching files, reading files) - do NOT use this tool.

## Before Using This Tool
Ensure your plan is complete and unambiguous:
- If you have unresolved questions, use AskUserQuestion first
- Once your plan is finalized, use THIS tool to request approval

**Important:** Do NOT use AskUserQuestion to ask "Is this plan okay?" - that's exactly what THIS tool does.`;

/**
 * Prompt instructions cho ExitPlanMode
 */
const EXIT_PLAN_MODE_PROMPT = `## Examples

1. Task: "Search for and understand the implementation of vim mode"
   - Do NOT use ExitPlanMode - this is a research task, not implementation planning

2. Task: "Help me implement yank mode for vim"
   - Use ExitPlanMode after planning the implementation steps

3. Task: "Add a new feature for user authentication"
   - If unsure about auth method, use AskUserQuestion first
   - Then use ExitPlanMode after clarifying the approach`;

/**
 * Definition của ExitPlanMode tool cho API
 */
export const exitPlanModeToolDefinition: ToolDefinition = {
  name: 'ExitPlanMode',
  description: EXIT_PLAN_MODE_DESCRIPTION,
  category: 'utility',
  requiresConfirmation: true, // Yêu cầu user approval
  parameters: {
    allowedPrompts: {
      type: 'array',
      description: 'Prompt-based permissions needed to implement the plan',
      required: false,
    },
    pushToRemote: {
      type: 'boolean',
      description: 'Whether to push the plan to a remote Claude.ai session',
      required: false,
    },
    remoteSessionId: {
      type: 'string',
      description: 'The remote session ID if pushed to remote',
      required: false,
    },
    remoteSessionUrl: {
      type: 'string',
      description: 'The remote session URL if pushed to remote',
      required: false,
    },
    remoteSessionTitle: {
      type: 'string',
      description: 'The remote session title if pushed to remote',
      required: false,
    },
  },
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate input của ExitPlanMode tool
 * @param input - Input cần validate
 * @returns true nếu valid, error message nếu invalid
 */
export function validateExitPlanModeInput(
  input: unknown
): boolean | string {
  if (input !== undefined && input !== null && typeof input !== 'object') {
    return 'Input must be an object or empty';
  }

  const inp = input as Record<string, unknown> | undefined;

  // Validate allowedPrompts nếu có
  if (inp?.allowedPrompts !== undefined) {
    if (!Array.isArray(inp.allowedPrompts)) {
      return 'allowedPrompts must be an array';
    }

    for (let i = 0; i < inp.allowedPrompts.length; i++) {
      const prompt = inp.allowedPrompts[i] as Record<string, unknown>;
      if (prompt.tool !== 'Bash') {
        return `allowedPrompts[${i}].tool must be "Bash"`;
      }
      if (typeof prompt.prompt !== 'string') {
        return `allowedPrompts[${i}].prompt must be a string`;
      }
    }
  }

  return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Đường dẫn mặc định cho plan file
 * @param sessionId - Session ID
 * @returns Path to plan file
 */
export function getPlanFilePath(sessionId: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(homeDir, '.claude', 'plans', `${sessionId}.md`);
}

/**
 * Đọc plan content từ file
 * @param filePath - Path to plan file
 * @returns Plan content hoặc null
 */
export async function readPlanFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Kiểm tra plan file có tồn tại không
 * @param filePath - Path to plan file
 * @returns true nếu tồn tại
 */
export async function planFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Plan Mode State (shared with EnterPlanMode)
// ============================================================================

// Import plan mode state management
import { setPlanMode, isInPlanMode } from './EnterPlanModeTool';

// ============================================================================
// Handler
// ============================================================================

/**
 * Tạo handler cho ExitPlanMode tool
 * @param context - Execution context
 * @returns Tool handler
 */
export function createExitPlanModeToolHandler(
  context: ExecutionContext
): ToolHandler<ExitPlanModeInput, ExitPlanModeOutput> {
  return {
    name: 'ExitPlanMode',
    definition: exitPlanModeToolDefinition,

    validateInput(input: unknown): boolean | string {
      return validateExitPlanModeInput(input);
    },

    async execute(
      input: ExitPlanModeInput,
      ctx: ExecutionContext
    ): Promise<ExitPlanModeOutput> {
      const sessionId = ctx.sessionId ?? 'default';
      const isAgent = !!ctx.userId; // Simplified agent check
      const planFilePath = getPlanFilePath(sessionId);

      // Đọc plan từ file
      const planContent = await readPlanFile(planFilePath);

      // Exit plan mode
      setPlanMode(sessionId, false);

      // Handle push to remote
      if (input.pushToRemote && input.remoteSessionId) {
        return {
          plan: planContent,
          isAgent,
          filePath: planFilePath,
          pushToRemote: true,
          remoteSessionId: input.remoteSessionId,
          remoteSessionUrl: input.remoteSessionUrl,
        };
      }

      return {
        plan: planContent,
        isAgent,
        filePath: planFilePath,
      };
    },
  };
}

/**
 * Tạo response message sau khi exit plan mode
 * @param output - Output từ tool
 * @returns Response message
 */
export function createExitPlanModeResponse(output: ExitPlanModeOutput): string {
  if (output.pushToRemote && output.remoteSessionId) {
    return 'Plan pushed to remote session. The URL is already displayed to the user, so do not repeat it.';
  }

  if (output.awaitingLeaderApproval) {
    return `Your plan has been submitted to the team lead for approval.

Plan file: ${output.filePath}

**What happens next:**
1. Wait for the team lead to review your plan
2. You will receive a message with approval/rejection
3. If approved, proceed with implementation
4. If rejected, refine your plan based on feedback

**Important:** Do NOT proceed until you receive approval.

Request ID: ${output.requestId}`;
  }

  if (output.isAgent) {
    return 'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"';
  }

  if (!output.plan || output.plan.trim() === '') {
    return 'User has approved exiting plan mode. You can now proceed.';
  }

  let response = `User has approved your plan. You can now start coding.

Your plan has been saved to: ${output.filePath}
You can refer back to it during implementation.`;

  if (output.hasTaskTool) {
    response += `

If this plan can be broken down into multiple independent tasks, consider using a team of teammates (via the Task tool with team_name) to parallelize the work.`;
  }

  response += `

## Approved Plan:
${output.plan}`;

  return response;
}

// ============================================================================
// Module Export
// ============================================================================

export default {
  definition: exitPlanModeToolDefinition,
  createHandler: createExitPlanModeToolHandler,
  validate: validateExitPlanModeInput,
  getPlanFilePath,
  readPlanFile,
  planFileExists,
  createExitPlanModeResponse,
  EXIT_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_PROMPT,
};
