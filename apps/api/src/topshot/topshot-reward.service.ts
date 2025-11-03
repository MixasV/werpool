import { Injectable, Logger } from "@nestjs/common";
import { MomentLockStatus, PointEventSource, Prisma, TopShotMomentLock as PrismaTopShotMomentLock } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PointsService } from "../points/points.service";
import { SportsOracleService } from "../oracles/sports-oracle.service";
import { NBAStatsClient } from "../oracles/providers/nba-stats.client";
import { TopShotMomentTier } from "./topshot.types";

interface RewardComputationContext {
  marketId: string;
  eventId: string;
  resolvedOutcomeId: string;
  outcomeIndex: number;
}

interface PlayerPerformance {
  playerId: string;
  playerName?: string;
  teamName?: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  plusMinus: number;
  minutes: number;
}

interface RewardCandidate {
  lockId: string;
  userAddress: string;
  momentId: string;
  rarity: TopShotMomentTier;
  playerId?: string;
  playerName?: string;
  teamName?: string;
  estimatedReward?: number | null;
}

@Injectable()
export class TopShotRewardService {
  private readonly logger = new Logger(TopShotRewardService.name);
  private readonly rarityMultipliers: Record<TopShotMomentTier, number> = {
    Common: 1.0,
    Fandom: 1.0,
    Rare: 1.2,
    Legendary: 1.5,
    Ultimate: 1.8,
    Parallel: 1.1,
    Unknown: 1.0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService,
    private readonly sportsOracle: SportsOracleService,
    private readonly nbaStats: NBAStatsClient
  ) {}

  async processSettlement(params: RewardComputationContext): Promise<void> {
    const locks = await this.prisma.topShotMomentLock.findMany({
      where: {
        marketId: params.marketId,
        status: MomentLockStatus.ACTIVE,
      },
    });

    if (locks.length === 0) {
      return;
    }

    const event = await this.sportsOracle.getLatestEvent(params.eventId);
    if (!event) {
      this.logger.warn(`Sports event ${params.eventId} unavailable for Top Shot rewards`);
      return;
    }

    const payload = event.payload ?? {};
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "unknown";
    if (status !== "final" && status !== "completed") {
      this.logger.warn(`Event ${params.eventId} not final yet, postponing Top Shot rewards`);
      return;
    }

    const winningOutcome = await this.resolveWinningOutcome(params.marketId, params.resolvedOutcomeId);
    if (!winningOutcome) {
      this.logger.warn(`Unable to resolve winning outcome metadata for market ${params.marketId}`);
      return;
    }

    const gameDate = typeof payload.date === "string" ? payload.date : new Date().toISOString().split("T")[0];
    
    let playerStats = await this.fetchPlayerStatsFromNBA(gameDate);
    
    if (playerStats.length === 0) {
      this.logger.log("Falling back to oracle player data");
      playerStats = this.normalizePlayerStats(payload.players);
    }
    // NEW LOGIC: Process ALL locks regardless of team
    // Bonus is determined by:
    // 1. User has shares on winning outcome
    // 2. Card's team matches winning team → full bonus (min 10 pts)
    // 3. Card's team doesn't match but player participated → min 15 pts
    // 4. Any locked card with shares → min 10 pts

    if (locks.length === 0) {
      return;
    }

    const candidates = locks.map((lock) => this.toCandidate(lock));
    const ownersByPlayer = this.groupByPlayer(candidates);

    const rewardRecords: Array<Promise<void>> = [];
    for (const candidate of candidates) {
      // Check if user has shares on winning outcome
      const netShares = await this.resolveNetShares(params.marketId, candidate.userAddress, winningOutcome.index);
      if (netShares <= 0) {
        // No shares on winning outcome → no bonus
        rewardRecords.push(this.markLock(candidate.lockId, MomentLockStatus.RELEASED));
        continue;
      }

      // Check activity requirement
      const isActiveTrader = await this.hasRecentActivity(candidate.userAddress);
      if (!isActiveTrader) {
        rewardRecords.push(this.markLock(candidate.lockId, MomentLockStatus.EXPIRED));
        continue;
      }

      // Check daily cap
      const dailyBudget = await this.getRemainingDailyCap(candidate.userAddress);
      if (dailyBudget <= 0) {
        rewardRecords.push(this.markLock(candidate.lockId, MomentLockStatus.RELEASED));
        continue;
      }

      // Determine team match
      const winningTeam = winningOutcome.team?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
      const cardTeam = candidate.teamName?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
      const isTeamMatch = winningTeam && cardTeam && cardTeam.includes(winningTeam);

      // Get player performance
      const performance = this.pickPerformance(playerStats, candidate);
      const playerParticipated = performance !== null;

      let awardedPoints = 0;

      if (isTeamMatch && performance) {
        // FULL BONUS: Team match + player played
        const score = this.computePerformanceScore(performance);
        const multiplier = this.rarityMultipliers[candidate.rarity] ?? 1.0;
        const rawPoints = score * multiplier;
        const cap = this.resolveRarityCap(candidate.rarity);
        const capped = Math.min(rawPoints, cap, 150);

        const owners = ownersByPlayer.get(candidate.playerId ?? candidate.playerName ?? candidate.momentId) ?? [];
        const ownershipFactor = Math.min(0.5, owners.length > 0 ? 1 / owners.length : 1);
        const adjusted = capped * ownershipFactor;

        // Minimum 10 points for team match
        awardedPoints = Math.max(10, Math.min(adjusted, dailyBudget, cap));
      } else if (!isTeamMatch && playerParticipated) {
        // PARTICIPATION BONUS: Wrong team but player participated → min 15 pts
        awardedPoints = Math.min(15, dailyBudget);
      } else {
        // GENERIC BONUS: Any card with shares → min 10 pts
        awardedPoints = Math.min(10, dailyBudget);
      }

      if (awardedPoints < 0.01) {
        rewardRecords.push(this.markLock(candidate.lockId, MomentLockStatus.RELEASED));
        continue;
      }

      rewardRecords.push(this.awardCandidate(candidate, params, awardedPoints, {
        score: performance ? this.computePerformanceScore(performance) : 0,
        multiplier: this.rarityMultipliers[candidate.rarity] ?? 1.0,
        ownershipFactor: 1,
        netShares,
        bonusType: isTeamMatch ? 'FULL' : (playerParticipated ? 'PARTICIPATION' : 'GENERIC'),
      }));
    }

    await Promise.allSettled(rewardRecords);
  }

