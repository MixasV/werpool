import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { RolePurchaseStatus } from "@prisma/client";

import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";
import type { FlowSessionPayload } from "../auth/flow-auth.service";
import { RolePurchaseService } from "./role-purchase.service";

interface ProcessRolePurchaseDto {
  notes?: string;
}

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

@Controller("admin/role-purchases")
@UseGuards(FlowOrApiGuard)
@RequireFlowRoles("ADMIN")
export class AdminRolePurchaseController {
  constructor(private readonly rolePurchase: RolePurchaseService) {}

  @Get()
  async list(@Query("status") status?: string) {
    let normalizedStatus: RolePurchaseStatus | undefined;
    if (typeof status === "string" && status.trim().length > 0) {
      const upper = status.trim().toUpperCase();
      if (
        upper === RolePurchaseStatus.PENDING ||
        upper === RolePurchaseStatus.APPROVED ||
        upper === RolePurchaseStatus.DECLINED ||
        upper === RolePurchaseStatus.COMPLETED
      ) {
        normalizedStatus = upper;
      } else {
        throw new BadRequestException("Invalid status parameter");
      }
    }

    return this.rolePurchase.listAll(normalizedStatus);
  }

  @Post(":id/approve")
  async approve(
    @Param("id") id: string,
    @Body() body: ProcessRolePurchaseDto,
    @Req() request: RequestWithSession
  ) {
    const session = this.requireSession(request);
    return this.rolePurchase.approveRequest(id, {
      actor: session.address,
      notes: body.notes,
    });
  }

  @Post(":id/decline")
  async decline(
    @Param("id") id: string,
    @Body() body: ProcessRolePurchaseDto,
    @Req() request: RequestWithSession
  ) {
    const session = this.requireSession(request);
    return this.rolePurchase.declineRequest(id, {
      actor: session.address,
      notes: body.notes,
    });
  }

  private requireSession(request: RequestWithSession): FlowSessionPayload {
    if (!request.flowSession) {
      throw new UnauthorizedException("Authentication required");
    }
    return request.flowSession;
  }
}
