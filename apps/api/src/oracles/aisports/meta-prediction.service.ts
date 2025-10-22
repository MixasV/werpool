import { randomUUID } from "crypto";
import * as path from "path";

import { Injectable, Inject } from "@nestjs/common";

import { AiSportsFlowService } from "../../flow/aisports-flow.service";
import { LmsrService } from "../../markets/lmsr/lmsr.service";
import { LmsrState } from "../../markets/lmsr/lmsr.types";
import { AiSportsTransactionProvider } from "../../aisports/transaction/transaction-provider.interface";
import {
  AiSportsMarketCategory,
  AiSportsMarketType,
  AiSportsTournamentStats,
  AiSportsUserData,
  AiSportsLeaderboardEntry,
  MetaMarketExecutionResult,
  MetaMarketOutcome,
  MetaMarketPoolState,
  MetaMarketQuote,
  MetaMarketTrade,
  MetaPredictionMarket,
} from "../../types/aisports.types";
import {
  MetaMarketStore,
  PersistedMarketSnapshot,
  PersistedMetaSnapshot,
  PersistedTradeSnapshot,
} from "./meta-market.store";

type MarketGenerator = () => Promise<MetaPredictionMarket>;

interface MarketRecord {
  market: MetaPredictionMarket;
  trades: MetaMarketTrade[];
}