  private async awardCandidate(
    candidate: RewardCandidate,
    context: RewardComputationContext,
    points: number,
    debug: { score: number; multiplier: number; ownershipFactor: number; netShares: number; bonusType: string }
  ): Promise<void> {
    const amount = Number(points.toFixed(4));

    const bonusTypeLabel = debug.bonusType === 'FULL' ? 'Team Match Bonus' 
      : debug.bonusType === 'PARTICIPATION' ? 'Participation Bonus' 
      : 'Generic Bonus';

    await this.pointsService.recordEvent({
      address: candidate.userAddress,
      source: PointEventSource.TOPSHOT,
      amount,
      reference: `topshot:${context.marketId}:${candidate.momentId}`,
      notes: `${bonusTypeLabel}: ${candidate.playerName ?? candidate.playerId ?? "Unknown"}`,
    });

    await this.prisma.topShotReward.create({
      data: {
        lockId: candidate.lockId,
        userAddress: candidate.userAddress,
        marketId: context.marketId,
        eventId: context.eventId,
        outcomeIndex: context.outcomeIndex,
        momentId: candidate.momentId,
        points: new Prisma.Decimal(amount),
        metadata: {
          playerId: candidate.playerId,
          playerName: candidate.playerName,
          rarity: candidate.rarity,
          score: debug.score,
          multiplier: debug.multiplier,
          ownershipFactor: debug.ownershipFactor,
          netShares: debug.netShares,
          bonusType: debug.bonusType,
        },
      },
    });

    await this.markLock(candidate.lockId, MomentLockStatus.RELEASED);
  }

  private async markLock(lockId: string, status: MomentLockStatus): Promise<void> {
    await this.prisma.topShotMomentLock.update({
      where: { id: lockId },
      data: {
        status,
        releasedAt: new Date(),
      },
    });
  }

