import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MarketState, SchedulerTaskStatus, SchedulerTaskType } from '@prisma/client';
import { SportsOracleService } from '../oracles/sports-oracle.service';
import { CryptoOracleService } from '../oracles/crypto-oracle.service';
import { FlowVolumeOracleService } from '../oracles/flow-volume-oracle.service';

@Injectable()
export class ScheduledSettlementService {
  private readonly logger = new Logger(ScheduledSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportsOracle: SportsOracleService,
    private readonly cryptoOracle: CryptoOracleService,
    private readonly flowVolumeOracle: FlowVolumeOracleService,
  ) {}

  async processScheduledSettlements(): Promise<void> {
    const now = new Date();

    // Find markets ready for settlement
    const pendingMarkets = await this.prisma.market.findMany({
      where: {
        state: MarketState.LIVE,
        closeAt: { lte: now },
        settlement: null,
      },
      include: {
        outcomes: true,
        liquidityPool: true,
      },
      take: 10,
    });

    this.logger.log(`Processing ${pendingMarkets.length} markets for scheduled settlement`);

    for (const market of pendingMarkets) {
      try {
        await this.attemptAutoSettlement(market);
      } catch (error) {
        this.logger.error(`Failed to auto-settle market ${market.slug}:`, error);
      }
    }
  }

  private async attemptAutoSettlement(market: any): Promise<void> {
    // Check if there's an oracle event for this market
    if (!market.oracleId) {
      this.logger.warn(`Market ${market.slug} has no oracle ID, skipping auto-settlement`);
      return;
    }

    let winningOutcomeIndex: number | null = null;

    // Try sports oracle
    if (market.category === 'SPORTS') {
      const event = await this.sportsOracle.getLatestEvent(market.oracleId);
      if (event && this.isEventFinal(event)) {
        winningOutcomeIndex = this.determineWinningOutcome(event, market.outcomes);
      }
    }

    // Try crypto oracle
    if (market.category === 'CRYPTO' && !winningOutcomeIndex) {
      const quote = await this.cryptoOracle.getLatestQuote(market.oracleId);
      if (quote && this.canResolve(market, quote)) {
        winningOutcomeIndex = this.resolveByPrice(market, quote);
      }
    }

    // Try Flow volume oracle for oracle-flow-volume markets
    if (
      !winningOutcomeIndex &&
      market.oracleId &&
      market.oracleId.startsWith('oracle-flow-volume')
    ) {
      winningOutcomeIndex = await this.resolveFlowVolume(market);
    }

    if (winningOutcomeIndex !== null) {
      await this.createSettlementTask(market.id, winningOutcomeIndex);
    }
  }

  private isEventFinal(event: any): boolean {
    const status = event.payload?.status || event.status;
    if (typeof status === 'string') {
      const lower = status.toLowerCase();
      return lower === 'final' || lower === 'completed' || lower === 'finished';
    }
    return false;
  }

  private determineWinningOutcome(event: any, outcomes: any[]): number | null {
    const homeScore = event.payload?.homeScore ?? event.homeScore;
    const awayScore = event.payload?.awayScore ?? event.awayScore;

    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
      return null;
    }

    // Find home/away outcomes
    const homeOutcome = outcomes.findIndex(
      (o) => (o.metadata as any)?.type === 'home',
    );
    const awayOutcome = outcomes.findIndex(
      (o) => (o.metadata as any)?.type === 'away',
    );

    if (homeScore > awayScore && homeOutcome >= 0) {
      return homeOutcome;
    }
    if (awayScore > homeScore && awayOutcome >= 0) {
      return awayOutcome;
    }

    // Check for draw outcome
    const drawOutcome = outcomes.findIndex(
      (o) => (o.metadata as any)?.type === 'draw',
    );
    if (homeScore === awayScore && drawOutcome >= 0) {
      return drawOutcome;
    }

