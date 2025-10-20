import { API_BASE_URL, parseJson, withAuthHeaders, type AuthOptions } from "./api-client";

export type SchedulerTaskType =
  | "MARKET_OPEN"
  | "MARKET_LOCK"
  | "MARKET_CLOSE"
  | "MARKET_SETTLE"
  | "PATROL_SCAN"
  | "LEADERBOARD_SNAPSHOT"
  | "CUSTOM";

export type SchedulerTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface SchedulerTask {
  id: string;
  marketId?: string;
  type: SchedulerTaskType;
  status: SchedulerTaskStatus;
  scheduledFor: string;
  description?: string;
  payload?: Record<string, unknown> | null;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface TaskExecutionEffect {
  marketId?: string;
  stateChangedTo?: string;
  workflowAction?: string;
  notes?: string;
  leaderboardSnapshot?: {
    capturedAt: string;
    entries: Array<{
      address: string;
      total: number;
      rank: number;
    }>;
  };
}

export interface TaskExecutionResult {
  task: SchedulerTask;
  effect?: TaskExecutionEffect;
}

interface ListSchedulerTasksOptions {
  status?: SchedulerTaskStatus;
  type?: SchedulerTaskType;
  marketId?: string;
  cursor?: string;
  limit?: number;
  auth?: AuthOptions;
}

export const fetchSchedulerTasks = async (
  options: ListSchedulerTasksOptions = {}
): Promise<SchedulerTask[]> => {
  const query = new URLSearchParams();
  if (options.status) {
    query.set("status", options.status);
  }
  if (options.type) {
    query.set("type", options.type);
  }
  if (options.marketId) {
    query.set("marketId", options.marketId);
  }
  if (options.cursor) {
    query.set("cursor", options.cursor);
  }
  if (options.limit) {
    query.set("limit", String(options.limit));
  }

  const target = `${API_BASE_URL}/scheduler/tasks${query.size > 0 ? `?${query.toString()}` : ""}`;
  const response = await fetch(target, withAuthHeaders({}, options.auth));
  return parseJson<SchedulerTask[]>(response);
};

export const runSchedulerTask = async (
  taskId: string,
  options?: AuthOptions
): Promise<TaskExecutionResult> => {
  const response = await fetch(
    `${API_BASE_URL}/scheduler/tasks/${encodeURIComponent(taskId)}/run`,
    withAuthHeaders({ method: "POST" }, options)
  );
  return parseJson<TaskExecutionResult>(response);
};

export const runDueSchedulerTasks = async (
  limit?: number,
  options?: AuthOptions
): Promise<TaskExecutionResult[]> => {
  const response = await fetch(
    `${API_BASE_URL}/scheduler/run-due`,
    withAuthHeaders(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(limit ? { limit } : {}),
      },
      options
    )
  );
  return parseJson<TaskExecutionResult[]>(response);
};

interface CreateSchedulerTaskPayload {
  type: SchedulerTaskType;
  scheduledFor: string;
  marketId?: string;
  description?: string;
  payload?: Record<string, unknown> | null;
}

export const createSchedulerTask = async (
  payload: CreateSchedulerTaskPayload,
  options?: AuthOptions
): Promise<SchedulerTask> => {
  const response = await fetch(
    `${API_BASE_URL}/scheduler/tasks`,
    withAuthHeaders(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      options
    )
  );
  return parseJson<SchedulerTask>(response);
};

interface UpdateSchedulerTaskPayload {
  status?: SchedulerTaskStatus;
  scheduledFor?: string;
  description?: string;
  payload?: Record<string, unknown> | null;
  marketId?: string;
}

export const updateSchedulerTask = async (
  taskId: string,
  payload: UpdateSchedulerTaskPayload,
  options?: AuthOptions
): Promise<SchedulerTask> => {
  const response = await fetch(
    `${API_BASE_URL}/scheduler/tasks/${encodeURIComponent(taskId)}`,
    withAuthHeaders(
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      options
    )
  );
  return parseJson<SchedulerTask>(response);
};
