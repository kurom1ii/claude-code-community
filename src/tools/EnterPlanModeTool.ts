/**
 * EnterPlanMode Tool
 *
 * Tool để yêu cầu vào plan mode khi cần explore và thiết kế
 * implementation approach cho các task phức tạp.
 *
 * Trong plan mode:
 * - Claude explore codebase để hiểu patterns
 * - Thiết kế implementation strategy
 * - KHÔNG thực hiện file writes/edits
 * - Khi xong, dùng ExitPlanMode để present plan
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Input của EnterPlanMode tool (không có parameters)
 */
export interface EnterPlanModeInput {
  // No parameters required
}

/**
 * Output của EnterPlanMode tool
 */
export interface EnterPlanModeOutput {
  /** Message xác nhận đã enter plan mode */
  message: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Description của EnterPlanMode tool
 */
const ENTER_PLAN_MODE_DESCRIPTION = `Requests permission to enter plan mode for complex tasks requiring exploration and design.

Use this tool when you encounter a task that:
1. Requires understanding existing codebase patterns
2. Involves multiple files or components
3. Has architectural implications
4. Could benefit from upfront planning

In plan mode, you will:
- Explore the codebase thoroughly
- Identify similar features and patterns
- Design an implementation approach
- Use ExitPlanMode when ready to present your plan

IMPORTANT: This is a read-only exploration phase. Do NOT write or edit files in plan mode.`;

/**
 * Prompt instructions cho EnterPlanMode
 */
const ENTER_PLAN_MODE_PROMPT = `When you enter plan mode:

1. EXPLORE: Thoroughly explore the codebase
   - Find related files and features
   - Understand existing patterns and conventions
   - Identify dependencies and integration points

2. ANALYZE: Consider the task requirements
   - What are the key components needed?
   - What existing code can be reused?
   - What are potential challenges?

3. DESIGN: Create an implementation strategy
   - Outline the approach step by step
   - Identify files to create/modify
   - Consider edge cases and error handling

4. CLARIFY: If needed, use AskUserQuestion
   - Resolve ambiguities before finalizing plan
   - Get user input on approach decisions

5. PRESENT: Use ExitPlanMode when ready
   - Your plan will be presented for approval
   - Once approved, you can start implementation

Remember: Plan mode is READ-ONLY. No file modifications allowed until plan is approved.`;

/**
 * Definition của EnterPlanMode tool cho API
 */
export const enterPlanModeToolDefinition: ToolDefinition = {
  name: 'EnterPlanMode',
  description: ENTER_PLAN_MODE_DESCRIPTION,
  category: 'utility',
  requiresConfirmation: false,
  parameters: {
    // No parameters
  },
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate input của EnterPlanMode tool
 * @param input - Input cần validate
 * @returns true (luôn valid vì không có parameters)
 */
export function validateEnterPlanModeInput(
  input: unknown
): boolean | string {
  // EnterPlanMode không yêu cầu parameters
  return true;
}

// ============================================================================
// Handler
// ============================================================================

// Tracking plan mode state
const planModeState: Map<string, boolean> = new Map();

/**
 * Kiểm tra session có đang ở plan mode không
 * @param sessionId - Session ID
 * @returns true nếu đang ở plan mode
 */
export function isInPlanMode(sessionId: string): boolean {
  return planModeState.get(sessionId) ?? false;
}

/**
 * Set plan mode state
 * @param sessionId - Session ID
 * @param inPlanMode - Có ở plan mode không
 */
export function setPlanMode(sessionId: string, inPlanMode: boolean): void {
  planModeState.set(sessionId, inPlanMode);
}

/**
 * Tạo handler cho EnterPlanMode tool
 * @param context - Execution context
 * @returns Tool handler
 */
export function createEnterPlanModeToolHandler(
  context: ExecutionContext
): ToolHandler<EnterPlanModeInput, EnterPlanModeOutput> {
  return {
    name: 'EnterPlanMode',
    definition: enterPlanModeToolDefinition,

    validateInput(input: unknown): boolean | string {
      return validateEnterPlanModeInput(input);
    },

    async execute(
      _input: EnterPlanModeInput,
      ctx: ExecutionContext
    ): Promise<EnterPlanModeOutput> {
      const sessionId = ctx.sessionId ?? 'default';

      // Kiểm tra nếu đã ở plan mode
      if (isInPlanMode(sessionId)) {
        return {
          message: 'Already in plan mode. Continue exploring and designing your implementation approach.',
        };
      }

      // Enter plan mode
      setPlanMode(sessionId, true);

      return {
        message: 'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
      };
    },
  };
}

/**
 * Lấy response message khi enter plan mode thành công
 */
export function getPlanModeInstructions(): string {
  return `In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`;
}

// ============================================================================
// Module Export
// ============================================================================

export default {
  definition: enterPlanModeToolDefinition,
  createHandler: createEnterPlanModeToolHandler,
  validate: validateEnterPlanModeInput,
  isInPlanMode,
  setPlanMode,
  getPlanModeInstructions,
  ENTER_PLAN_MODE_DESCRIPTION,
  ENTER_PLAN_MODE_PROMPT,
};
