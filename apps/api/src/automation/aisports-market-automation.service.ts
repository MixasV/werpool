import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { MarketsService } from "../markets/markets.service";
import { MetaPredictionService } from "../oracles/aisports/meta-prediction.service";
import { AiSportsFlowService } from "../flow/aisports-flow.service";
import { MetaPredictionMarket } from "../types/aisports.types";

interface SupportedMetaMarket {
  id: string;
  market: MetaPredictionMarket;
}

@Injectable()
export class AiSportsMarketAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiSportsMarketAutomationService.name);
  private readonly enabled = this.resolveEnabledFlag();
  private readonly intervalMs = this.resolveIntervalMs();
  private readonly liquidityTotal = 1200;
  private readonly disputeWindowHours = 6;

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketsService: MarketsService,
    private readonly metaPrediction: MetaPredictionService,
    private readonly flowService: AiSportsFlowService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log("AiSports automation disabled via configuration");
      return;
    }

    if (!this.flowService.isEnabled()) {
      this.logger.warn("AiSports integration disabled; automation will stay idle");
      return;
    }

    await this.safeRunCycle("startup");

    this.timer = setInterval(() => {
      void this.safeRunCycle("interval");
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveEnabledFlag(): boolean {
    return (process.env.AISPORTS_MARKET_AUTOMATION_ENABLED ?? "true").toLowerCase() !== "false";
  }

  private resolveIntervalMs(): number {
    const fallback = 60 * 60 * 1000;
    const raw = process.env.AISPORTS_MARKET_AUTOMATION_INTERVAL_MS;
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private async safeRunCycle(reason: string): Promise<void> {
    if (this.running) {
      this.logger.warn(`Skipping aiSports automation cycle (${reason}), previous run still in progress`);
      return;
    }

    this.running = true;
    try {
      await this.runCycle();
    } catch (error) {
      const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(`AiSports automation cycle failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async runCycle(): Promise<void> {
    const supported = await this.collectSupportedMetaMarkets();
    if (supported.length === 0) {
      return;
    }

    await this.ensureMarkets(supported);
    await this.resolveMarkets();
  }

  private async collectSupportedMetaMarkets(): Promise<SupportedMetaMarket[]> {
    await this.metaPrediction.ensureSeedMarkets();
    let markets = await this.metaPrediction.getMarkets();
    const now = Date.now();

    let upcoming = markets
      .filter((market) => market.isActive && market.resolutionTime.getTime() > now)
      .filter((market) => this.isSupported(market));

    if (upcoming.length === 0) {
      await this.createRollingMetaMarkets();
      markets = await this.metaPrediction.getMarkets();
      upcoming = markets
        .filter((market) => market.isActive && market.resolutionTime.getTime() > now)
        .filter((market) => this.isSupported(market));
    }

    return upcoming.map((market) => ({ id: market.id, market }));
  }

  private isSupported(market: MetaPredictionMarket): boolean {
    const source = market.oracleConfig.dataSource;
    return (
      source === "aiSports.tournament.averageScore" ||
      source === "aiSports.community.participants" ||
      source === "aiSports.community.prize_pool"
    );
  }

  private async ensureMarkets(supported: SupportedMetaMarket[]): Promise<void> {
    const now = new Date();
    for (const entry of supported) {
      const slug = this.buildMarketSlug(entry.id);
      const existing = await this.prisma.market.findUnique({ where: { slug } });
      if (existing) {
        continue;
      }

      await this.createMarketFromMeta(entry.market, now);
    }
  }

  private async createMarketFromMeta(metaMarket: MetaPredictionMarket, now: Date): Promise<void> {
    const slug = this.buildMarketSlug(metaMarket.id);
    const schedule = this.buildSchedule(metaMarket, now);
    const yesProbability = this.clampProbability(metaMarket.yesPrice ?? 0.5);
    const normalizedNo = this.clampProbability(1 - yesProbability);

    await this.marketsService.create({
      slug,
      title: `aiSports: ${metaMarket.title}`,
      description: `${metaMarket.description}\nResolution source: ${metaMarket.oracleConfig.dataSource}`,
      category: "custom",
      tags: [
        "aisports",
        "auto",
        "meta",
        `meta:${metaMarket.id}`,
      ],
      oracleId: `oracle:aisports:${this.slugify(metaMarket.id)}`,
      state: "draft",
      closeAt: schedule.closeAt.toISOString(),
      schedule: {
        scheduledStartAt: schedule.openAt.toISOString(),
        tradingLockAt: schedule.lockAt.toISOString(),
        freezeWindowStartAt: schedule.freezeStart.toISOString(),
        freezeWindowEndAt: schedule.freezeEnd.toISOString(),
      },
      patrolThreshold: 2,
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: this.liquidityTotal,
        feeBps: 50,
        providerCount: 3,
      },
      outcomes: [
        {
          label: "Yes",
          impliedProbability: yesProbability,
          liquidity: this.liquidityTotal / 2,
          metadata: {
            type: "yes",
            metaMarketId: metaMarket.id,
          },
        },
        {
          label: "No",
          impliedProbability: normalizedNo,
          liquidity: this.liquidityTotal / 2,
          metadata: {
            type: "no",
            metaMarketId: metaMarket.id,
          },
        },
      ],
      workflow: [
        {
          type: "custom",
          status: "executed",
          description: "Auto-created aiSports meta market",
          metadata: {
            metaMarketId: metaMarket.id,
            resolutionTime: metaMarket.resolutionTime.toISOString(),
            oracle: metaMarket.oracleConfig,
          },
        },
        {
          type: "settle",
          status: "pending",
          description: "Resolve via aiSports Flow metrics",
          triggersAt: schedule.freezeEnd.toISOString(),
          metadata: {
            metaMarketId: metaMarket.id,
            disputeWindowHours: this.disputeWindowHours,
          },
        },
      ],
    });

    this.logger.log(`Created aiSports market ${slug}`);
  }

  private async resolveMarkets(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.market.findMany({
      where: {
        category: "CUSTOM",
        slug: { startsWith: "aisports-" },
        state: "CLOSED",
        freezeWindowEndAt: { lte: now },
        settlement: null,
      },
      include: {
        outcomes: true,
      },
    });

    for (const market of candidates) {
      const metaId = this.extractMetaMarketId(market.tags ?? []);
      if (!metaId) {
        continue;
      }

      const metaMarket = await this.metaPrediction.getMarket(metaId);
      if (!metaMarket) {
        this.logger.warn(`Meta market ${metaId} not found for ${market.slug}`);
        continue;
      }

      const evaluation = await this.evaluateMetaMarket(metaMarket);
      if (!evaluation) {
        this.logger.warn(`Unable to resolve ${market.slug}: data not ready yet`);
        continue;
      }

      const mapping = this.mapOutcomes(market.outcomes);
      const winner = evaluation.outcome === "YES" ? mapping.yes : mapping.no;
      if (!winner) {
        this.logger.warn(`No outcome mapping for ${evaluation.outcome} in ${market.slug}`);
        continue;
      }

      await this.metaPrediction.updateMarket(metaMarket.id, {
        isResolved: true,
        isActive: false,
        outcome: evaluation.outcome,
        currentData: {
          value: evaluation.value,
          participants: metaMarket.currentData.participants,
          timeRemaining: "0h",
          lastUpdate: new Date(),
        },
      });

      await this.marketsService.settleMarket(market.id, {
        outcomeId: winner.index + 1,
        resolvedOutcomeId: winner.id,
        txHash: `auto:aisports:${market.slug}:${Date.now()}`,
        notes: evaluation.notes,
      });

      this.logger.log(`Resolved market ${market.slug} with outcome ${evaluation.outcome}`);
    }
  }

  private async evaluateMetaMarket(metaMarket: MetaPredictionMarket): Promise<
    { outcome: "YES" | "NO"; value: number; notes: string }
  > {
    const config = metaMarket.oracleConfig;
    switch (config.dataSource) {
      case "aiSports.tournament.averageScore": {
        const stats = await this.flowService.getTournamentStats({ bypassCache: true });
        const value = stats.averageScore;
        const outcome = this.compare(value, config.targetValue ?? 0, config.comparisonType);
        return {
          outcome,
          value,
          notes: `Average score ${value.toFixed(2)} vs target ${config.targetValue ?? 0}`,
        };
      }
      case "aiSports.community.participants": {
        const stats = await this.flowService.getTournamentStats({ bypassCache: true });
        const value = stats.totalParticipants;
        const outcome = this.compare(value, config.targetValue ?? 0, config.comparisonType);
        return {
          outcome,
          value,
          notes: `Participants ${value} vs target ${config.targetValue ?? 0}`,
        };
      }
      case "aiSports.community.prize_pool": {
        const stats = await this.flowService.getTournamentStats({ bypassCache: true });
        const value = stats.currentPrizePool;
        const outcome = this.compare(value, config.targetValue ?? 0, config.comparisonType ?? "greater_than");
        return {
          outcome,
          value,
          notes: `Prize pool ${value} vs target ${config.targetValue ?? 0}`,
        };
      }
      default:
        return Promise.resolve({ outcome: "NO", value: 0, notes: "Unsupported data source" });
    }
  }

  private compare(value: number, target: number, comparison?: string): "YES" | "NO" {
    switch (comparison) {
      case "less_than":
        return value < target ? "YES" : "NO";
      case "equal_to":
        return value === target ? "YES" : "NO";
      case "top_percentage":
        return value <= target ? "YES" : "NO";
      default:
        return value > target ? "YES" : "NO";
    }
  }

  private mapOutcomes(outcomes: Array<{ id: string; label: string; metadata: Prisma.JsonValue }>): {
    yes: { id: string; index: number } | null;
    no: { id: string; index: number } | null;
  } {
    let yes: { id: string; index: number } | null = null;
    let no: { id: string; index: number } | null = null;

    outcomes.forEach((outcome, index) => {
      if (!outcome.metadata || typeof outcome.metadata !== "object" || Array.isArray(outcome.metadata)) {
        return;
      }
      const type = (outcome.metadata as Record<string, unknown>).type;
      if (type === "yes") {
        yes = { id: outcome.id, index };
      } else if (type === "no") {
        no = { id: outcome.id, index };
      }
    });

    return { yes, no };
  }

  private extractMetaMarketId(tags: string[]): string | null {
    const metaTag = tags.find((tag) => tag.startsWith("meta:"));
    return metaTag ? metaTag.slice(5) : null;
  }

  private buildSchedule(metaMarket: MetaPredictionMarket, now: Date): {
    openAt: Date;
    lockAt: Date;
    closeAt: Date;
    freezeStart: Date;
    freezeEnd: Date;
  } {
    const createdAt = metaMarket.createdAt ?? now;
    const resolution = metaMarket.resolutionTime ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const openDesired = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const openAt = openDesired <= now ? new Date(now.getTime() + 5 * 60 * 1000) : openDesired;
    const lockAt = new Date(resolution.getTime() - 15 * 60 * 1000);
    const closeAt = new Date(resolution.getTime() - 2 * 60 * 1000);
    const freezeStart = new Date(resolution);
    const freezeEnd = new Date(resolution.getTime() + this.disputeWindowHours * 60 * 60 * 1000);

    return {
      openAt,
      lockAt,
      closeAt,
      freezeStart,
      freezeEnd,
    };
  }

  private buildMarketSlug(metaId: string): string {
    return `aisports-${this.slugify(metaId)}`;
  }

  private slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  private clampProbability(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0.5;
    }
    if (value >= 1) {
      return 0.95;
    }
    if (value <= 0.05) {
      return 0.05;
    }
    return Number(value.toFixed(4));
  }

  private async createRollingMetaMarkets(): Promise<void> {
    try {
      await this.metaPrediction.createAverageScoreMarket(45);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create average score meta market: ${message}`);
    }

    try {
      await this.metaPrediction.createCommunityMarket("participants", 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create participants meta market: ${message}`);
    }

    try {
      await this.metaPrediction.createCommunityMarket("prize_pool", 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create prize pool meta market: ${message}`);
    }
  }
}
