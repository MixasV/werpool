import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import {
  MarketState as PrismaMarketState,
  Prisma,
  SchedulerTask as PrismaSchedulerTask,
  SchedulerTaskStatus as PrismaSchedulerTaskStatus,
  SchedulerTaskType as PrismaSchedulerTaskType,
  WorkflowActionStatus as PrismaWorkflowActionStatus,
  WorkflowActionType as PrismaWorkflowActionType,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PointsService } from "../points/points.service";
import { SchedulerTaskDto, TaskExecutionResult } from "./dto/scheduler-task.dto";

interface ListTasksParams {
  status?: PrismaSchedulerTaskStatus;
  type?: PrismaSchedulerTaskType;
  marketId?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureNextLeaderboardSnapshot(new Date());
    } catch (error) {
      this.logger.warn(
        `Failed to seed leaderboard snapshot task: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listTasks(params: ListTasksParams = {}): Promise<SchedulerTaskDto[]> {
    const { status, type, marketId, cursor, limit = 50 } = params;
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);

    const where: Prisma.SchedulerTaskWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }
    if (marketId) {
      where.marketId = marketId;
    }

    const tasks = await this.prisma.schedulerTask.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
      take: normalizedLimit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return tasks.map((task) => this.toDto(task));
  }

  async getTask(id: string): Promise<SchedulerTaskDto> {
    const task = await this.prisma.schedulerTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Scheduler task ${id} not found`);
    }
    return this.toDto(task);
  }

  async createTask(
    data: Omit<Prisma.SchedulerTaskUncheckedCreateInput, "status" | "attempts" | "id">,
    creator?: string
  ): Promise<SchedulerTaskDto> {
    const task = await this.prisma.schedulerTask.create({
      data: {
        ...data,
        status: PrismaSchedulerTaskStatus.PENDING,
        attempts: 0,
        createdBy: creator ?? data.createdBy ?? undefined,
      },
    });

    return this.toDto(task);
  }

  async updateTask(
    id: string,
    data: Prisma.SchedulerTaskUpdateInput
  ): Promise<SchedulerTaskDto> {
    const task = await this.prisma.schedulerTask.update({ where: { id }, data });
    return this.toDto(task);
  }

  async runTask(id: string): Promise<TaskExecutionResult> {
    const now = new Date();
    const task = await this.prisma.schedulerTask.update({
      where: { id },
      data: {
        status: PrismaSchedulerTaskStatus.IN_PROGRESS,
        lastAttemptAt: now,
        attempts: { increment: 1 },
      },
    });

    try {
      const effect = await this.executeTask(task);
      const completed = await this.prisma.schedulerTask.update({
        where: { id },
        data: {
          status: PrismaSchedulerTaskStatus.COMPLETED,
          completedAt: new Date(),
          lastError: null,
        },
      });

      return {
        task: this.toDto(completed),
        effect,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.schedulerTask.update({
        where: { id },
        data: {
          status: PrismaSchedulerTaskStatus.FAILED,
          lastError: message,
        },
      });
      this.logger.error(`Failed to execute scheduler task ${id}: ${message}`);
      throw error;
    }
  }

  async runDueTasks(limit = 10): Promise<TaskExecutionResult[]> {
    const now = new Date();
    const normalizedLimit = Math.min(Math.max(limit, 1), 25);

    const dueTasks = await this.prisma.schedulerTask.findMany({
      where: {
        status: PrismaSchedulerTaskStatus.PENDING,
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: "asc" },
      take: normalizedLimit,
    });

    const results: TaskExecutionResult[] = [];
    for (const task of dueTasks) {
      try {
        const result = await this.runTask(task.id);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `runDueTasks: task ${task.id} failed with error: ${error instanceof Error ? error.message : error}`
        );
      }
    }
    return results;
  }

  private toDto(task: PrismaSchedulerTask): SchedulerTaskDto {
    return {
      id: task.id,
      marketId: task.marketId ?? undefined,
      type: task.type,
      status: task.status,
      scheduledFor: task.scheduledFor.toISOString(),
      description: task.description ?? undefined,
      payload: (task.payload as Record<string, unknown> | null) ?? null,
      attempts: task.attempts,
      lastError: task.lastError ?? undefined,
      lastAttemptAt: task.lastAttemptAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      createdBy: task.createdBy ?? undefined,
    };
  }

  private async executeTask(task: PrismaSchedulerTask): Promise<TaskExecutionResult["effect"]> {
    if (task.type === PrismaSchedulerTaskType.LEADERBOARD_SNAPSHOT) {
      const snapshot = await this.pointsService.captureLeaderboardSnapshot();
      await this.ensureNextLeaderboardSnapshot(task.scheduledFor, task.createdBy ?? undefined);
      return {
        notes: task.description ?? "Leaderboard snapshot captured",
        leaderboardSnapshot: snapshot,
      };
    }

    if (!task.marketId) {
      return { notes: "task has no associated market" };
    }

    const market = await this.prisma.market.findUnique({ where: { id: task.marketId } });
    if (!market) {
      this.logger.warn(`Scheduler task ${task.id} refers to missing market ${task.marketId}`);
      return {
        marketId: task.marketId,
        notes: "market not found",
      };
    }

    const now = new Date();
    const metadata: Prisma.JsonObject = {
      schedulerTaskId: task.id,
      executedAt: now.toISOString(),
      scheduledFor: task.scheduledFor.toISOString(),
    };

    let stateChangedTo: PrismaMarketState | undefined;
    let workflowType: PrismaWorkflowActionType = PrismaWorkflowActionType.CUSTOM;
    let workflowDescription = task.description ?? `Scheduler executed ${task.type}`;

    switch (task.type) {
      case PrismaSchedulerTaskType.MARKET_OPEN: {
        stateChangedTo = PrismaMarketState.LIVE;
        workflowType = PrismaWorkflowActionType.OPEN;
        if (!task.description) {
          workflowDescription = "Scheduler opened market";
        }
        break;
      }
      case PrismaSchedulerTaskType.MARKET_LOCK: {
        const lockAt =
          task.payload && typeof task.payload === "object" && "lockAt" in task.payload
            ? new Date(String((task.payload as Record<string, unknown>).lockAt))
            : task.scheduledFor;
        await this.prisma.market.update({
          where: { id: market.id },
          data: {
            tradingLockAt: lockAt,
          },
        });
        metadata.lockAt = lockAt.toISOString();
        if (!task.description) {
          workflowDescription = "Scheduler applied trading lock";
        }
        workflowType = PrismaWorkflowActionType.CUSTOM;
        break;
      }
      case PrismaSchedulerTaskType.MARKET_CLOSE: {
        stateChangedTo = PrismaMarketState.CLOSED;
        if (!task.description) {
          workflowDescription = "Scheduler closed market";
        }
        break;
      }
      case PrismaSchedulerTaskType.MARKET_SETTLE: {
        stateChangedTo = PrismaMarketState.SETTLED;
        workflowType = PrismaWorkflowActionType.SETTLE;
        if (!task.description) {
          workflowDescription = "Scheduler settled market";
        }
        break;
      }
      case PrismaSchedulerTaskType.PATROL_SCAN: {
        if (!task.description) {
          workflowDescription = "Scheduler patrol scan executed";
        }
        break;
      }
      case PrismaSchedulerTaskType.CUSTOM:
      default: {
        if (!task.description) {
          workflowDescription = task.payload && typeof task.payload === "object" && "description" in task.payload
            ? String((task.payload as Record<string, unknown>).description)
            : "Scheduler custom task executed";
        }
        break;
      }
    }

    if (stateChangedTo) {
      await this.prisma.market.update({
        where: { id: market.id },
        data: { state: stateChangedTo },
      });
    }

    await this.prisma.workflowAction.create({
      data: {
        marketId: market.id,
        type: workflowType,
        status: PrismaWorkflowActionStatus.EXECUTED,
        description: workflowDescription,
        triggersAt: task.scheduledFor,
        metadata,
      },
    });

    return {
      marketId: market.id,
      stateChangedTo: stateChangedTo ? stateChangedTo.toLowerCase() : undefined,
      workflowAction: workflowType.toLowerCase(),
      notes: workflowDescription,
    };
  }

  private async ensureNextLeaderboardSnapshot(
    baseline: Date,
    createdBy?: string
  ): Promise<void> {
    const now = new Date();
    const reference = baseline > now ? baseline : now;

    const existing = await this.prisma.schedulerTask.findFirst({
      where: {
        type: PrismaSchedulerTaskType.LEADERBOARD_SNAPSHOT,
        status: PrismaSchedulerTaskStatus.PENDING,
        scheduledFor: { gte: reference },
      },
    });

    if (existing) {
      return;
    }

    const next = new Date(reference);
    next.setMinutes(0, 0, 0);
    if (next <= reference) {
      next.setHours(next.getHours() + 1);
    }

    await this.createTask(
      {
        type: PrismaSchedulerTaskType.LEADERBOARD_SNAPSHOT,
        scheduledFor: next,
        description: "Авто-снимок лидерборда",
      },
      createdBy
    );
  }
}
