/**
 * TaskTool - Tool khoi chay subagent de lam viec
 *
 * Cho phep spawn cac agent con de xu ly cac task rieng biet.
 *
 * Dac diem:
 * - Ho tro nhieu loai subagent: Explore, Plan, general-purpose
 * - Tich hop voi swarm coordination (team_name, name)
 * - Moi agent co context rieng biet
 */

import type { ToolDefinition, ToolHandler, ExecutionContext } from './types';

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Loai subagent co san
 */
export type SubagentType = 'Explore' | 'Plan' | 'general-purpose';

/**
 * Tham so dau vao cho TaskTool
 */
export interface TaskToolInput {
  /** Mo ta ngan gon ve task */
  description: string;
  /** Prompt chi tiet gui cho agent */
  prompt: string;
  /** Loai subagent su dung */
  subagentType?: SubagentType;
  /** Ten team (cho swarm mode) */
  teamName?: string;
  /** Ten cho teammate */
  name?: string;
  /** Model su dung cho subagent */
  model?: string;
  /** Timeout cho task (ms) */
  timeout?: number;
}

/**
 * Trang thai cua task
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Ket qua tra ve tu TaskTool
 */
export interface TaskToolOutput {
  /** ID cua task */
  taskId: string;
  /** Trang thai hien tai */
  status: TaskStatus;
  /** Ket qua tu subagent (neu hoan thanh) */
  result?: string;
  /** Loi (neu that bai) */
  error?: string;
  /** Thoi gian thuc thi (ms) */
  executionTime?: number;
  /** Thong tin ve subagent */
  agentInfo?: {
    type: SubagentType;
    name?: string;
    teamName?: string;
  };
}

// ============================================================================
// Constants - Cac hang so
// ============================================================================

/** Timeout mac dinh cho task: 5 phut */
const DEFAULT_TASK_TIMEOUT_MS = 300000;

/** Timeout toi da cho task: 30 phut */
const MAX_TASK_TIMEOUT_MS = 1800000;

/** Cac model khuyen nghi theo loai subagent */
export const RECOMMENDED_MODELS: Record<SubagentType, string> = {
  'Explore': 'claude-sonnet-4-5-20250929',
  'Plan': 'claude-opus-4-5-20251101',
  'general-purpose': 'claude-sonnet-4-5-20250929',
};

/** Mo ta cho moi loai subagent */
export const SUBAGENT_DESCRIPTIONS: Record<SubagentType, string> = {
  'Explore': 'Agent chuyen khao sat va kham pha codebase',
  'Plan': 'Agent lap ke hoach va phan tich',
  'general-purpose': 'Agent da nang xu ly nhieu loai task',
};

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Dinh nghia cua TaskTool
 */