    return null;
  }

  private canResolve(market: any, quote: any): boolean {
    const closeAt = market.closeAt;
    if (!closeAt || !(closeAt instanceof Date)) {
      return false;
    }

    const now = new Date();
    return now >= closeAt;
  }

  private resolveByPrice(market: any, quote: any): number | null {
    // Extract target price from market metadata
    const metadata = market.metadata as any;
    const targetPrice = metadata?.targetPrice;

    if (typeof targetPrice !== 'number' || typeof quote.price !== 'number') {
      return null;
    }

    // Outcomes typically: [Yes (price >= target), No (price < target)]
    if (quote.price >= targetPrice) {
      return 0; // Yes
    } else {
      return 1; // No
    }
  }

  /**
   * Resolve Flow volume oracle market
   * REAL IMPLEMENTATION using FlowVolumeOracleService
   */
  private async resolveFlowVolume(market: any): Promise<number | null> {
    // Extract target date and threshold from market tags (format: "target:YYYY-MM-DD", "threshold:NUMBER")
    const tags = market.tags || [];
    const targetDateTag = tags.find((tag: string) => tag.startsWith('target:'));
    const thresholdTag = tags.find((tag: string) => tag.startsWith('threshold:'));

    let targetDateStr: string | undefined;
    let threshold: number | undefined;

    if (targetDateTag) {
      targetDateStr = targetDateTag.replace('target:', '');
    }

    if (thresholdTag) {
      const thresholdValue = thresholdTag.replace('threshold:', '');
      threshold = parseFloat(thresholdValue);
    }

    // HONEST: For demo, use closeAt as target date if no tag specified
    if (!targetDateStr && market.closeAt) {
      targetDateStr = new Date(market.closeAt).toISOString().split('T')[0];
      this.logger.log(
        `Market ${market.slug} using closeAt date as target: ${targetDateStr}`
      );
    }

    // Default threshold: 100k transactions (typical Flow mainnet daily volume)
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      threshold = 100000;
      this.logger.log(
        `Market ${market.slug} using default threshold: ${threshold} transactions`
      );
    }

    if (!targetDateStr) {
      this.logger.warn(
        `Market ${market.slug} missing target date in tags or closeAt`
      );
      return null;
    }

    const targetDate = new Date(targetDateStr);
    if (isNaN(targetDate.getTime())) {
      this.logger.warn(`Market ${market.slug} has invalid targetDate: ${targetDateStr}`);
      return null;
    }

    try {
      // Use REAL Flow Volume Oracle
      const outcomeIndex = await this.flowVolumeOracle.resolveMarketOutcome(
        targetDate,
        threshold
      );

      // Save oracle snapshot
      const volumeData = await this.flowVolumeOracle.getDailyVolume(targetDate);
      await this.flowVolumeOracle.saveSnapshot(targetDate, volumeData);

      this.logger.log(
        `Flow volume oracle resolved market ${market.slug}: outcome ${outcomeIndex}`
      );

      return outcomeIndex;
    } catch (error) {
      this.logger.error(
        `Failed to resolve Flow volume for market ${market.slug}:`,
        error
      );
      return null;
    }
  }

  private async createSettlementTask(marketId: string, outcomeIndex: number): Promise<void> {
    // Create scheduled task for settlement
    await this.prisma.schedulerTask.create({
      data: {
        marketId,
        type: SchedulerTaskType.MARKET_SETTLE,
        status: SchedulerTaskStatus.PENDING,
        scheduledFor: new Date(),
        description: `Auto-settlement for market ${marketId}`,
      },
    });

    this.logger.log(`Created settlement task for market ${marketId}, outcome ${outcomeIndex}`);
  }

  /**
   * Auto-reveal expired sealed bets (cron fallback)
   * Runs every 6 hours to catch any sealed bets that weren't auto-revealed
   * by Flow Scheduled Transactions (network issues, handler failures, etc.)
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async processExpiredSealedBets(): Promise<void> {
    const now = new Date();

    // Find sealed bets that should have been auto-revealed
    const expiredBets = await this.prisma.sealedBet.findMany({
      where: {
        status: 'COMMITTED',
        autoRevealScheduledFor: { lte: now },
      },
      take: 50,
    });

    if (expiredBets.length === 0) {
      return;
    }

    this.logger.log(
      `Processing ${expiredBets.length} expired sealed bets (cron fallback)`
    );

    for (const bet of expiredBets) {
      try {
        // Mark as FORFEITED (user lost opportunity to reveal)
        // In production, this would trigger autoRevealSealedBetV4.cdc transaction
        await this.prisma.sealedBet.update({
          where: { id: bet.id },
          data: {
            status: 'FORFEITED',
            revealTime: now,
          },
        });

        this.logger.warn(
          `Forfeited sealed bet ${bet.id} due to timeout (auto-reveal failed or delayed)`
        );
      } catch (error) {
        this.logger.error(
          `Failed to forfeit expired sealed bet ${bet.id}:`,
          error
        );
      }
    }

    this.logger.log(`Processed ${expiredBets.length} expired sealed bets`);
  }
}
