import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { MomentLockStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { TopShotService } from "./topshot.service";
import {
  TopShotMomentDetail,
  TopShotMomentLockDto,
  TopShotMomentTier,
  TopShotProjectedBonus,
} from "./topshot.types";

interface LockMomentOptions {
  marketId: string;
  outcomeIndex: number;
  userAddress: string;
  momentId: string;
  estimatedReward?: number | null;
}

@Injectable()
export class TopShotLockService {
  private readonly logger = new Logger(TopShotLockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topshotService: TopShotService
  ) {}

  async lockMoment(options: LockMomentOptions): Promise<TopShotMomentLockDto> {
    const market = await this.prisma.market.findUnique({
      where: { id: options.marketId },
      include: {
        outcomes: true,
        workflow: true,
      },
    });

    if (!market) {
      throw new BadRequestException("Market not found");
    }

    const outcome = market.outcomes[options.outcomeIndex];
    if (!outcome) {
      throw new BadRequestException("Invalid outcome index");
    }

    const outcomeType = this.extractOutcomeType(outcome.metadata);
    if (outcomeType !== "home" && outcomeType !== "away") {
      throw new BadRequestException("Top Shot bonuses are available only for win outcomes");
    }

    const outcomeTeam = this.extractOutcomeTeam(outcome.metadata);
    if (!outcomeTeam) {
      throw new BadRequestException("Outcome team metadata is missing");
    }

    const eventContext = this.extractEventContext(market.tags ?? []);
    if (!eventContext) {
      throw new BadRequestException("Market is not linked to a sports event");
    }

    const scheduleReference = this.resolveEventStart(market.workflow);
    if (!scheduleReference) {
      throw new BadRequestException("Unable to resolve event start time");
    }

    const now = new Date();
    const changeDeadline = new Date(scheduleReference.getTime() - 60 * 60 * 1000);
    if (now > changeDeadline) {
      throw new BadRequestException("Moment selection window has closed");
    }

    const lockedUntil = this.resolveLockedUntil(market);

    const moment = await this.topshotService.getMomentDetail(options.userAddress, options.momentId);
    if (!moment) {
      throw new BadRequestException("Moment not found in owner collection");
    }

    if (!this.isMomentEligibleForTeam(moment, outcomeTeam)) {
      throw new BadRequestException("Selected moment does not match team for chosen outcome");
    }

    await this.ensureMomentNotLockedElsewhere(moment.id, market.id);

    const rarity = moment.tier;
    const estimatedReward =
      options.estimatedReward ??
      this.estimateProjectedBonus(moment, {
        outcomeType,
        teamName: outcomeTeam.teamName,
      });
    const existing = await this.prisma.topShotMomentLock.findUnique({
      where: {
        userAddress_marketId: {
          userAddress: options.userAddress.toLowerCase(),
          marketId: market.id,
        },
      },
    });

    const data = {
      userAddress: options.userAddress.toLowerCase(),
      marketId: market.id,
      eventId: eventContext.eventId,
      momentId: moment.id,
      rarity,
      outcomeType,
      outcomeIndex: options.outcomeIndex,
      playerId: moment.playerId ?? undefined,
      playerName: moment.fullName,
      teamName: moment.teamName ?? outcomeTeam.teamName,
      changeDeadline,
      lockedUntil,
      estimatedReward: estimatedReward != null ? new Prisma.Decimal(estimatedReward) : null,
      status: MomentLockStatus.ACTIVE,
      metadata: {
        outcomeTeam,
        playId: moment.playId,
        setId: moment.setId,
        serialNumber: moment.serialNumber,
      },
    };

    const upserted = await this.prisma.topShotMomentLock.upsert({
      where: {
        userAddress_marketId: {
          userAddress: options.userAddress.toLowerCase(),
          marketId: market.id,
        },
      },
      create: data,
      update: {
        ...data,
        lockedAt: existing?.lockedAt ?? undefined,
      },
      include: {
        rewards: true,
      },
    });

    return this.toDto(upserted);
  }

  async getActiveLock(marketId: string, userAddress: string): Promise<TopShotMomentLockDto | null> {
    const lock = await this.prisma.topShotMomentLock.findUnique({
      where: {
        userAddress_marketId: {
          userAddress: userAddress.toLowerCase(),
          marketId,
        },
      },
      include: {
        rewards: true,
      },
    });

    if (!lock || lock.status !== MomentLockStatus.ACTIVE) {
      return null;
    }

    return this.toDto(lock);
  }

  async releaseLock(marketId: string, userAddress: string, reason: MomentLockStatus): Promise<void> {
    const normalized = userAddress.toLowerCase();
    const lock = await this.prisma.topShotMomentLock.findUnique({
      where: {
        userAddress_marketId: {
          userAddress: normalized,
          marketId,
        },
      },
    });

    if (!lock) {
      return;
    }

    if (lock.status !== MomentLockStatus.ACTIVE) {
      return;
    }

    await this.prisma.topShotMomentLock.update({
      where: { id: lock.id },
      data: {
        status: reason,
        releasedAt: new Date(),
      },
    });
  }

  async createLock(userAddress: string, dto: any): Promise<TopShotMomentLockDto> {
    throw new Error("createLock not yet implemented");
  }

  async updateLock(lockId: string, userAddress: string, dto: any): Promise<TopShotMomentLockDto> {
    throw new Error("updateLock not yet implemented");
  }

  async getUserLocks(userAddress: string): Promise<TopShotMomentLockDto[]> {
    const normalized = userAddress.toLowerCase();
    const locks = await this.prisma.topShotMomentLock.findMany({
      where: { userAddress: normalized },
      orderBy: { createdAt: 'desc' },
    });
    return locks.map(this.toDto);
  }

  async getMarketLocks(marketId: string): Promise<TopShotMomentLockDto[]> {
    const locks = await this.prisma.topShotMomentLock.findMany({
      where: { marketId },
      orderBy: { createdAt: 'desc' },
    });
    return locks.map(this.toDto);
  }

  buildProjectedBonus(moment: TopShotMomentDetail, params: {
    marketId: string;
    eventId: string;
    outcomeType: "home" | "away" | "draw" | "cancel" | "unknown";
    outcomeIndex: number;
    estimatedReward?: number | null;
  }): TopShotProjectedBonus {
    return {
      momentId: moment.id,
      marketId: params.marketId,
      eventId: params.eventId,
      outcomeType: params.outcomeType,
      playerId: moment.playerId,
      playerName: moment.fullName,
      rarity: moment.tier,
      projectedPoints:
        params.estimatedReward ??
        this.estimateProjectedBonus(moment, {
          outcomeType: params.outcomeType,
          teamName: moment.teamName ?? "",
        }),
      capPerMatch: this.resolveRarityCap(moment.tier),
    } satisfies TopShotProjectedBonus;
  }

  private async ensureMomentNotLockedElsewhere(momentId: string, marketId: string): Promise<void> {
    const conflict = await this.prisma.topShotMomentLock.findFirst({
      where: {
        momentId,
        marketId: { not: marketId },
        status: MomentLockStatus.ACTIVE,
      },
    });

    if (conflict) {
      throw new BadRequestException("Moment is locked for another event");
    }
  }

  private extractOutcomeType(metadata: Prisma.JsonValue): "home" | "away" | "draw" | "cancel" | "unknown" {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return "unknown";
    }
    const record = metadata as Record<string, unknown>;
    const value = typeof record.type === "string" ? record.type.toLowerCase() : "unknown";
    if (value === "home" || value === "away" || value === "draw" || value === "cancel") {
      return value;
    }
    return "unknown";
  }

  private extractOutcomeTeam(metadata: Prisma.JsonValue): { teamName: string } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }
    const record = metadata as Record<string, unknown>;
    const teamName = typeof record.team === "string" ? record.team : null;
    if (!teamName) {
      return null;
    }
    return { teamName };
  }

  private extractEventContext(tags: string[]): { eventId: string } | null {
    const eventTag = tags.find((tag) => tag.startsWith("event:"));
    if (!eventTag) {
      return null;
    }
    const parts = eventTag.split(":");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }
    return { eventId: parts[1] };
  }

  private resolveEventStart(workflow: Array<{ type: string; metadata: Prisma.JsonValue }>): Date | null {
    for (const action of workflow ?? []) {
      if (action.type !== "CUSTOM") {
        continue;
      }
      if (!action.metadata || typeof action.metadata !== "object" || Array.isArray(action.metadata)) {
        continue;
      }
      const record = action.metadata as Record<string, unknown>;
      const startsAt = typeof record.startsAt === "string" ? new Date(record.startsAt) : null;
      if (startsAt && !Number.isNaN(startsAt.getTime())) {
        return startsAt;
      }
    }
    return null;
  }

  private resolveLockedUntil(market: {
    freezeWindowEndAt: Date | null;
    closeAt: Date | null;
  }): Date {
    if (market.freezeWindowEndAt) {
      return market.freezeWindowEndAt;
    }
    if (market.closeAt) {
      return market.closeAt;
    }
    return new Date(Date.now() + 6 * 60 * 60 * 1000);
  }

  private isMomentEligibleForTeam(moment: TopShotMomentDetail, team: { teamName: string }): boolean {
    if (!moment.teamName) {
      return false;
    }
    const normalizedMoment = this.normalizeTeamName(moment.teamName);
    const normalizedOutcome = this.normalizeTeamName(team.teamName);
    return normalizedMoment === normalizedOutcome;
  }

  private normalizeTeamName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/(basketballclub|club|fc|nba)/g, "")
      .trim();
  }

  private toDto(record: Prisma.TopShotMomentLockGetPayload<{ include: { rewards: true } }>): TopShotMomentLockDto {
    return {
      id: record.id,
      marketId: record.marketId,
      eventId: record.eventId,
      momentId: record.momentId,
      userAddress: record.userAddress,
      rarity: record.rarity as TopShotMomentTier,
      outcomeType: record.outcomeType as TopShotMomentLockDto["outcomeType"],
      outcomeIndex: record.outcomeIndex,
      playerId: record.playerId ?? undefined,
      playerName: record.playerName ?? undefined,
      teamName: record.teamName ?? undefined,
      lockedAt: record.lockedAt,
      changeDeadline: record.changeDeadline,
      lockedUntil: record.lockedUntil,
      status: record.status,
      estimatedReward: record.estimatedReward ? Number(record.estimatedReward) : undefined,
    } satisfies TopShotMomentLockDto;
  }

  private resolveRarityCap(rarity: TopShotMomentTier): number {
    switch (rarity) {
      case "Common":
        return 30;
      case "Rare":
        return 100;
      case "Legendary":
        return 200;
      case "Ultimate":
        return 300;
      default:
        return 50;
    }
  }

  private estimateProjectedBonus(
    moment: TopShotMomentDetail,
    params: { outcomeType: string; teamName: string }
  ): number {
    const cap = this.resolveRarityCap(moment.tier);
    const base = cap * 0.6;
    const serialBoost = moment.serialNumber > 0 ? Math.max(0.85, Math.min(1.1, 100 / moment.serialNumber)) : 1;
    const positionBoost = moment.primaryPosition && moment.primaryPosition.toLowerCase().includes("g") ? 1.05 : 1;
    const matchupFactor = params.outcomeType === "home" ? 1.05 : 1;

    const projected = base * serialBoost * positionBoost * matchupFactor;
    return Number(Math.min(cap, Math.max(15, projected)).toFixed(2));
  }
}
