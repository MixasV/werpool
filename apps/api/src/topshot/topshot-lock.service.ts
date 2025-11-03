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
  userAddress: string;
  momentId: string;
  estimatedReward?: number | null;
  // outcomeIndex removed - card is locked for the event, not specific outcome
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

    // No team eligibility check - card is locked for the event regardless of team
    // Bonus is determined at settlement based on user's shares and card's team

    await this.ensureMomentNotLockedElsewhere(moment.id, market.id);

    const rarity = moment.tier;
    const estimatedReward = options.estimatedReward ?? this.estimateGenericBonus(moment);
    
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
      // outcomeType and outcomeIndex are determined at settlement
      outcomeType: null,
      outcomeIndex: null,
      playerId: moment.playerId ?? undefined,
      playerName: moment.fullName,
      teamName: moment.teamName,
      changeDeadline,
      lockedUntil,
      estimatedReward: estimatedReward != null ? new Prisma.Decimal(estimatedReward) : null,
      status: MomentLockStatus.ACTIVE,
      metadata: {
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

  async createLock(userAddress: string, dto: { marketId: string; eventId: string; momentId: string }): Promise<TopShotMomentLockDto> {
    return this.lockMoment({
      marketId: dto.marketId,
      userAddress,
      momentId: dto.momentId,
    });
  }

  async updateLock(lockId: string, userAddress: string, dto: { momentId: string }): Promise<TopShotMomentLockDto> {
    const lock = await this.prisma.topShotMomentLock.findUnique({
      where: { id: lockId },
    });

    if (!lock || lock.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
      throw new BadRequestException("Lock not found or unauthorized");
    }

    if (lock.status !== MomentLockStatus.ACTIVE) {
      throw new BadRequestException("Cannot update non-active lock");
    }

    const now = new Date();
    if (now > lock.changeDeadline) {
      throw new BadRequestException("Change deadline has passed");
    }

    return this.lockMoment({
      marketId: lock.marketId,
      userAddress,
      momentId: dto.momentId,
    });
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
    estimatedReward?: number | null;
  }): TopShotProjectedBonus {
    return {
      momentId: moment.id,
      marketId: params.marketId,
      eventId: params.eventId,
      outcomeType: "unknown",  // Determined at settlement
      playerId: moment.playerId,
      playerName: moment.fullName,
      rarity: moment.tier,
      projectedPoints: params.estimatedReward ?? this.estimateGenericBonus(moment),
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
      outcomeIndex: record.outcomeIndex ?? undefined,
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

  /**
   * Calculate maximum projected reward for a moment in a specific market
   * Returns the highest possible points this card can earn
   */
  async calculateMaxProjectedReward(moment: TopShotMomentDetail, market: any): Promise<number> {
    const cap = this.resolveRarityCap(moment.tier);
    
    // Extract teams from market outcomes
    const teams = market.outcomes
      .map((outcome: any) => {
        const metadata = outcome.metadata as Record<string, unknown> | null;
        if (!metadata) return null;
        const type = metadata.type;
        const team = typeof metadata.team === 'string' ? metadata.team : null;
        return { type, team };
      })
      .filter((t: any) => t !== null && t.team);

    // Normalize card team name
    const cardTeam = moment.teamName?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    
    // Check if card team matches any outcome team
    let matchesTeam = false;
    for (const outcome of teams) {
      const outcomeTeam = outcome.team.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cardTeam && outcomeTeam && cardTeam.includes(outcomeTeam)) {
        matchesTeam = true;
        break;
      }
    }

    if (matchesTeam) {
      // Team matches → can get FULL BONUS (up to cap, min 10)
      // Return cap as maximum possible (perfect performance scenario)
      return Math.min(cap, 300);
    } else if (moment.playerId) {
      // Player card but wrong team → can get PARTICIPATION BONUS (15 pts)
      return 15;
    } else {
      // Generic card → GENERIC BONUS (10 pts)
      return 10;
    }
  }

  /**
   * Estimate generic bonus for any card (avg 30-50% of cap)
   */
  private estimateGenericBonus(moment: TopShotMomentDetail): number {
    const cap = this.resolveRarityCap(moment.tier);
    const base = cap * 0.4; // 40% of cap as baseline
    const serialBoost = moment.serialNumber > 0 ? Math.max(0.9, Math.min(1.15, 100 / moment.serialNumber)) : 1;
    const positionBoost = moment.primaryPosition && moment.primaryPosition.toLowerCase().includes("g") ? 1.05 : 1;

    const projected = base * serialBoost * positionBoost;
    return Number(Math.min(cap, Math.max(10, projected)).toFixed(2)); // Minimum 10 pts
  }
}
