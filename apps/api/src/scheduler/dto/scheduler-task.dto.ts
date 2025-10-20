import { SchedulerTaskStatus, SchedulerTaskType } from "@prisma/client";

export interface SchedulerTaskDto {
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

export interface LeaderboardSnapshotEffect {
  capturedAt: string;
  entries: Array<{
    address: string;
    total: number;
    rank: number;
  }>;
}

export interface TaskExecutionResult {
  task: SchedulerTaskDto;
  effect?: {
    marketId?: string;
    stateChangedTo?: string;
    workflowAction?: string;
    notes?: string;
    leaderboardSnapshot?: LeaderboardSnapshotEffect;
  };
}