  private async fetchPlayerStatsFromNBA(gameDate: string): Promise<PlayerPerformance[]> {
    if (!this.nbaStats.isEnabled()) {
      this.logger.warn("NBA Stats API not configured, falling back to oracle data");
      return [];
    }

    try {
      const stats = await this.nbaStats.getStatsByDate(gameDate);
      
      return stats.map((stat) => ({
        playerId: stat.playerId.toString(),
        playerName: stat.playerName,
        teamName: stat.teamName,
        points: stat.points,
        rebounds: stat.rebounds,
        assists: stat.assists,
        steals: stat.steals,
        blocks: stat.blocks,
        plusMinus: stat.plusMinus || 0,
        minutes: this.parseMinutes(stat.minutes),
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch NBA stats for ${gameDate}: ${(error as Error).message}`);
      return [];
    }
  }

  private parseMinutes(minutesStr: string | null): number {
    if (!minutesStr) {
      return 0;
    }
    const parsed = parseFloat(minutesStr);
    return isNaN(parsed) ? 0 : parsed;
  }

  private toCandidate(lock: PrismaTopShotMomentLock): RewardCandidate {
    return {
      lockId: lock.id,
      userAddress: lock.userAddress,
      momentId: lock.momentId,
      rarity: (lock.rarity as TopShotMomentTier) ?? "Unknown",
      playerId: lock.playerId ?? undefined,
      playerName: lock.playerName ?? undefined,
      teamName: lock.teamName ?? undefined,
      estimatedReward: lock.estimatedReward ? Number(lock.estimatedReward) : undefined,
    } satisfies RewardCandidate;
  }

  private normalizePlayerStats(raw: unknown): PlayerPerformance[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const record = entry as Record<string, unknown>;
        const playerId = this.toString(record.playerId ?? record.id);
        const playerName = this.toString(record.playerName ?? record.name);
        
        if (!playerId || !playerName) {
          return [];
        }
        
        const teamName = this.toString(record.teamName ?? record.team);
        return [{
          playerId,
          playerName,
          teamName,
          points: this.toNumber(record.points),
          rebounds: this.toNumber(record.rebounds),
          assists: this.toNumber(record.assists),
          steals: this.toNumber(record.steals),
          blocks: this.toNumber(record.blocks),
          plusMinus: this.toNumber(record.plusMinus),
          minutes: this.toNumber(record.minutes),
        } satisfies PlayerPerformance];
      });
  }

  private async resolveWinningOutcome(marketId: string, resolvedOutcomeId: string): Promise<{ index: number; type: "home" | "away" | "draw" | "cancel"; team?: string }> {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: { outcomes: true },
    });

    if (!market) {
      throw new Error(`Market ${marketId} not found`);
    }

    const index = market.outcomes.findIndex((outcome) => outcome.id === resolvedOutcomeId);
    if (index < 0) {
      throw new Error(`Outcome ${resolvedOutcomeId} not part of market ${marketId}`);
    }

    const metadata = market.outcomes[index].metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return { index, type: "cancel" };
    }
    
    const record = metadata as Record<string, unknown>;
    const value = record.type;
    const team = typeof record.team === 'string' ? record.team : undefined;
    
    if (value === "home" || value === "away" || value === "draw" || value === "cancel") {
      return { index, type: value, team };
    }
    return { index, type: "cancel", team };
  }

  private pickPerformance(stats: PlayerPerformance[], candidate: RewardCandidate): PlayerPerformance | null {
    if (!stats.length) {
      return null;
    }

    if (candidate.playerId) {
      const byId = stats.find((entry) => entry.playerId === candidate.playerId);
      if (byId) {
        return byId;
      }
    }

    if (candidate.playerName) {
      const normalized = this.normalizeName(candidate.playerName);
      const byName = stats.find((entry) => this.normalizeName(entry.playerName ?? "") === normalized);
      if (byName) {
        return byName;
      }
    }

    if (candidate.teamName) {
      const normalizedTeam = this.normalizeTeam(candidate.teamName);
      const fallback = stats.find((entry) => this.normalizeTeam(entry.teamName ?? "") === normalizedTeam);
      if (fallback) {
        return fallback;
      }
    }

    return null;
  }

  private computePerformanceScore(perf: PlayerPerformance): number {
    const points = perf.points ?? 0;
    const rebounds = perf.rebounds ?? 0;
    const assists = perf.assists ?? 0;
    const steals = perf.steals ?? 0;
    const blocks = perf.blocks ?? 0;
    const plusMinus = perf.plusMinus ?? 0;

    const raw = points + 0.7 * rebounds + 0.7 * assists + 1.2 * steals + 1.2 * blocks + 0.2 * plusMinus;
    return Math.max(raw, 0);
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
        return 80;
    }
  }

  private groupByPlayer(lockers: RewardCandidate[]): Map<string, RewardCandidate[]> {
    const map = new Map<string, RewardCandidate[]>();
    for (const candidate of lockers) {
      const key = candidate.playerId ?? candidate.playerName ?? candidate.momentId;
      const list = map.get(key) ?? [];
      list.push(candidate);
      map.set(key, list);
    }
    return map;
  }

  private async resolveNetShares(marketId: string, address: string, outcomeIndex: number): Promise<number> {
    const trades = await this.prisma.marketTrade.findMany({
      where: {
        marketId,
        outcomeIndex,
        signer: address,
      },
    });

    let net = 0;
    for (const trade of trades) {
      const shares = trade.shares instanceof Prisma.Decimal ? trade.shares.toNumber() : Number(trade.shares);
      net += trade.isBuy ? shares : -shares;
    }

    return net;
  }

  private async hasRecentActivity(address: string): Promise<boolean> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trade = await this.prisma.marketTrade.findFirst({
      where: {
        signer: address,
        createdAt: {
          gte: since,
        },
      },
    });
    return Boolean(trade);
  }

  private async getRemainingDailyCap(address: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

    const rewards = await this.prisma.topShotReward.findMany({
      where: {
        userAddress: address,
        awardedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const spent = rewards.reduce((acc, entry) => acc + Number(entry.points), 0);
    const cap = 300;
    return Math.max(0, cap - spent);
  }

  private normalizeName(value: string): string {
    return value.toLowerCase().replace(/[^a-z]/g, "");
  }

  private normalizeTeam(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private toString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }
}
