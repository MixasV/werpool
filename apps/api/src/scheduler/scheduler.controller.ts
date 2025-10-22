import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  Prisma,
  SchedulerTaskStatus,
  SchedulerTaskType,
} from "@prisma/client";

import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";
import type { FlowSessionPayload } from "../auth/flow-auth.service";
import { SchedulerService } from "./scheduler.service";
import { CreateSchedulerTaskDto } from "./dto/create-scheduler-task.dto";
import { UpdateSchedulerTaskDto } from "./dto/update-scheduler-task.dto";
import { RunDueTasksDto } from "./dto/run-due-tasks.dto";
import { SchedulerTaskDto, TaskExecutionResult } from "./dto/scheduler-task.dto";
import { serializeJsonInput } from "../common/prisma-json.util";

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

const toSchedulerStatus = (value?: string | null): SchedulerTaskStatus | undefined => {
  if (!value) {
    return undefined;
  }
  const upper = value.toUpperCase();
  return (Object.values(SchedulerTaskStatus) as string[]).includes(upper)
    ? (upper as SchedulerTaskStatus)
    : undefined;
};

const toSchedulerType = (value?: string | null): SchedulerTaskType | undefined => {
  if (!value) {
    return undefined;
  }
  const upper = value.toUpperCase();
  return (Object.values(SchedulerTaskType) as string[]).includes(upper)
    ? (upper as SchedulerTaskType)
    : undefined;
};

@Controller("scheduler")
@UseGuards(FlowOrApiGuard)
@RequireFlowRoles("ADMIN")
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get("tasks")
  async listTasks(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("marketId") marketId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ): Promise<SchedulerTaskDto[]> {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.schedulerService.listTasks({
      status: toSchedulerStatus(status),
      type: toSchedulerType(type),
      marketId: marketId ?? undefined,
      cursor: cursor ?? undefined,
      limit:
        parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.floor(parsedLimit)
          : undefined,
    });
  }

  @Get("tasks/:id")
  async getTask(@Param("id") id: string): Promise<SchedulerTaskDto> {
    return this.schedulerService.getTask(id);
  }

  @Post("tasks")
  async createTask(
    @Body() body: CreateSchedulerTaskDto,
    @Req() request: RequestWithSession
  ): Promise<SchedulerTaskDto> {
    const scheduledFor = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException("scheduledFor must be a valid ISO timestamp");
    }

    const createInput: Prisma.SchedulerTaskUncheckedCreateInput = {
      type: body.type,
      scheduledFor,
      payload: serializeJsonInput(body.payload ?? undefined) ?? null,
      description: body.description ?? undefined,
      createdBy: request.flowSession?.address ?? undefined,
      marketId: body.marketId ?? undefined,
    };

    return this.schedulerService.createTask(createInput, request.flowSession?.address);
  }

  @Patch("tasks/:id")
  async updateTask(
    @Param("id") id: string,
    @Body() body: UpdateSchedulerTaskDto
  ): Promise<SchedulerTaskDto> {
    const data: Prisma.SchedulerTaskUpdateInput = {};

    if (body.status) {
      data.status = body.status;
    }
    if (body.scheduledFor) {
      const scheduledFor = new Date(body.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        throw new BadRequestException("scheduledFor must be a valid ISO timestamp");
      }
      data.scheduledFor = scheduledFor;
    }
    if (body.payload !== undefined) {
      data.payload = serializeJsonInput(body.payload ?? undefined);
    }
    if (body.description !== undefined) {
      data.description = body.description;
    }
    if (body.marketId) {
      data.market = { connect: { id: body.marketId } };
    }

    return this.schedulerService.updateTask(id, data);
  }

  @Post("tasks/:id/run")
  async runTask(@Param("id") id: string): Promise<TaskExecutionResult> {
    return this.schedulerService.runTask(id);
  }

  @Post("run-due")
  async runDueTasks(@Body() body: RunDueTasksDto): Promise<TaskExecutionResult[]> {
    const limit = body.limit ?? undefined;
    return this.schedulerService.runDueTasks(limit);
  }
}
