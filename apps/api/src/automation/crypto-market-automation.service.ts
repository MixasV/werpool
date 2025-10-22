import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { MarketsService } from "../markets/markets.service";
import { CryptoOracleService } from "../oracles/crypto-oracle.service";

interface CryptoAssetConfig {
  symbol: "BTC" | "ETH" | "SOL" | "FLOW";
  coingeckoId: string;
  binanceSymbol: string;
  displayName: string;
}

interface PriceRange {
  label: string;
  minExclusive?: number;
  minInclusive?: number;
  maxExclusive?: number;
  maxInclusive?: number;
  probability: number;
}

interface ResolvedMarketContext {
  assetSymbol: string;
  targetDate: Date;
}

@Injectable()
export class CryptoMarketAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CryptoMarketAutomationService.name);
  private readonly assets: CryptoAssetConfig[] = [
    {
      symbol: "BTC",
      coingeckoId: "bitcoin",
      binanceSymbol: "BTCUSDT",
      displayName: "Bitcoin",
    },
    {
      symbol: "ETH",
      coingeckoId: "ethereum",
      binanceSymbol: "ETHUSDT",
      displayName: "Ethereum",
    },
    {
      symbol: "SOL",
      coingeckoId: "solana",
      binanceSymbol: "SOLUSDT",
      displayName: "Solana",
    },
    {
      symbol: "FLOW",
      coingeckoId: "flow",
      binanceSymbol: "FLOWUSDT",
      displayName: "Flow",
    },
  ];

  private readonly horizonDays = 2;
  private readonly disputeWindowHours = 6;
  private readonly liquidityTotal = 1600;
  private readonly automationIntervalMs = this.resolveIntervalMs();
  private readonly enabled = this.resolveEnabledFlag();

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketsService: MarketsService,
    private readonly cryptoOracle: CryptoOracleService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log("Crypto automation disabled via configuration");
      return;
    }

    await this.safeRunCycle("startup");

    this.timer = setInterval(() => {
      void this.safeRunCycle("interval");
    }, this.automationIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveEnabledFlag(): boolean {
    return (process.env.CRYPTO_MARKET_AUTOMATION_ENABLED ?? "true").toLowerCase() !== "false";
  }

  private resolveIntervalMs(): number {
    const fallback = 15 * 60 * 1000;
    const envValue = process.env.CRYPTO_MARKET_AUTOMATION_INTERVAL_MS;
    if (!envValue) {
      return fallback;
    }
    const parsed = Number(envValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private async safeRunCycle(reason: string): Promise<void> {
    if (this.running) {
      this.logger.warn(`Skipping crypto automation cycle (${reason}); previous cycle still running`);
      return;
    }

    this.running = true;
    try {
      await this.runCycle();
    } catch (error) {
      const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(`Crypto automation cycle failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async runCycle(): Promise<void> {
    await this.ensureUpcomingMarkets();
    await this.resolveEligibleMarkets();
  }

  private async ensureUpcomingMarkets(): Promise<void> {
    const now = new Date();
    const startOfToday = this.startOfUtcDay(now);

    for (const asset of this.assets) {
      for (let offset = 1; offset <= this.horizonDays; offset += 1) {
        const targetDate = this.addDays(startOfToday, offset);
        await this.ensureMarketForDate(asset, targetDate, now);
      }
    }
  }

  private async ensureMarketForDate(asset: CryptoAssetConfig, targetDate: Date, now: Date): Promise<void> {
    const slug = this.buildMarketSlug(asset.symbol, targetDate);
    const existing = await this.prisma.market.findUnique({ where: { slug } });
    if (existing) {
      return;
    }

    const startOfTarget = this.startOfUtcDay(targetDate);
    const { openAt, tradingLockAt, closeAt, freezeStartAt, freezeEndAt } = this.buildSchedule(startOfTarget, now);

    const { priceUsd, sources } = await this.cryptoOracle.getAggregatedPrice(asset.symbol, {
      allowFallback: true,
    });

    const baselineSnapshot = await this.cryptoOracle.publishComputedQuote({
      assetSymbol: asset.symbol,
      priceUsd,
      sourceTag: "automation:daily-baseline",
      observedAt: now,
      metadata: {
        asset: asset.symbol,
        targetDate: this.formatDate(startOfTarget),
        sources,
      },
    });

    const ranges = this.buildPriceRanges(priceUsd);
    const outcomes = ranges.map((range) => ({
      label: range.label,
      impliedProbability: range.probability,
      liquidity: this.liquidityTotal / ranges.length,
      metadata: {
        minExclusive: range.minExclusive ?? null,
        minInclusive: range.minInclusive ?? null,
        maxExclusive: range.maxExclusive ?? null,
        maxInclusive: range.maxInclusive ?? null,
        asset: asset.symbol,
        targetDate: this.formatDate(startOfTarget),
      },
    }));

    const description =
      `Predict the maximum intraday USD price for ${asset.displayName} on ${this.formatHumanDate(
        startOfTarget
      )}.
Data sources: CoinGecko, Binance. Market auto-settles after ${this.disputeWindowHours}-hour dispute window.`;

    const oracleId = `oracle:crypto:${asset.symbol.toLowerCase()}:daily-high:${this.formatDate(
      startOfTarget
    )}`;

    const tags = [
      "crypto",
      `asset:${asset.symbol.toLowerCase()}`,
      `target:${this.formatDate(startOfTarget)}`,
      "auto",
      "daily-high",
    ];

    await this.marketsService.create({
      slug,
      title: `${asset.displayName} daily high on ${this.formatHumanDate(startOfTarget)}`,
      description,
      category: "crypto",
      tags,
      oracleId,
      state: "draft",
      closeAt: closeAt.toISOString(),
      schedule: {
        scheduledStartAt: openAt.toISOString(),
        tradingLockAt: tradingLockAt.toISOString(),
        freezeWindowStartAt: freezeStartAt.toISOString(),
        freezeWindowEndAt: freezeEndAt.toISOString(),
      },
      patrolThreshold: 2.5,
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: this.liquidityTotal,
        feeBps: 50,
        providerCount: 3,
      },
      outcomes,
      workflow: [
        {
          type: "custom",
          status: "executed",
          description: `Baseline price recorded at ${this.formatPrice(priceUsd)} USD`,
          metadata: {
            snapshotSignature: baselineSnapshot.signature,
            publishedAt: baselineSnapshot.publishedAt,
            sources,
            disputeWindowHours: this.disputeWindowHours,
          },
        },
        {
          type: "settle",
          status: "pending",
          description: "Automated settlement after dispute window",
          triggersAt: freezeEndAt.toISOString(),
          metadata: {
            targetDate: this.formatDate(startOfTarget),
            asset: asset.symbol,
          },
        },
      ],
    });

    this.logger.log(
      `Created market ${slug} for ${asset.symbol} (baseline ${this.formatPrice(priceUsd)} USD)`
    );
  }

  private async resolveEligibleMarkets(): Promise<void> {
    const now = new Date();

    const candidates = await this.prisma.market.findMany({
      where: {
        category: "CRYPTO",
        slug: { startsWith: "crypto-" },
        state: "CLOSED",
        freezeWindowEndAt: { lte: now },
        settlement: null,
      },
      include: {
        outcomes: true,
      },
    });

    for (const market of candidates) {
      const context = this.extractMarketContext(market);
      if (!context) {
        this.logger.warn(`Unable to determine context for market ${market.slug}`);
        continue;
      }

      try {
        const high = await this.computeDailyHigh(context.assetSymbol, context.targetDate);
        const winner = this.selectOutcomeForPrice(market.outcomes, high.priceUsd);
        if (!winner) {
          this.logger.warn(
            `Failed to match outcome for price ${this.formatPrice(high.priceUsd)} USD in market ${market.slug}`
          );
          continue;
        }

        await this.cryptoOracle.publishComputedQuote({
          assetSymbol: context.assetSymbol,
          priceUsd: high.priceUsd,
          observedAt: high.observedAt,
          sourceTag: "automation:daily-high",
          metadata: {
            asset: context.assetSymbol,
            targetDate: this.formatDate(context.targetDate),
            sources: high.sources,
          },
        });

        await this.marketsService.settleMarket(market.id, {
          outcomeId: winner.index + 1,
          resolvedOutcomeId: winner.id,
          txHash: `auto:crypto:${market.slug}:${Date.now()}`,
          notes: `Automated settlement: daily high ${this.formatPrice(high.priceUsd)} USD. Sources: ${high.sources
            .map((source) => source.source)
            .join(", ")}`,
        });

        this.logger.log(
          `Resolved market ${market.slug} with outcome "${winner.label}" (price ${this.formatPrice(
            high.priceUsd
          )} USD)`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to settle market ${market.slug}: ${message}`);
      }
    }
  }

  private extractMarketContext(market: { tags: string[]; slug: string }): ResolvedMarketContext | null {
    const assetTag = market.tags.find((tag) => tag.startsWith("asset:"));
    const targetTag = market.tags.find((tag) => tag.startsWith("target:"));

    if (!assetTag || !targetTag) {
      return null;
    }

    const assetSymbol = assetTag.split(":")[1]?.toUpperCase();
    const isoDate = targetTag.split(":")[1];
    if (!assetSymbol || !isoDate) {
      return null;
    }

    const targetDate = this.parseIsoDate(isoDate);
    if (!targetDate) {
      return null;
    }

    return {
      assetSymbol,
      targetDate,
    };
  }

  private selectOutcomeForPrice(
    outcomes: Array<{ id: string; label: string; metadata: Prisma.JsonValue }>,
    priceUsd: number
  ): { id: string; index: number; label: string } | null {
    for (let index = 0; index < outcomes.length; index += 1) {
      const outcome = outcomes[index];
      const metadata = this.parseOutcomeMetadata(outcome.metadata);
      if (!metadata) {
        continue;
      }

      if (!this.priceWithinRange(priceUsd, metadata)) {
        continue;
      }

      return {
        id: outcome.id,
        index,
        label: outcome.label,
      };
    }

    return null;
  }

  private parseOutcomeMetadata(metadata: Prisma.JsonValue | null | undefined):
    | {
        minExclusive: number | null;
        minInclusive: number | null;
        maxExclusive: number | null;
        maxInclusive: number | null;
      }
    | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as Record<string, unknown>;
    const extract = (key: string): number | null => {
      const value = record[key];
      if (value === null || value === undefined) {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return {
      minExclusive: extract("minExclusive"),
      minInclusive: extract("minInclusive"),
      maxExclusive: extract("maxExclusive"),
      maxInclusive: extract("maxInclusive"),
    };
  }

  private priceWithinRange(
    price: number,
    range: {
      minExclusive: number | null;
      minInclusive: number | null;
      maxExclusive: number | null;
      maxInclusive: number | null;
    }
  ): boolean {
    if (range.minExclusive !== null && price <= range.minExclusive) {
      return false;
    }
    if (range.minInclusive !== null && price < range.minInclusive) {
      return false;
    }
    if (range.maxExclusive !== null && price >= range.maxExclusive) {
      return false;
    }
    if (range.maxInclusive !== null && price > range.maxInclusive) {
      return false;
    }
    return true;
  }

  private async computeDailyHigh(assetSymbol: string, targetDate: Date): Promise<{
    priceUsd: number;
    sources: Array<{ source: string; priceUsd: number; observedAt: string }>;
    observedAt: Date;
  }> {
    const assetConfig = this.assets.find((entry) => entry.symbol === assetSymbol.toUpperCase());
    if (!assetConfig) {
      throw new ServiceUnavailableException(`Unknown crypto asset ${assetSymbol}`);
    }

    const startMs = targetDate.getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
    const sources: Array<{ source: string; priceUsd: number; observedAt: string }> = [];

    const coingeckoHigh = await this.fetchCoingeckoDailyHigh(assetConfig.coingeckoId, startMs, endMs);
    if (coingeckoHigh !== null) {
      sources.push({
        source: "coingecko:daily_high",
        priceUsd: coingeckoHigh,
        observedAt: new Date(endMs).toISOString(),
      });
    }

    const binanceHigh = await this.fetchBinanceDailyHigh(assetConfig.binanceSymbol, startMs, endMs);
    if (binanceHigh !== null) {
      sources.push({
        source: "binance:klines_high",
        priceUsd: binanceHigh,
        observedAt: new Date(endMs).toISOString(),
      });
    }

    if (sources.length === 0) {
      throw new ServiceUnavailableException(
        `Unable to load daily high for ${assetSymbol} on ${this.formatDate(targetDate)}`
      );
    }

    const priceUsd = Math.max(...sources.map((entry) => entry.priceUsd));
    return {
      priceUsd,
      sources,
      observedAt: new Date(endMs),
    };
  }

  private async fetchCoingeckoDailyHigh(
    coinId: string,
    startMs: number,
    endMs: number
  ): Promise<number | null> {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${Math.floor(
        startMs / 1000
      )}&to=${Math.floor((endMs + 60_000) / 1000)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { prices?: Array<[number, number]> };
      const prices = Array.isArray(payload.prices) ? payload.prices : [];
      if (prices.length === 0) {
        return null;
      }
      let max = -Infinity;
      for (const [, price] of prices) {
        const value = Number(price);
        if (Number.isFinite(value) && value > max) {
          max = value;
        }
      }
      return Number.isFinite(max) ? max : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`CoinGecko daily high fetch failed: ${message}`);
      return null;
    }
  }

  private async fetchBinanceDailyHigh(
    symbol: string,
    startMs: number,
    endMs: number
  ): Promise<number | null> {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startMs}&endTime=${endMs}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Array<Array<string | number>>;
      if (!Array.isArray(payload) || payload.length === 0) {
        return null;
      }

      let max = -Infinity;
      for (const entry of payload) {
        // Kline format: [openTime, open, high, low, close, volume, ...]
        const high = entry[2];
        const value = Number(high);
        if (Number.isFinite(value) && value > max) {
          max = value;
        }
      }

      return Number.isFinite(max) ? max : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Binance daily high fetch failed: ${message}`);
      return null;
    }
  }

  private buildSchedule(targetDate: Date, now: Date): {
    openAt: Date;
    tradingLockAt: Date;
    closeAt: Date;
    freezeStartAt: Date;
    freezeEndAt: Date;
  } {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const fiveMinutesMs = 5 * 60 * 1000;

    const desiredOpen = new Date(targetDate.getTime() - oneDayMs + fiveMinutesMs);
    const openAt = desiredOpen <= now ? new Date(now.getTime() + fiveMinutesMs) : desiredOpen;

    const tradingLockAt = new Date(targetDate.getTime() + (23 * 60 + 50) * 60 * 1000);
    const closeAt = new Date(targetDate.getTime() + (23 * 60 + 59) * 60 * 1000 + 59 * 1000);
    const freezeStart = new Date(closeAt.getTime());
    const freezeEnd = new Date(freezeStart.getTime() + this.disputeWindowHours * 60 * 60 * 1000);

    return {
      openAt,
      tradingLockAt,
      closeAt,
      freezeStartAt: freezeStart,
      freezeEndAt: freezeEnd,
    };
  }

  private buildPriceRanges(basePrice: number): PriceRange[] {
    const deltas = [
      { label: "Below -5%", minInclusive: null, maxExclusive: basePrice * 0.95, probability: 0.12 },
      { label: "-5% to 0%", minInclusive: basePrice * 0.95, maxExclusive: basePrice, probability: 0.28 },
      { label: "0% to +5%", minInclusive: basePrice, maxExclusive: basePrice * 1.05, probability: 0.28 },
      { label: "+5% to +10%", minInclusive: basePrice * 1.05, maxExclusive: basePrice * 1.1, probability: 0.22 },
      { label: "Above +10%", minInclusive: basePrice * 1.1, maxExclusive: null, probability: 0.10 },
    ];

    return deltas.map((entry) => ({
      label: this.formatRangeLabel(entry.label, entry.minInclusive, entry.maxExclusive),
      minExclusive: null,
      minInclusive: entry.minInclusive ?? null,
      maxExclusive: entry.maxExclusive ?? null,
      maxInclusive: null,
      probability: entry.probability,
    }));
  }

  private formatRangeLabel(label: string, minInclusive: number | null, maxExclusive: number | null): string {
    if (minInclusive === null && maxExclusive === null) {
      return label;
    }
    if (minInclusive === null && maxExclusive !== null) {
      return `< ${this.formatPrice(maxExclusive)} USD`;
    }
    if (minInclusive !== null && maxExclusive === null) {
      return `≥ ${this.formatPrice(minInclusive)} USD`;
    }
    return `${this.formatPrice(minInclusive ?? 0)} – ${this.formatPrice(maxExclusive ?? 0)} USD`;
  }

  private buildMarketSlug(symbol: string, date: Date): string {
    return `crypto-${symbol.toLowerCase()}-daily-high-${this.formatDate(date)}`;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private parseIsoDate(value: string): Date | null {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatHumanDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatPrice(price: number): string {
    return price.toFixed(2);
  }
}
