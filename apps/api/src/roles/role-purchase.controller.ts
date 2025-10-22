import { Controller, Get, Post, UseGuards, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import type { FlowSessionPayload } from "../auth/flow-auth.service";
import { RolePurchaseService } from "./role-purchase.service";

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

@Controller("roles/purchase")
@UseGuards(FlowOrApiGuard)
export class RolePurchaseController {
  constructor(private readonly rolePurchase: RolePurchaseService) {}

  @Get("me")
  async listMyRequests(@Req() request: RequestWithSession) {
    const session = this.requireSession(request);
    return this.rolePurchase.listRequests(session.address);
  }

  @Post()
  async requestPurchase(@Req() request: RequestWithSession) {
    const session = this.requireSession(request);
    return this.rolePurchase.requestPurchase(session.address);
  }

  private requireSession(request: RequestWithSession): FlowSessionPayload {
    if (!request.flowSession) {
      throw new UnauthorizedException("Authentication required");
    }
    return request.flowSession;
  }
}
