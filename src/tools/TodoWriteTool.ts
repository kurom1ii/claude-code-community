/**
 * TodoWrite Tool
 *
 * Tool để quản lý danh sách todo/task trong session.
 * Cho phép Claude theo dõi progress của các task đang thực hiện.
 *
 * Features:
 * - Track danh sách todos với các status: pending, in_progress, completed
 * - Mỗi todo có content, status và activeForm (mô tả action đang làm)
 * - Auto-cleanup khi tất cả todos completed
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Status của một todo item
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Một todo item
 */
export interface TodoItem {
  /** Nội dung của todo */
  content: string;
  /** Status hiện tại */
  status: TodoStatus;
  /** Mô tả action đang thực hiện (dạng -ing) */
  activeForm?: string;
}

/**
 * Input của TodoWrite tool
 */
export interface TodoWriteInput {
  /** Danh sách todos mới */
  todos: TodoItem[];
}

/**
 * Output của TodoWrite tool
 */
export interface TodoWriteOutput {
  /** Todos trước khi update */
  oldTodos: TodoItem[];
  /** Todos sau khi update */
  newTodos: TodoItem[];
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Definition của TodoWrite tool cho API
 */
export const todoWriteToolDefinition: ToolDefinition = {
  name: 'TodoWrite',
  description: `Use this tool to create and manage a todo list for tracking tasks. The todo list helps you:
- Track complex, multi-step tasks
- Show progress to the user
- Remember what needs to be done

IMPORTANT GUIDELINES:
- Only use for tasks with 3+ steps that need tracking
- Don't duplicate work tracked in other systems (like TaskList)
- When all items are completed, the list will auto-clear
- Use activeForm to describe current action (e.g., "Fixing the login bug")

WHEN TO USE:
- Complex refactoring with multiple files
- Multi-step debugging sessions
- Feature implementation with several components

WHEN NOT TO USE:
- Simple, single-step tasks
- Tasks already tracked elsewhere
- Quick file reads or searches`,
  category: 'utility',
  requiresConfirmation: false,
  parameters: {
    todos: {
      type: 'array',
      description: 'The updated todo list. Each item has content, status (pending/in_progress/completed), and optional activeForm.',
      required: true,
    },
  },
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Các status hợp lệ
 */
const VALID_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

/**
 * Validate input của TodoWrite tool
 * @param input - Input cần validate
 * @returns true nếu valid, error message nếu invalid
 */
export function validateTodoWriteInput(
  input: unknown
): boolean | string {
  if (!input || typeof input !== 'object') {
    return 'Input must be an object';
  }

  const inp = input as Record<string, unknown>;

  // Validate todos array
  if (!Array.isArray(inp.todos)) {
    return 'todos must be an array';
  }

  // Validate each todo item
  for (let i = 0; i < inp.todos.length; i++) {
    const todo = inp.todos[i] as Record<string, unknown>;

    if (!todo || typeof todo !== 'object') {
      return `Todo item ${i + 1} must be an object`;
    }

    if (typeof todo.content !== 'string' || todo.content.trim() === '') {
      return `Todo item ${i + 1}: content is required and must be a non-empty string`;
    }

    if (!VALID_STATUSES.includes(todo.status as TodoStatus)) {
      return `Todo item ${i + 1}: status must be one of: ${VALID_STATUSES.join(', ')}`;
    }

    if (todo.activeForm !== undefined && typeof todo.activeForm !== 'string') {
      return `Todo item ${i + 1}: activeForm must be a string if provided`;
    }
  }

  return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format todo list thành string để display
 * @param todos - Danh sách todos
 * @returns Formatted string
 */
export function formatTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return '(No todos)';
  }

  return todos
    .map((todo, index) => {
      const statusIcon = getStatusIcon(todo.status);
      const activeForm = todo.activeForm ? ` - ${todo.activeForm}` : '';
      return `${index + 1}. ${statusIcon} ${todo.content}${activeForm}`;
    })
    .join('\n');
}

/**
 * Lấy icon cho status
 * @param status - Status của todo
 * @returns Status icon
 */
export function getStatusIcon(status: TodoStatus): string {
  switch (status) {
    case 'pending':
      return '[ ]';
    case 'in_progress':
      return '[~]';
    case 'completed':
      return '[x]';
    default:
      return '[ ]';
  }
}

/**
 * Kiểm tra xem tất cả todos có completed không
 * @param todos - Danh sách todos
 * @returns true nếu tất cả completed
 */
export function allCompleted(todos: TodoItem[]): boolean {
  return todos.length > 0 && todos.every((todo) => todo.status === 'completed');
}

/**
 * Đếm số todos theo status
 * @param todos - Danh sách todos
 * @returns Object với count cho mỗi status
 */
export function countByStatus(todos: TodoItem[]): Record<TodoStatus, number> {
  return {
    pending: todos.filter((t) => t.status === 'pending').length,
    in_progress: todos.filter((t) => t.status === 'in_progress').length,
    completed: todos.filter((t) => t.status === 'completed').length,
  };
}

// ============================================================================
// Handler
// ============================================================================

// In-memory storage for todos (per session)
const todoStore: Map<string, TodoItem[]> = new Map();

/**
 * Tạo handler cho TodoWrite tool
 * @param context - Execution context
 * @returns Tool handler
 */
export function createTodoWriteToolHandler(
  context: ExecutionContext
): ToolHandler<TodoWriteInput, TodoWriteOutput> {
  return {
    name: 'TodoWrite',
    definition: todoWriteToolDefinition,

    validateInput(input: unknown): boolean | string {
      return validateTodoWriteInput(input);
    },

    async execute(
      input: TodoWriteInput,
      ctx: ExecutionContext
    ): Promise<TodoWriteOutput> {
      const sessionId = ctx.sessionId ?? 'default';

      // Lấy todos cũ
      const oldTodos = todoStore.get(sessionId) ?? [];

      // Xử lý todos mới
      // Nếu tất cả completed, clear list
      const newTodos = allCompleted(input.todos) ? [] : input.todos;

      // Lưu todos mới
      todoStore.set(sessionId, newTodos);

      return {
        oldTodos,
        newTodos: input.todos, // Trả về input gốc, không phải cleared list
      };
    },
  };
}

/**
 * Lấy todos hiện tại cho session
 * @param sessionId - Session ID
 * @returns Danh sách todos
 */
export function getTodos(sessionId: string): TodoItem[] {
  return todoStore.get(sessionId) ?? [];
}

/**
 * Clear todos cho session
 * @param sessionId - Session ID
 */
export function clearTodos(sessionId: string): void {
  todoStore.delete(sessionId);
}

// ============================================================================
// Module Export
// ============================================================================

export default {
  definition: todoWriteToolDefinition,
  createHandler: createTodoWriteToolHandler,
  validate: validateTodoWriteInput,
  formatTodoList,
  getStatusIcon,
  allCompleted,
  countByStatus,
  getTodos,
  clearTodos,
};
