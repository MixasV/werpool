import { Injectable, Logger } from "@nestjs/common";
import {
  MarketAnalyticsInterval as PrismaMarketAnalyticsInterval,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { MarketUpdatesGateway } from "./market-updates.gateway";

interface RecordTradeInput {
  tradeId: string;
  marketId: string;
  marketSlug: string;
  outcomeId: string | null;
  outcomeIndex: number;
  outcomeLabel: string;
  probability: number | null;
  shares: number;
  flowAmount: number;
  isBuy: boolean;
  occurredAt: Date;
}

export interface GetSnapshotsOptions {
  marketId: string;
  interval: PrismaMarketAnalyticsInterval;
  outcomeIndex?: number;
  from?: Date;
  to?: Date;
  limit?: number;
}

const INTERVALS_TO_CAPTURE: PrismaMarketAnalyticsInterval[] = [
  PrismaMarketAnalyticsInterval.HOUR,
  PrismaMarketAnalyticsInterval.DAY,
];

const toDecimal = (value: number): Prisma.Decimal => new Prisma.Decimal(value);

@Injectable()
export class MarketAnalyticsService {
  private readonly logger = new Logger(MarketAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly updatesGateway: MarketUpdatesGateway
  ) {}

  async recordTrade(input: RecordTradeInput): Promise<void> {
    if (input.probability === null || Number.isNaN(input.probability)) {
      this.logger.warn(
        `Пропущено обновление аналитики для market=${input.marketId}: неизвестная вероятность`
      );
      return;
    }

    for (const interval of INTERVALS_TO_CAPTURE) {
      try {
        const snapshot = await this.upsertSnapshot(interval, input);
        if (snapshot) {
          this.updatesGateway.emitAnalyticsSnapshot({
            id: snapshot.id,
            marketId: snapshot.marketId,
            slug: input.marketSlug,
            outcomeId: snapshot.outcomeId ?? null,
            outcomeIndex: snapshot.outcomeIndex,
            outcomeLabel: snapshot.outcomeLabel,
            interval: snapshot.interval.toLowerCase(),
            bucketStart: snapshot.bucketStart.toISOString(),
            bucketEnd: snapshot.bucketEnd.toISOString(),
            openPrice: Number(snapshot.openPrice),
            closePrice: Number(snapshot.closePrice),
            highPrice: Number(snapshot.highPrice),
            lowPrice: Number(snapshot.lowPrice),
            averagePrice: Number(snapshot.averagePrice),
            volumeShares: Number(snapshot.volumeShares),
            volumeFlow: Number(snapshot.volumeFlow),
            netFlow: Number(snapshot.netFlow),
            tradeCount: snapshot.tradeCount,
            updatedAt: snapshot.updatedAt.toISOString(),
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
        this.logger.error(
          `Не удалось обновить аналитический снапшот ${interval} для market=${input.marketId}: ${message}`
        );
      }
    }
  }

  async getSnapshots(options: GetSnapshotsOptions) {
    const where: Prisma.MarketAnalyticsSnapshotWhereInput = {
      marketId: options.marketId,
      interval: options.interval,
    };

    if (typeof options.outcomeIndex === "number") {
      where.outcomeIndex = options.outcomeIndex;
    }

    if (options.from || options.to) {
      where.bucketStart = {};
      if (options.from) {
        where.bucketStart.gte = options.from;
      }
      if (options.to) {
        where.bucketStart.lte = options.to;
      }
    }

    return this.prisma.marketAnalyticsSnapshot.findMany({
      where,
      orderBy: { bucketStart: "asc" },
      take:
        options.limit && Number.isFinite(options.limit) && options.limit > 0
          ? Math.floor(options.limit)
          : undefined,
    });
  }

  private async upsertSnapshot(
    interval: PrismaMarketAnalyticsInterval,
    input: RecordTradeInput
  ) {
    const { bucketStart, bucketEnd } = this.resolveBucket(interval, input.occurredAt);

    const existing = await this.prisma.marketAnalyticsSnapshot.findUnique({
      where: {
        marketId_outcomeIndex_interval_bucketStart: {
          marketId: input.marketId,
          outcomeIndex: input.outcomeIndex,
          interval,
          bucketStart,
        },
      },
    });

    const tradeVolumeFlow = Math.abs(input.flowAmount);
    const tradeNetFlow = input.isBuy ? input.flowAmount : -input.flowAmount;

    if (!existing) {
      return this.prisma.marketAnalyticsSnapshot.create({
        data: {
          marketId: input.marketId,
          outcomeId: input.outcomeId ?? undefined,
          outcomeIndex: input.outcomeIndex,
          outcomeLabel: input.outcomeLabel,
          interval,
          bucketStart,
          bucketEnd,
          openPrice: toDecimal(input.probability),
          closePrice: toDecimal(input.probability),
          highPrice: toDecimal(input.probability),
          lowPrice: toDecimal(input.probability),
          averagePrice: toDecimal(input.probability),
          volumeShares: toDecimal(input.shares),
          volumeFlow: toDecimal(tradeVolumeFlow),
          netFlow: toDecimal(tradeNetFlow),
          tradeCount: 1,
        },
      });
    }

    const updatedTradeCount = existing.tradeCount + 1;
    const updatedVolumeShares = Number(existing.volumeShares) + input.shares;
    const updatedVolumeFlow = Number(existing.volumeFlow) + tradeVolumeFlow;
    const updatedNetFlow = Number(existing.netFlow) + tradeNetFlow;
    const highPrice = Math.max(Number(existing.highPrice), input.probability);
    const lowPrice = Math.min(Number(existing.lowPrice), input.probability);
    const averagePrice =
      (Number(existing.averagePrice) * existing.tradeCount + input.probability) /
      updatedTradeCount;

    return this.prisma.marketAnalyticsSnapshot.update({
      where: { id: existing.id },
      data: {
        outcomeId: input.outcomeId ?? existing.outcomeId ?? undefined,
        outcomeLabel: input.outcomeLabel,
        closePrice: toDecimal(input.probability),
        highPrice: toDecimal(highPrice),
        lowPrice: toDecimal(lowPrice),
        averagePrice: toDecimal(averagePrice),
        volumeShares: toDecimal(updatedVolumeShares),
        volumeFlow: toDecimal(updatedVolumeFlow),
        netFlow: toDecimal(updatedNetFlow),
        tradeCount: updatedTradeCount,
      },
    });
  }

  private resolveBucket(interval: PrismaMarketAnalyticsInterval, timestamp: Date) {
    const source = new Date(timestamp.getTime());
    if (interval === PrismaMarketAnalyticsInterval.HOUR) {
      source.setUTCMinutes(0, 0, 0);
      const bucketStart = source;
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      return { bucketStart, bucketEnd };
    }

    source.setUTCHours(0, 0, 0, 0);
    const bucketStart = source;
    const bucketEnd = new Date(bucketStart.getTime() + 24 * 60 * 60 * 1000);
    return { bucketStart, bucketEnd };
  }
}
