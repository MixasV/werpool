import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PointEventSource, RolePurchaseStatus, RoleType } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PointsService } from "../points/points.service";
import { RolesService } from "./roles.service";
import { toRolePurchaseDto, RolePurchaseRequestDto } from "./dto/role-purchase.dto";

interface ProcessOptions {
  notes?: string;
  actor: string;
}

const PATROL_ROLE_COST = 20000;
const PATROL_ROLE: RoleType = "PATROL";

@Injectable()
export class RolePurchaseService {
  private readonly logger = new Logger(RolePurchaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService,
    private readonly rolesService: RolesService
  ) {}

  async requestPurchase(address: string): Promise<RolePurchaseRequestDto> {
    const normalized = address.toLowerCase();

    const existingRole = await this.prisma.roleAssignment.findUnique({
      where: {
        address_role: {
          address: normalized,
          role: PATROL_ROLE,
        },
      },
    });

    if (existingRole) {
      throw new BadRequestException("PATROL role already assigned");
    }

    const existingRequest = await this.prisma.rolePurchaseRequest.findFirst({
      where: {
        userAddress: normalized,
        status: {
          in: [RolePurchaseStatus.PENDING, RolePurchaseStatus.APPROVED],
        },
      },
    });

    if (existingRequest) {
      throw new BadRequestException("Existing role purchase request is still in progress");
    }

    await this.pointsService.spendPoints({
      address: normalized,
      amount: PATROL_ROLE_COST,
      source: PointEventSource.ROLE_PURCHASE,
      reference: "role:patrol",
      notes: "Role purchase request",
    });

    const created = await this.prisma.rolePurchaseRequest.create({
      data: {
        userAddress: normalized,
        role: PATROL_ROLE,
        pointsSpent: PATROL_ROLE_COST,
        status: RolePurchaseStatus.PENDING,
      },
    });

    return toRolePurchaseDto(created);
  }

  async listRequests(address: string): Promise<RolePurchaseRequestDto[]> {
    const normalized = address.toLowerCase();
    const requests = await this.prisma.rolePurchaseRequest.findMany({
      where: { userAddress: normalized },
      orderBy: { createdAt: "desc" },
    });

    return requests.map(toRolePurchaseDto);
  }

  async listAll(status?: RolePurchaseStatus): Promise<RolePurchaseRequestDto[]> {
    const requests = await this.prisma.rolePurchaseRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return requests.map(toRolePurchaseDto);
  }

  async approveRequest(id: string, options: ProcessOptions): Promise<RolePurchaseRequestDto> {
    const request = await this.prisma.rolePurchaseRequest.findUnique({ where: { id } });
    if (!request) {
      throw new BadRequestException("Role purchase request not found");
    }

    if (request.status !== RolePurchaseStatus.PENDING) {
      throw new BadRequestException("Only pending requests can be approved");
    }

    const normalizedActor = options.actor.toLowerCase();

    await this.prisma.rolePurchaseRequest.update({
      where: { id },
      data: {
        status: RolePurchaseStatus.APPROVED,
        processedAt: new Date(),
        processedBy: normalizedActor,
        notes: options.notes ?? request.notes,
      },
    });

    try {
      await this.rolesService.assign({ address: request.userAddress, role: "patrol" });
    } catch (error) {
      this.logger.error(`Failed to assign PATROL role for ${request.userAddress}: ${(error as Error).message}`);

      await this.pointsService.recordEvent({
        address: request.userAddress,
        amount: PATROL_ROLE_COST,
        source: PointEventSource.ROLE_PURCHASE,
        reference: `role:patrol:refund:${id}`,
        notes: "Role purchase refund",
        actor: normalizedActor,
      });

      const combinedNotes = this.appendNotes(options.notes ?? request.notes, "Role assignment failed; refunded.");

      await this.prisma.rolePurchaseRequest.update({
        where: { id },
        data: {
          status: RolePurchaseStatus.DECLINED,
          notes: combinedNotes,
        },
      });

      throw error;
    }

    const completed = await this.prisma.rolePurchaseRequest.update({
      where: { id },
      data: {
        status: RolePurchaseStatus.COMPLETED,
      },
    });

    return toRolePurchaseDto(completed);
  }

  async declineRequest(id: string, options: ProcessOptions): Promise<RolePurchaseRequestDto> {
    const request = await this.prisma.rolePurchaseRequest.findUnique({ where: { id } });
    if (!request) {
      throw new BadRequestException("Role purchase request not found");
    }

    if (request.status !== RolePurchaseStatus.PENDING) {
      throw new BadRequestException("Only pending requests can be declined");
    }

    const normalizedActor = options.actor.toLowerCase();

    const updated = await this.prisma.rolePurchaseRequest.update({
      where: { id },
      data: {
        status: RolePurchaseStatus.DECLINED,
        processedAt: new Date(),
        processedBy: normalizedActor,
        notes: this.appendNotes(request.notes, options.notes ?? "Declined"),
      },
    });

    await this.pointsService.recordEvent({
      address: request.userAddress,
      amount: PATROL_ROLE_COST,
      source: PointEventSource.ROLE_PURCHASE,
      reference: `role:patrol:refund:${id}`,
      notes: "Role purchase refund",
      actor: normalizedActor,
    });

    return toRolePurchaseDto(updated);
  }

  private appendNotes(existing: string | null | undefined, addition: string): string {
    if (!existing) {
      return addition;
    }
    return `${existing} | ${addition}`;
  }
}
