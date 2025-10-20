import type {
  MarketAnalyticsInterval as PrismaMarketAnalyticsInterval,
  MarketAnalyticsSnapshot,
} from "@prisma/client";

export type MarketAnalyticsInterval = "hour" | "day";

export interface MarketAnalyticsSnapshotDto {
  id: string;
  marketId: string;
  outcomeId: string | null;
  outcomeIndex: number;
  outcomeLabel: string;
  interval: MarketAnalyticsInterval;
  bucketStart: string;
  bucketEnd: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  averagePrice: number;
  volumeShares: number;
  volumeFlow: number;
  netFlow: number;
  tradeCount: number;
  updatedAt: string;
}

export const fromPrismaInterval = (
  interval: PrismaMarketAnalyticsInterval
): MarketAnalyticsInterval => interval.toLowerCase() as MarketAnalyticsInterval;

export const toMarketAnalyticsDto = (
  snapshot: MarketAnalyticsSnapshot
): MarketAnalyticsSnapshotDto => ({
  id: snapshot.id,
  marketId: snapshot.marketId,
  outcomeId: snapshot.outcomeId ?? null,
  outcomeIndex: snapshot.outcomeIndex,
  outcomeLabel: snapshot.outcomeLabel,
  interval: fromPrismaInterval(snapshot.interval),
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