@Injectable()
export class MetaPredictionService {
  private readonly marketRecords = new Map<string, MarketRecord>();
  private readonly store: MetaMarketStore;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly flowService: AiSportsFlowService,
    private readonly lmsr: LmsrService,
    @Inject('AISPORTS_TX_PROVIDER')
    private readonly txProvider: AiSportsTransactionProvider
  ) {
    const storagePath = process.env.AISPORTS_META_STORE_PATH?.trim();
    const resolvedPath =
      storagePath && storagePath.length > 0
        ? storagePath
        : path.resolve(process.cwd(), "data/aisports-meta.json");
    this.store = new MetaMarketStore(resolvedPath);
  }

  async ensureSeedMarkets(): Promise<void> {
    await this.ensureLoaded();
    if (!this.flowService.isEnabled() || this.marketRecords.size > 0) {
      return;
    }

    const generators: MarketGenerator[] = [
      () => this.createAverageScoreMarket(45),
      () => this.createCommunityMarket("participants", 200),
      () => this.createNftPerformanceMarket(),
    ];

    for (const generate of generators) {
      try {
        const market = await generate();
        this.marketRecords.set(market.id, { market, trades: [] });
      } catch (error) {
        // silently skip failing seed to avoid bringing down API
      }
    }
  }

  async createAverageScoreMarket(targetScore: number): Promise<MetaPredictionMarket> {
    await this.ensureLoaded();
    const stats = await this.safeTournamentStats();
    const id = `aisports:avg-score:${targetScore}:${Date.now()}`;

    const market = this.buildMarket({
      id,
      title: `Will the average fantasy score exceed ${targetScore}?`,
      description: `Current value: ${stats.averageScore.toFixed(1)}. Data provided by aiSports Escrow`,
      category: "aiSports_Meta",
      type: "yes_no",
      oracle: {
        dataSource: "aiSports.tournament.averageScore",
        targetValue: targetScore,
        comparisonType: "greater_than",
        resolutionFunction: "resolveAverageScoreMarket",
      },
      currentValue: stats.averageScore,
      participants: stats.totalParticipants,
      access: {
        requiresActiveParticipation: true,
      },
      resolutionOffsetHours: 24,
    });

    this.marketRecords.set(market.id, { market, trades: [] });
    await this.persist();
    return market;
  }

  async createUserPerformanceMarket(
    username: string,
    address: string,
    timeframe: "daily" | "weekly" = "weekly"
  ): Promise<MetaPredictionMarket> {
    await this.ensureLoaded();
    const user = await this.flowService.getUserData(address);
    const targetPercent = timeframe === "daily" ? 20 : 10;
    const resolutionOffsetHours = timeframe === "daily" ? 24 : 168;

    const market = this.buildMarket({
      id: `aisports:user:${username}:${Date.now()}`,
      title: `Will @${username} reach the top ${targetPercent}% within the ${timeframe === "daily" ? "day" : "week"}?`,
      description: `Current fantasy score: ${user.fantasyScore.toFixed(1)}. Source: aiSports leaderboard`,
      category: "aiSports_User_Performance",
      type: "yes_no",
      oracle: {
        dataSource: "aiSports.leaderboard.position",
        targetValue: targetPercent,
        comparisonType: "top_percentage",
        resolutionFunction: "resolveUserPerformanceMarket",
      },
      currentValue: user.fantasyScore,
      access: {
        minimumFantasyScore: 20,
      },
      resolutionOffsetHours,
    });

    this.marketRecords.set(market.id, { market, trades: [] });
    await this.persist();
    return market;
  }

  async createNftPerformanceMarket(): Promise<MetaPredictionMarket> {
    await this.ensureLoaded();
    const market = this.buildMarket({
      id: `aisports:nft-performance:${Date.now()}`,
      title: "Will rare aiSports NFTs provide an advantage today?",
      description: "Comparing average fantasy score of Epic/Legendary holders versus others",
      category: "aiSports_NFT",
      type: "yes_no",
      oracle: {
        dataSource: "aiSports.nft.performance",
        comparisonType: "greater_than",
        resolutionFunction: "resolveNftPerformanceMarket",
      },
      currentValue: 0,
      access: {
        requiredNftRarity: ["Common", "Uncommon", "Rare", "Epic", "Legendary"],
      },
      resolutionOffsetHours: 24,
    });

    this.marketRecords.set(market.id, { market, trades: [] });
    await this.persist();
    return market;
  }

  async createCommunityMarket(
    metric: "participants" | "prize_pool" | "juice_distribution",
    targetValue: number
  ): Promise<MetaPredictionMarket> {
    await this.ensureLoaded();
    const stats = await this.safeTournamentStats();
    const metricLabel: Record<typeof metric, string> = {
      participants: "Total participants",
      prize_pool: "Prize pool size",
      juice_distribution: "$JUICE distribution",
    } as const;

    const currentValue =
      metric === "participants"
        ? stats.totalParticipants
        : metric === "prize_pool"
        ? stats.currentPrizePool
        : stats.averageScore;

    const market = this.buildMarket({
      id: `aisports:community:${metric}:${Date.now()}`,
      title: `Will ${metricLabel[metric]} exceed ${targetValue}?`,
      description: `Current value: ${currentValue}. Updated every 24 hours`,
      category: "aiSports_Community",
      type: "yes_no",
      oracle: {
        dataSource: `aiSports.community.${metric}`,
        targetValue,
        comparisonType: "greater_than",
        resolutionFunction: "resolveCommunityMarket",
      },
      currentValue: Number(currentValue) || 0,
      access: {},
      participants: stats.totalParticipants,
      resolutionOffsetHours: 24,
    });

    this.marketRecords.set(market.id, { market, trades: [] });
    await this.persist();
    return market;
  }

  async getMarkets(): Promise<MetaPredictionMarket[]> {
    await this.ensureSeedMarkets();
    return Array.from(this.marketRecords.values()).map((record) => this.cloneMarket(record.market));
  }

  async getMarket(id: string): Promise<MetaPredictionMarket | undefined> {
    await this.ensureSeedMarkets();
    const record = this.marketRecords.get(id);
    return record ? this.cloneMarket(record.market) : undefined;
  }

  async getMarketsForUser(address: string): Promise<MetaPredictionMarket[]> {
    if (!this.flowService.isEnabled()) {
      return [];
    }

    const [markets, user] = await Promise.all([
      this.getMarkets(),
      this.flowService.getUserData(address),
    ]);

    return markets.filter((market) => this.hasAccess(market, user));
  }

  async getUserSnapshot(address: string): Promise<AiSportsUserData> {
    return this.flowService.getUserData(address);
  }

  async updateMarket(id: string, patch: Partial<MetaPredictionMarket>): Promise<MetaPredictionMarket | undefined> {
    await this.ensureLoaded();
    const record = this.marketRecords.get(id);
    if (!record) {
      return undefined;
    }

    const next: MetaPredictionMarket = {
      ...record.market,
      ...patch,
      currentData: {
        ...record.market.currentData,
        ...(patch.currentData ?? {}),
        lastUpdate: patch.currentData?.lastUpdate ?? new Date(),
      },
      poolState: patch.poolState ?? record.market.poolState,
      tradeVolume: patch.tradeVolume ?? record.market.tradeVolume,
      tradeCount: patch.tradeCount ?? record.market.tradeCount,
      yesPrice: patch.yesPrice ?? record.market.yesPrice,
      noPrice: patch.noPrice ?? record.market.noPrice,
      lastTradeAt: patch.lastTradeAt ?? record.market.lastTradeAt,
    };

    this.marketRecords.set(id, { market: next, trades: record.trades });
    await this.persist();
    return this.cloneMarket(next);
  }

  async quoteTrade(
    marketId: string,
    outcome: MetaMarketOutcome,
    shares: number
  ): Promise<MetaMarketQuote> {
    await this.ensureLoaded();
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new Error("Shares must be a positive number");
    }

    await this.ensureSeedMarkets();
    const record = this.getRecordOrThrow(marketId);
    const outcomeIndex = outcome === "YES" ? 0 : 1;
    const quote = this.lmsr.quoteTrade(this.toLmsrState(record.market.poolState), {
      outcomeIndex,
      shares,
      isBuy: true,
    });

    const poolState: MetaMarketPoolState = {
      liquidityParameter: record.market.poolState.liquidityParameter,
      bVector: quote.newBVector,
      outcomeSupply: quote.newOutcomeSupply,
      totalLiquidity: quote.newTotalLiquidity,
    };

    return {
      marketId,
      outcome,
      shares,
      flowAmount: this.round(quote.flowAmount),
      price: shares > 0 ? this.round(quote.flowAmount / shares) : 0,
      probabilities: quote.probabilities,
      poolState: this.clonePoolState(poolState),
    };
  }

  async executeTrade(
    marketId: string,
    outcome: MetaMarketOutcome,
    shares: number,
    signer: string | null
  ): Promise<MetaMarketExecutionResult> {
    await this.ensureLoaded();
    const quote = await this.quoteTrade(marketId, outcome, shares);
    const record = this.getRecordOrThrow(marketId);
    const now = new Date();

    const appliedPoolState = this.clonePoolState(quote.poolState);

    const updatedMarket: MetaPredictionMarket = {
      ...record.market,
      poolState: appliedPoolState,
      currentData: {
        ...record.market.currentData,
        lastUpdate: now,
      },
      tradeVolume: this.round(record.market.tradeVolume + quote.flowAmount),
      tradeCount: record.market.tradeCount + 1,
      yesPrice: this.round(quote.probabilities[0] ?? record.market.yesPrice),
      noPrice: this.round(quote.probabilities[1] ?? record.market.noPrice),
      lastTradeAt: now,
    };

    let txResult;
    try {
      txResult = await this.txProvider.betWithJuice({
        marketId,
        outcome,
        amount: quote.flowAmount,
        signer: signer || 'anonymous',
      });
    } catch (error) {
      throw new Error(`Transaction failed: ${(error as Error).message}`);
    }

    const trade: MetaMarketTrade = {
      id: randomUUID(),
      marketId,
      outcome,
      shares,
      flowAmount: quote.flowAmount,
      isBuy: true,
      price: quote.price,
      signer: signer ?? null,
      createdAt: now,
      probabilities: [...quote.probabilities],
      txId: txResult.txId,
      txStatus: txResult.status,
    };

    const trades = [...record.trades, trade];
    const trimmed = trades.slice(-50);
    this.marketRecords.set(marketId, { market: updatedMarket, trades: trimmed });

    await this.persist();

    return {
      market: this.cloneMarket(updatedMarket),
      quote: { ...quote, poolState: this.clonePoolState(quote.poolState) },
      trade,
      txResult: {
        txId: txResult.txId,
        status: txResult.status,
        timestamp: txResult.timestamp,
        blockHeight: txResult.blockHeight,
      },
    };
  }

  async listTrades(marketId: string, limit = 50): Promise<MetaMarketTrade[]> {
    await this.ensureLoaded();
    await this.ensureSeedMarkets();
    const record = this.getRecordOrThrow(marketId);
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
    return record.trades.slice(-normalizedLimit).map((trade) => ({ ...trade }));
  }

  async getLeaderboard(limit = 20): Promise<AiSportsLeaderboardEntry[]> {
    await this.ensureLoaded();
    await this.ensureSeedMarkets();
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const totals = new Map<string, number>();

    for (const { trades } of this.marketRecords.values()) {
      for (const trade of trades) {
        if (!trade.signer) {
          continue;
        }
        const current = totals.get(trade.signer) ?? 0;
        totals.set(trade.signer, this.round(current + trade.flowAmount));
      }
    }

    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);

    const entries = sorted.slice(0, normalizedLimit).map(([address, score], index) => ({
      address,
      score: this.round(score),
      rank: index + 1,
    }));

    if (entries.length > 0) {
      return entries;
    }

    // Fallback when no trades are available yet
    return this.getSyntheticLeaderboard(normalizedLimit);
  }

  private buildMarket(options: {
    id: string;
    title: string;
    description: string;
    category: AiSportsMarketCategory;
    type: AiSportsMarketType;
    oracle: MetaPredictionMarket["oracleConfig"];
    currentValue: number;
    access: MetaPredictionMarket["accessRequirements"];
    resolutionOffsetHours: number;
    participants?: number;
  }): MetaPredictionMarket {
    const now = Date.now();
    const poolState = this.createInitialPoolState();
    const probabilities = this.computeProbabilities(poolState);

    return {
      id: options.id,
      title: options.title,
      description: options.description,
      category: options.category,
      type: options.type,
      resolutionTime: new Date(now + options.resolutionOffsetHours * 60 * 60 * 1000),
      createdAt: new Date(now),
      isActive: true,
      isResolved: false,
      oracleConfig: options.oracle,
      currentData: {
        value: options.currentValue,
        participants: options.participants,
        timeRemaining: `${options.resolutionOffsetHours}h`,
        lastUpdate: new Date(now),
      },
      accessRequirements: options.access,
      poolState,
      tradeVolume: 0,
      tradeCount: 0,
      yesPrice: this.round(probabilities[0] ?? 0.5),
      noPrice: this.round(probabilities[1] ?? 0.5),
      lastTradeAt: undefined,
    };
  }

  private getRecordOrThrow(id: string): MarketRecord {
    const record = this.marketRecords.get(id);
    if (!record) {
      throw new Error(`Meta market ${id} not found`);
    }
    return record;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (!this.loadPromise) {
      this.loadPromise = this.loadFromStore();
    }

    await this.loadPromise;
  }

  private async loadFromStore(): Promise<void> {
    try {
      const snapshot = await this.store.load();
      this.marketRecords.clear();

      if (snapshot && Array.isArray(snapshot.markets)) {
        for (const persisted of snapshot.markets) {
          const market = this.fromPersistedMarket(persisted);
          const trades = (snapshot.trades?.[market.id] ?? []).map((entry) =>
            this.fromPersistedTrade(entry)
          );
          this.marketRecords.set(market.id, { market, trades });
        }
      }
    } finally {
      this.loaded = true;
      this.loadPromise = null;
    }
  }

  private async persist(): Promise<void> {
    if (!this.loaded) {
      return;
    }

    const markets = Array.from(this.marketRecords.values()).map((record) =>
      this.toPersistedMarket(record.market)
    );

    const tradesEntries = Array.from(this.marketRecords.entries()).reduce<
      PersistedMetaSnapshot["trades"]
    >((acc, [marketId, record]) => {
      acc[marketId] = record.trades.map((trade) => this.toPersistedTrade(trade));
      return acc;
    }, {} as PersistedMetaSnapshot["trades"]);

    const snapshot: PersistedMetaSnapshot = {
      version: 0,
      updatedAt: new Date().toISOString(),
      markets,
      trades: tradesEntries,
    };

    await this.store.save(snapshot);
  }

  private toPersistedMarket(market: MetaPredictionMarket): PersistedMarketSnapshot {
    return {
      id: market.id,
      title: market.title,
      description: market.description,
      category: market.category,
      type: market.type,
      resolutionTime: market.resolutionTime.toISOString(),
      createdAt: market.createdAt.toISOString(),
      isActive: market.isActive,
      isResolved: market.isResolved,
      outcome: market.outcome ?? null,
      oracleConfig: { ...market.oracleConfig },
      currentData: {
        value: market.currentData.value,
        participants: market.currentData.participants,
        timeRemaining: market.currentData.timeRemaining,
        lastUpdate: market.currentData.lastUpdate.toISOString(),
      },
      accessRequirements: {
        ...market.accessRequirements,
        requiredNftRarity: market.accessRequirements.requiredNftRarity
          ? [...market.accessRequirements.requiredNftRarity]
          : undefined,
      },
      poolState: {
        liquidityParameter: market.poolState.liquidityParameter,
        bVector: [...market.poolState.bVector],
        outcomeSupply: [...market.poolState.outcomeSupply],
        totalLiquidity: market.poolState.totalLiquidity,
      },
      tradeVolume: market.tradeVolume,
      tradeCount: market.tradeCount,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      lastTradeAt: market.lastTradeAt ? market.lastTradeAt.toISOString() : null,
    };
  }

  private fromPersistedMarket(persisted: PersistedMarketSnapshot): MetaPredictionMarket {
    return {
      id: persisted.id,
      title: persisted.title,
      description: persisted.description,
      category: persisted.category as AiSportsMarketCategory,
      type: persisted.type as AiSportsMarketType,
      resolutionTime: new Date(persisted.resolutionTime),
      createdAt: new Date(persisted.createdAt),
      isActive: persisted.isActive,
      isResolved: persisted.isResolved,
      outcome: persisted.outcome ?? undefined,
      oracleConfig: { ...persisted.oracleConfig },
      currentData: {
        value: persisted.currentData.value,
        participants: persisted.currentData.participants,
        timeRemaining: persisted.currentData.timeRemaining,
        lastUpdate: new Date(persisted.currentData.lastUpdate),
      },
      accessRequirements: {
        ...persisted.accessRequirements,
        requiredNftRarity: persisted.accessRequirements?.requiredNftRarity
          ? [...persisted.accessRequirements.requiredNftRarity]
          : undefined,
      },
      poolState: {
        liquidityParameter: persisted.poolState.liquidityParameter,
        bVector: [...persisted.poolState.bVector],
        outcomeSupply: [...persisted.poolState.outcomeSupply],
        totalLiquidity: persisted.poolState.totalLiquidity,
      },
      tradeVolume: persisted.tradeVolume,
      tradeCount: persisted.tradeCount,
      yesPrice: persisted.yesPrice,
      noPrice: persisted.noPrice,
      lastTradeAt: persisted.lastTradeAt ? new Date(persisted.lastTradeAt) : undefined,
    };
  }

  private toPersistedTrade(trade: MetaMarketTrade): PersistedTradeSnapshot {
    return {
      id: trade.id,
      marketId: trade.marketId,
      outcome: trade.outcome,
      shares: trade.shares,
      flowAmount: trade.flowAmount,
      isBuy: trade.isBuy,
      price: trade.price,
      signer: trade.signer,
      createdAt: trade.createdAt.toISOString(),
      probabilities: [...trade.probabilities],
    };
  }

  private fromPersistedTrade(trade: PersistedTradeSnapshot): MetaMarketTrade {
    return {
      id: trade.id,
      marketId: trade.marketId,
      outcome: trade.outcome,
      shares: trade.shares,
      flowAmount: trade.flowAmount,
      isBuy: trade.isBuy,
      price: trade.price,
      signer: trade.signer,
      createdAt: new Date(trade.createdAt),
      probabilities: Array.isArray(trade.probabilities)
        ? [...trade.probabilities]
        : [],
    };
  }

  private createInitialPoolState(): MetaMarketPoolState {
    return {
      liquidityParameter: 120,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
      totalLiquidity: 0,
    };
  }

  private computeProbabilities(pool: MetaMarketPoolState): number[] {
    const scaled = pool.bVector.map((value) => value / (pool.liquidityParameter || 1));
    const max = Math.max(...scaled);
    const exps = scaled.map((value) => Math.exp(value - max));
    const sum = exps.reduce((acc, current) => acc + current, 0);
    if (sum === 0) {
      const uniform = 1 / pool.bVector.length;
      return pool.bVector.map(() => uniform);
    }
    return exps.map((value) => value / sum);
  }

  private toLmsrState(pool: MetaMarketPoolState): LmsrState {
    return {
      liquidityParameter: pool.liquidityParameter,
      bVector: [...pool.bVector],
      outcomeSupply: [...pool.outcomeSupply],
      totalLiquidity: pool.totalLiquidity,
    };
  }

  private clonePoolState(pool: MetaMarketPoolState): MetaMarketPoolState {
    return {
      liquidityParameter: pool.liquidityParameter,
      bVector: [...pool.bVector],
      outcomeSupply: [...pool.outcomeSupply],
      totalLiquidity: pool.totalLiquidity,
    };
  }

  private cloneMarket(market: MetaPredictionMarket): MetaPredictionMarket {
    return {
      ...market,
      poolState: this.clonePoolState(market.poolState),
      currentData: { ...market.currentData },
    };
  }

  private getSyntheticLeaderboard(limit: number): AiSportsLeaderboardEntry[] {
    const markets = Array.from(this.marketRecords.values()).map((record) => record.market);
    if (markets.length === 0) {
      return [];
    }

    const synthetic = markets
      .map((market, index) => {
        const baseScore = Math.max(0, Number(market.currentData.value) || 0);
        const modifier = market.currentData.participants ? Math.log10(market.currentData.participants + 10) : 1;
        const score = this.round(baseScore * modifier);
        const address = `0xmeta${(index + 1).toString(16).padStart(4, "0")}`;
        return { address, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry, index) => ({
        address: entry.address,
        score: entry.score,
        rank: index + 1,
      }));

    return synthetic;
  }

  private round(value: number): number {
    return Math.round(value * 1e8) / 1e8;
  }

  private async safeTournamentStats(): Promise<AiSportsTournamentStats> {
    try {
      return await this.flowService.getTournamentStats();
    } catch {
      return {
        totalParticipants: 0,
        currentPrizePool: 0,
        averageScore: 0,
        activeContests: 0,
        timestamp: new Date(),
      };
    }
  }

  private hasAccess(market: MetaPredictionMarket, user: AiSportsUserData): boolean {
    const requirements = market.accessRequirements;

    if (requirements.minimumFantasyScore && user.fantasyScore < requirements.minimumFantasyScore) {
      return false;
    }

    if (requirements.minimumJuiceBalance && user.juiceBalance < requirements.minimumJuiceBalance) {
      return false;
    }

    if (requirements.requiredNftRarity && requirements.requiredNftRarity.length > 0) {
      const hasRequired = user.nfts.some((nft) => requirements.requiredNftRarity!.includes(nft.rarity));
      if (!hasRequired) {
        return false;
      }
    }

    if (requirements.requiresActiveParticipation) {
      const isActive =
        user.fantasyScore > 0 || user.juiceBalance > 0 || (user.nfts?.length ?? 0) > 0;
      if (!isActive) {
        return false;
      }
    }

    return true;
  }
}