export const taskToolDefinition: ToolDefinition = {
  name: 'Task',
  description: 'Launch a new agent to work on a task',
  category: 'agent',
  requiresConfirmation: false,
  parameters: {
    description: {
      type: 'string',
      description: 'A short description of the task',
      required: true,
    },
    prompt: {
      type: 'string',
      description: 'The prompt to send to the agent',
      required: true,
    },
    subagent_type: {
      type: 'string',
      description: 'Type of subagent to use: Explore, Plan, or general-purpose',
      required: false,
      enum: ['Explore', 'Plan', 'general-purpose'],
    },
    team_name: {
      type: 'string',
      description: 'Name of the team for swarm coordination',
      required: false,
    },
    name: {
      type: 'string',
      description: 'Name for the teammate',
      required: false,
    },
    model: {
      type: 'string',
      description: 'Model to use for the subagent',
      required: false,
    },
    timeout: {
      type: 'number',
      description: 'Timeout for the task in milliseconds',
      required: false,
      default: DEFAULT_TASK_TIMEOUT_MS,
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Tao unique task ID
 * @returns Task ID string
 */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `task-${timestamp}-${random}`;
}

/**
 * Lay model khuyen nghi cho subagent type
 * @param subagentType - Loai subagent
 * @returns Model ID
 */
export function getRecommendedModel(subagentType: SubagentType): string {
  return RECOMMENDED_MODELS[subagentType];
}

/**
 * Validate input cho TaskTool
 * @param input - Input can validate
 * @returns true neu hop le, string neu co loi
 */
export function validateTaskInput(input: TaskToolInput): boolean | string {
  // Kiem tra description bat buoc
  if (!input.description || typeof input.description !== 'string') {
    return 'description is required and must be a string';
  }

  // Kiem tra description khong qua ngan
  if (input.description.trim().length < 5) {
    return 'description should be at least 5 characters';
  }

  // Kiem tra prompt bat buoc
  if (!input.prompt || typeof input.prompt !== 'string') {
    return 'prompt is required and must be a string';
  }

  // Kiem tra prompt khong rong
  if (input.prompt.trim().length === 0) {
    return 'prompt cannot be empty';
  }

  // Kiem tra subagent_type hop le
  if (input.subagentType !== undefined) {
    const validTypes: SubagentType[] = ['Explore', 'Plan', 'general-purpose'];
    if (!validTypes.includes(input.subagentType)) {
      return `subagent_type must be one of: ${validTypes.join(', ')}`;
    }
  }

  // Kiem tra timeout hop le
  if (input.timeout !== undefined) {
    if (typeof input.timeout !== 'number' || input.timeout <= 0) {
      return 'timeout must be a positive number';
    }
    if (input.timeout > MAX_TASK_TIMEOUT_MS) {
      return `timeout cannot exceed ${MAX_TASK_TIMEOUT_MS}ms (30 minutes)`;
    }
  }

  // Kiem tra swarm mode
  if (input.teamName && !input.name) {
    return 'name is required when team_name is specified';
  }

  return true;
}

// ============================================================================
// Task Manager
// ============================================================================

/**
 * Interface quan ly cac tasks
 */
export interface TaskManager {
  /** Map task ID -> task info */
  tasks: Map<string, TaskInfo>;
  /** Tao task moi */
  createTask(input: TaskToolInput): TaskInfo;
  /** Lay thong tin task */
  getTask(taskId: string): TaskInfo | undefined;
  /** Cap nhat trang thai task */
  updateTaskStatus(taskId: string, status: TaskStatus, result?: string, error?: string): void;
  /** Huy task */
  cancelTask(taskId: string): boolean;
}

/**
 * Thong tin day du ve mot task
 */
export interface TaskInfo {
  id: string;
  description: string;
  prompt: string;
  subagentType: SubagentType;
  model: string;
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
  teamName?: string;
  agentName?: string;
  timeout: number;
}

/**
 * Tao TaskManager instance
 * @returns TaskManager
 */
export function createTaskManager(): TaskManager {
  const tasks = new Map<string, TaskInfo>();

  return {
    tasks,

    createTask(input: TaskToolInput): TaskInfo {
      const id = generateTaskId();
      const subagentType = input.subagentType ?? 'general-purpose';
      const model = input.model ?? getRecommendedModel(subagentType);

      const task: TaskInfo = {
        id,
        description: input.description,
        prompt: input.prompt,
        subagentType,
        model,
        status: 'pending',
        createdAt: new Date(),
        teamName: input.teamName,
        agentName: input.name,
        timeout: input.timeout ?? DEFAULT_TASK_TIMEOUT_MS,
      };

      tasks.set(id, task);
      return task;
    },

    getTask(taskId: string): TaskInfo | undefined {
      return tasks.get(taskId);
    },

    updateTaskStatus(taskId: string, status: TaskStatus, result?: string, error?: string): void {
      const task = tasks.get(taskId);
      if (!task) return;

      task.status = status;

      if (status === 'running' && !task.startedAt) {
        task.startedAt = new Date();
      }

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        task.completedAt = new Date();
        if (result) task.result = result;
        if (error) task.error = error;
      }
    },

    cancelTask(taskId: string): boolean {
      const task = tasks.get(taskId);
      if (!task || task.status === 'completed' || task.status === 'failed') {
        return false;
      }

      task.status = 'cancelled';
      task.completedAt = new Date();
      return true;
    },
  };
}

// ============================================================================
// Tool Handler Implementation
// ============================================================================

/**
 * Tao TaskTool handler
 * @param context - Execution context
 * @returns Tool handler instance
 */
export function createTaskToolHandler(context: ExecutionContext): ToolHandler<TaskToolInput, TaskToolOutput> {
  const taskManager = createTaskManager();

  return {
    name: 'Task',
    definition: taskToolDefinition,

    validateInput(input: TaskToolInput): boolean | string {
      return validateTaskInput(input);
    },

    async execute(input: TaskToolInput, ctx: ExecutionContext): Promise<TaskToolOutput> {
      // Tao task moi
      const task = taskManager.createTask(input);

      // Cap nhat trang thai running
      taskManager.updateTaskStatus(task.id, 'running');

      const startTime = Date.now();

      try {
        // NOTE: Day la placeholder implementation
        // Trong thuc te, can:
        // 1. Spawn subagent process
        // 2. Gui prompt cho subagent
        // 3. Cho ket qua hoac timeout
        // 4. Xu ly communication qua swarm system

        // Simulate task execution
        const result = await simulateTaskExecution(task);

        const executionTime = Date.now() - startTime;
        taskManager.updateTaskStatus(task.id, 'completed', result);

        return {
          taskId: task.id,
          status: 'completed',
          result,
          executionTime,
          agentInfo: {
            type: task.subagentType,
            name: task.agentName,
            teamName: task.teamName,
          },
        };

      } catch (error: unknown) {
        const err = error as Error;
        const executionTime = Date.now() - startTime;

        taskManager.updateTaskStatus(task.id, 'failed', undefined, err.message);

        return {
          taskId: task.id,
          status: 'failed',
          error: err.message,
          executionTime,
          agentInfo: {
            type: task.subagentType,
            name: task.agentName,
            teamName: task.teamName,
          },
        };
      }
    },
  };
}

/**
 * Simulate task execution (placeholder)
 * Trong thuc te se spawn real subagent
 */
async function simulateTaskExecution(task: TaskInfo): Promise<string> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 100));

  return `[${task.subagentType} Agent] Processed task: ${task.description}\n\nPrompt received:\n${task.prompt.substring(0, 200)}...`;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  definition: taskToolDefinition,
  createHandler: createTaskToolHandler,
  validateInput: validateTaskInput,
  generateTaskId,
  getRecommendedModel,
  createTaskManager,
  RECOMMENDED_MODELS,
  SUBAGENT_DESCRIPTIONS,
};
