import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  WorkflowActionStatus,
  WorkflowActionType,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { WorkflowActionAdminDto } from "./dto/workflow-action.dto";
import { CreateWorkflowActionDto } from "./dto/create-workflow-action.dto";
import { UpdateWorkflowActionDto } from "./dto/update-workflow-action.dto";
import { PatrolSignalAdminDto } from "./dto/patrol-signal.dto";

interface WorkflowFilter {
  status?: string;
  type?: string;
  limit?: number;
  marketId?: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkflowActions(filter: WorkflowFilter = {}): Promise<WorkflowActionAdminDto[]> {
    const where: Prisma.WorkflowActionWhereInput = {};
    if (filter.status) {
      where.status = this.parseStatus(filter.status);
    }
    if (filter.type) {
      where.type = this.parseType(filter.type);
    }
    if (filter.marketId) {
      where.marketId = filter.marketId;
    }

    const limit = this.normalizeLimit(filter.limit, 100);

    const actions = await this.prisma.workflowAction.findMany({
      where,
      orderBy: [{ triggersAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        market: {
          select: {
            id: true,
            slug: true,
            title: true,
          },
        },
      },
    });

    return actions.map((action) => this.toWorkflowDto(action));
  }

  async createWorkflowAction(payload: CreateWorkflowActionDto): Promise<WorkflowActionAdminDto> {
    if (!payload.marketId || payload.marketId.trim().length === 0) {
      throw new BadRequestException("marketId обязателен");
    }

    const type = this.parseType(payload.type);
    const status = payload.status ? this.parseStatus(payload.status) : WorkflowActionStatus.PENDING;
    const triggersAt = payload.triggersAt ? this.parseDate(payload.triggersAt, "triggersAt") : null;

    await this.ensureMarketExists(payload.marketId);

    const action = await this.prisma.workflowAction.create({
      data: {
        marketId: payload.marketId,
        type,
        status,
        description: payload.description ?? "",
        triggersAt,
        metadata: this.toInputJson(payload.metadata),
      },
      include: {
        market: {
          select: { id: true, slug: true, title: true },
        },
      },
    });

    return this.toWorkflowDto(action);
  }

  async updateWorkflowAction(
    id: string,
    payload: UpdateWorkflowActionDto
  ): Promise<WorkflowActionAdminDto> {
    if (!id || id.trim().length === 0) {
      throw new BadRequestException("id обязателен");
    }

    const data: Prisma.WorkflowActionUpdateInput = {};

    if (payload.description !== undefined) {
      data.description = payload.description ?? "";
    }

    if (payload.status !== undefined) {
      data.status = this.parseStatus(payload.status);
    }

    if (payload.triggersAt !== undefined) {
      data.triggersAt = payload.triggersAt ? this.parseDate(payload.triggersAt, "triggersAt") : null;
    }

    if (payload.metadata !== undefined) {
      data.metadata = this.toInputJson(payload.metadata);
    }

    const updated = await this.prisma.workflowAction
      .update({
        where: { id },
        data,
        include: {
          market: { select: { id: true, slug: true, title: true } },
        },
      })
      .catch((error) => this.handleNotFound(error, id));

    return this.toWorkflowDto(updated);
  }

  async executeWorkflowAction(
    id: string,
    metadata: Record<string, unknown> | undefined
  ): Promise<WorkflowActionAdminDto> {
    const now = new Date().toISOString();
    const executionMetadata = {
      ...(metadata ?? {}),
      executedAt: now,
    };

    const updated = await this.prisma.workflowAction
      .update({
        where: { id },
        data: {
          status: WorkflowActionStatus.EXECUTED,
          metadata: this.toInputJson(executionMetadata),
        },
        include: {
          market: { select: { id: true, slug: true, title: true } },
        },
      })
      .catch((error) => this.handleNotFound(error, id));

    return this.toWorkflowDto(updated);
  }

  async deleteWorkflowAction(id: string): Promise<void> {
    try {
      await this.prisma.workflowAction.delete({ where: { id } });
    } catch (error) {
      this.handleNotFound(error, id);
    }
  }

  async listPatrolSignals(params: {
    marketId?: string;
    limit?: number;
  }): Promise<PatrolSignalAdminDto[]> {
    const where: Prisma.PatrolSignalWhereInput = {};
    if (params.marketId) {
      where.marketId = params.marketId;
    }

    const limit = this.normalizeLimit(params.limit, 100);

    const signals = await this.prisma.patrolSignal.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return signals.map((signal) => ({
      id: signal.id,
      marketId: signal.marketId,
      issuer: signal.issuer,
      severity: signal.severity.toLowerCase(),
      code: signal.code,
      weight: Number(signal.weight),
      notes: signal.notes ?? null,
      expiresAt: signal.expiresAt ? signal.expiresAt.toISOString() : null,
      createdAt: signal.createdAt.toISOString(),
    } satisfies PatrolSignalAdminDto));
  }

  private toWorkflowDto(
    action: Prisma.WorkflowAction & {
      market?: { id: string; slug: string | null; title: string | null } | null;
    }
  ): WorkflowActionAdminDto {
    const metadata = this.parseMetadata(action.metadata);
    return {
      id: action.id,
      marketId: action.marketId,
      marketSlug: action.market?.slug ?? null,
      marketTitle: action.market?.title ?? null,
      type: action.type.toLowerCase(),
      status: action.status.toLowerCase(),
      description: action.description,
      triggersAt: action.triggersAt ? action.triggersAt.toISOString() : null,
      metadata,
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString(),
    } satisfies WorkflowActionAdminDto;
  }

  private parseStatus(value: string): WorkflowActionStatus {
    if (typeof value !== "string") {
      throw new BadRequestException("status обязан быть строкой");
    }
    const normalized = value.trim().toUpperCase();
    if (normalized in WorkflowActionStatus) {
      return normalized as WorkflowActionStatus;
    }
    throw new BadRequestException("Недопустимый статус workflow действия");
  }

  private parseType(value: string): WorkflowActionType {
    if (typeof value !== "string") {
      throw new BadRequestException("type обязан быть строкой");
    }
    const normalized = value.trim().toUpperCase();
    if (normalized in WorkflowActionType) {
      return normalized as WorkflowActionType;
    }
    throw new BadRequestException("Недопустимый тип workflow действия");
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} содержит некорректную дату`);
    }
    return parsed;
  }

  private toInputJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    if (!value) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  private parseMetadata(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private normalizeLimit(value: number | undefined, fallback: number): number {
    if (value === undefined) {
      return fallback;
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException("limit должен быть положительным числом");
    }
    return Math.min(Math.floor(value), 500);
  }

  private async ensureMarketExists(id: string): Promise<void> {
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) {
      throw new NotFoundException(`Рынок ${id} не найден`);
    }
  }

  private handleNotFound<T>(error: unknown, id: string): never | T {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new NotFoundException(`Workflow действие ${id} не найдено`);
    }
    throw error instanceof Error ? error : new Error("Неизвестная ошибка базы данных");
  }
}
