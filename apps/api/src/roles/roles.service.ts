import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { normalizeFlowAddress } from "../common/flow-address.util";
import {
  AssignRoleDto,
  OnchainRoleDto,
  RoleDto,
  toRoleDto,
} from "./dto/assign-role.dto";
import { FlowUserDto, toFlowUserDto } from "./dto/flow-user.dto";
import { FlowRolesService, type RoleEventPayload } from "./flow-roles.service";

type RoleTypeUpper = "ADMIN" | "OPERATOR" | "ORACLE" | "PATROL";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowRoles: FlowRolesService
  ) {}

  async list(): Promise<RoleDto[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      orderBy: { createdAt: "desc" },
    });

    return assignments.map(toRoleDto);
  }

  async directory(): Promise<FlowUserDto[]> {
    const users = await this.prisma.flowUser.findMany({
      include: {
        roles: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [
        { lastSeenAt: "desc" },
        { firstSeenAt: "desc" },
      ],
    });

    return users.map(toFlowUserDto);
  }

  async assign(payload: AssignRoleDto): Promise<RoleDto> {
    const role = this.parseRole(payload.role);
    const address = normalizeFlowAddress(payload.address, "address");
    const label = typeof payload.label === "string" ? payload.label.trim() : null;

    const now = new Date();
    await this.prisma.flowUser.upsert({
      where: { address },
      update: {
        lastSeenAt: now,
        ...(label ? { label } : {}),
      },
      create: {
        address,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(label ? { label } : {}),
      },
    });

    const assignment = await this.prisma.roleAssignment.upsert({
      where: { address_role: { address, role } },
      update: {},
      create: { address, role },
    });

    return toRoleDto(assignment);
  }

  async revoke(id: string): Promise<void> {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new BadRequestException("id is required");
    }

    try {
      await this.prisma.roleAssignment.delete({ where: { id } });
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException(`Role assignment ${id} not found`);
      }
      throw error;
    }
  }

  async grantOnchain(payload: OnchainRoleDto): Promise<RoleDto> {
    const events = await this.flowRoles.fetchRoleEvents(payload.transactionId);
    const grant = events.find((event) => event.type === "grant");
    if (!grant) {
      throw new BadRequestException("transaction does not grant role");
    }

    return this.applyGrantEvent(grant, payload.label);
  }

  async revokeOnchain(payload: OnchainRoleDto): Promise<RoleDto> {
    const events = await this.flowRoles.fetchRoleEvents(payload.transactionId);
    const revoke = events.find((event) => event.type === "revoke");
    if (!revoke) {
      throw new BadRequestException("transaction does not revoke role");
    }

    return this.applyRevokeEvent(revoke);
  }

  private async applyGrantEvent(event: RoleEventPayload, label?: string | null): Promise<RoleDto> {
    const address = normalizeFlowAddress(event.address, "address");
    const now = new Date();
    const normalizedLabel = typeof label === "string" ? label.trim() : null;

    await this.prisma.flowUser.upsert({
      where: { address },
      update: {
        lastSeenAt: now,
        ...(normalizedLabel ? { label: normalizedLabel } : {}),
      },
      create: {
        address,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(normalizedLabel ? { label: normalizedLabel } : {}),
      },
    });

    const assignment = await this.prisma.roleAssignment.upsert({
      where: { address_role: { address, role: event.role } },
      update: {},
      create: { address, role: event.role },
    });

    return toRoleDto(assignment);
  }

  private async applyRevokeEvent(event: RoleEventPayload): Promise<RoleDto> {
    const address = normalizeFlowAddress(event.address, "address");

    const assignment = await this.prisma.roleAssignment.findUnique({
      where: { address_role: { address, role: event.role } },
    });

    if (!assignment) {
      throw new NotFoundException(`Role assignment for ${address} ${event.role} not found`);
    }

    await this.prisma.roleAssignment.delete({ where: { id: assignment.id } });

    return toRoleDto(assignment);
  }

  private parseRole(role: string): RoleTypeUpper {
    if (typeof role !== "string") {
      throw new BadRequestException("role is required");
    }

    const normalized = role.trim().toUpperCase();
    if (
      normalized === "ADMIN" ||
      normalized === "OPERATOR" ||
      normalized === "ORACLE" ||
      normalized === "PATROL"
    ) {
      return normalized;
    }

    throw new BadRequestException("role must be admin, operator, oracle or patrol");
  }

  private isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    return (error as { code?: string }).code === "P2025";
  }
}
