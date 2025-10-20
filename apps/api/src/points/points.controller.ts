import {
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

import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";
import type { FlowSessionPayload } from "../auth/flow-auth.service";
import { PointsService } from "./points.service";
import { AwardPointsDto } from "./dto/award-points.dto";
import { LeaderboardQueryDto } from "./dto/leaderboard-query.dto";
import { LedgerQueryDto } from "./dto/ledger-query.dto";
import {
  LeaderboardEntryDto,
  PointLedgerEntryDto,
  PointsSummaryDto,
} from "./dto/points.dto";
import { LeaderboardSnapshotDto } from "./dto/leaderboard-snapshot.dto";
import { LeaderboardSnapshotQueryDto } from "./dto/leaderboard-snapshot-query.dto";
import { CaptureSnapshotDto } from "./dto/capture-snapshot.dto";

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

interface LedgerResponse {
  entries: PointLedgerEntryDto[];
  nextCursor?: string;
}

@Controller("points")
@UseGuards(FlowOrApiGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get("me")
  async getMySummary(@Req() request: RequestWithSession): Promise<PointsSummaryDto> {
    const session = this.requireSession(request);
    return this.pointsService.getSummary(session.address);
  }

  @Get("me/ledger")
  async getMyLedger(
    @Req() request: RequestWithSession,
    @Query() query: LedgerQueryDto
  ): Promise<LedgerResponse> {
    const session = this.requireSession(request);
    return this.pointsService.getLedger(session.address, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get("leaderboard")
  async getLeaderboard(@Query() query: LeaderboardQueryDto): Promise<LeaderboardEntryDto[]> {
    return this.pointsService.getLeaderboard(query.limit ?? 20);
  }

  @Get("leaderboard/snapshots")
  async getLeaderboardSnapshots(
    @Query() query: LeaderboardSnapshotQueryDto
  ): Promise<LeaderboardSnapshotDto[]> {
    return this.pointsService.getLeaderboardSnapshots({
      limit: query.limit,
      after: query.after,
      before: query.before,
    });
  }

  @Post("leaderboard/snapshots")
  @RequireFlowRoles("ADMIN")
  async captureLeaderboardSnapshot(
    @Body() body: CaptureSnapshotDto
  ): Promise<LeaderboardSnapshotDto> {
    return this.pointsService.captureLeaderboardSnapshot({
      limit: body.limit,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
    });
  }

  @Post("award")
  @RequireFlowRoles("ADMIN")
  async awardPoints(
    @Body() body: AwardPointsDto,
    @Req() request: RequestWithSession
  ): Promise<PointLedgerEntryDto> {
    const session = this.requireSession(request);
    return this.pointsService.awardPoints({
      address: body.address,
      amount: body.amount,
      source: body.source,
      reference: body.reference,
      notes: body.notes,
      actor: session.address,
    });
  }

  @Get(":address")
  @RequireFlowRoles("ADMIN")
  async getSummaryForAddress(@Param("address") address: string): Promise<PointsSummaryDto> {
    return this.pointsService.getSummary(address);
  }

  @Get(":address/ledger")
  @RequireFlowRoles("ADMIN")
  async getLedgerForAddress(
    @Param("address") address: string,
    @Query() query: LedgerQueryDto
  ): Promise<LedgerResponse> {
    return this.pointsService.getLedger(address, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  private requireSession(request: RequestWithSession): FlowSessionPayload {
    if (!request.flowSession) {
      throw new UnauthorizedException("Authentication required");
    }
    return request.flowSession;
  }
}
