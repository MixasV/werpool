import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FindLabsClient } from './find-labs.client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly findLabs: FindLabsClient,
    private readonly prisma: PrismaService,
  ) {}

  async getMarketTransactionHistory(marketId: string) {
    try {
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
      });

      if (!market) {
        throw new NotFoundException('Market not found');
      }

      // Get trades from database (already stored)
      const trades = await this.prisma.marketTrade.findMany({
        where: { marketId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return trades;
    } catch (error) {
      this.logger.error('Failed to get market transaction history:', error);
      throw error;
    }
  }

  async getSettlementProof(marketId: string) {
    try {
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
        include: { settlement: true },
      });

      if (!market?.settlement) {
        throw new NotFoundException('Settlement not found');
      }

      // Get transaction details from Find Labs if available
      const tx = await this.findLabs.getTransaction(market.settlement.txId);

      return {
        txId: market.settlement.txId,
        blockHeight: tx?.blockHeight,
        timestamp: tx?.timestamp || market.settlement.settledAt,
        events: tx?.events || [],
        winningOutcome: market.settlement.resolvedOutcomeId,
        notes: market.settlement.notes,
      };
    } catch (error) {
      this.logger.error('Failed to get settlement proof:', error);
      throw error;
    }
  }

  async getTradingVolumeAnalytics(params: {
    marketId?: string;
    fromBlock?: number;
    toBlock?: number;
  }) {
    try {
      const whereClause: any = {};
      if (params.marketId) {
        whereClause.marketId = params.marketId;
      }

      const trades = await this.prisma.marketTrade.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
      });

      const volumeByDay = this.aggregateByDay(trades);
      const totalVolume = trades.reduce((sum, t) => sum + Number(t.flowAmount), 0);

      return {
        totalVolume,
        tradeCount: trades.length,
        volumeByDay,
        avgTradeSize: trades.length > 0 ? totalVolume / trades.length : 0,
      };
    } catch (error) {
      this.logger.error('Failed to get trading volume analytics:', error);
      throw error;
    }
  }

  async getUserActivityDashboard(address: string) {
    try {
      const trades = await this.prisma.marketTrade.findMany({
        where: { signer: address },
        orderBy: { createdAt: 'desc' },
      });

      const totalVolume = trades.reduce((sum, t) => sum + Number(t.flowAmount), 0);
      const marketsParticipated = new Set(trades.map(t => t.marketId)).size;

      return {
        totalTrades: trades.length,
        totalVolume,
        marketsParticipated,
        recentActivity: trades.slice(0, 10),
      };
    } catch (error) {
      this.logger.error('Failed to get user activity dashboard:', error);
      throw error;
    }
  }

  async search(query: string) {
    return this.findLabs.search(query);
  }

  private aggregateByDay(trades: any[]) {
    const byDay = new Map<string, number>();

    trades.forEach(trade => {
      const day = new Date(trade.createdAt).toISOString().split('T')[0];
      byDay.set(day, (byDay.get(day) || 0) + Number(trade.flowAmount));
    });

    return Array.from(byDay.entries()).map(([date, volume]) => ({
      date,
      volume,
    }));
  }
}
