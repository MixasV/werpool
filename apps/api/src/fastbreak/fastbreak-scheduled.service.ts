import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { FastBreakOracleService } from './fastbreak-oracle.service';
import { FastBreakMarketService } from './fastbreak-market.service';
import { FastBreakSyncService } from './fastbreak-sync.service';

/**
 * FastBreak Scheduled Tasks Service
 * 
 * Handles periodic tasks:
 * - Auto-cancel expired P2P challenges (10 min)
 * - Settle expired challenges (30 min)
 * - Create markets for new Runs (hourly)
 * - Sync top leaders leaderboard (hourly)
 * - Settle completed markets (daily)
 * 
 * NOTE: Uses simple setInterval, no @nestjs/schedule required
 */
@Injectable()
export class FastBreakScheduledService implements OnModuleInit {
  private readonly logger = new Logger(FastBreakScheduledService.name);
  private autoCancelInterval?: NodeJS.Timeout;
  private settlementInterval?: NodeJS.Timeout;
  private marketCreationInterval?: NodeJS.Timeout;
  private leaderboardSyncInterval?: NodeJS.Timeout;
  private marketSettlementInterval?: NodeJS.Timeout;

  constructor(
    private readonly challengeService: FastBreakChallengeService,
    private readonly oracleService: FastBreakOracleService,
    private readonly marketService: FastBreakMarketService,
    private readonly syncService: FastBreakSyncService,
  ) {}

  async onModuleInit() {
    // P2P Challenges (legacy):
    // Auto-cancel interval (every 10 minutes)
    this.autoCancelInterval = setInterval(
      () => this.autoCancelExpiredPendingChallenges(),
      10 * 60 * 1000
    );

    // Settlement interval (every 30 minutes)
    this.settlementInterval = setInterval(
      () => this.settleExpiredChallenges(),
      30 * 60 * 1000
    );

    // Prediction Markets (NEW):
    // Create markets for new Runs (every 1 hour)
    this.marketCreationInterval = setInterval(
      () => this.createMarketsForNewRuns(),
      60 * 60 * 1000
    );

    // Sync leaderboard data (every 1 hour)
    this.leaderboardSyncInterval = setInterval(
      () => this.syncLeaderboardData(),
      60 * 60 * 1000
    );

    // Settle completed markets (every 24 hours)
    this.marketSettlementInterval = setInterval(
      () => this.settleCompletedMarkets(),
      24 * 60 * 60 * 1000
    );

    // Run initial sync on startup
    this.logger.log('Running initial FastBreak data sync...');
    await this.syncLeaderboardData();
    await this.createMarketsForNewRuns();

    this.logger.log('FastBreak scheduled tasks initialized');
  }

  /**
   * Auto-cancel public challenges with no opponent after 1 hour
   */
  async autoCancelExpiredPendingChallenges() {
    try {
      this.logger.log('Running auto-cancel for expired pending challenges');
      const result = await this.challengeService.autoCancelExpiredPendingChallenges();
      
      if (result.cancelled > 0) {
        this.logger.log(`Auto-cancelled ${result.cancelled} expired challenges`);
      } else {
        this.logger.debug('No expired challenges to cancel');
      }
    } catch (error) {
      this.logger.error('Failed to auto-cancel challenges:', error);
    }
  }

  /**
   * Settle expired challenges
   */
  async settleExpiredChallenges() {
    try {
      this.logger.log('Running settlement for expired challenges');
      await this.oracleService.settleExpiredChallenges();
    } catch (error) {
      this.logger.error('Failed to settle expired challenges:', error);
    }
  }

  /**
   * Create prediction markets for new FastBreak Runs (hourly)
   */
  async createMarketsForNewRuns() {
    try {
      this.logger.log('Checking for new FastBreak Runs to create markets...');
      const result = await this.marketService.createMarketsForNewRuns();
      
      if (result.created > 0) {
        this.logger.log(`✅ Created ${result.created} new FastBreak markets`);
      } else {
        this.logger.debug(`No new markets to create (${result.skipped} existing)`);
      }
    } catch (error) {
      this.logger.error('Failed to create markets for new runs:', error);
    }
  }

  /**
   * Sync leaderboard data from TopShot API (hourly)
   */
  async syncLeaderboardData() {
    try {
      this.logger.log('Syncing FastBreak leaderboard data...');
      await this.syncService.syncTopLeaders();
      this.logger.log('✅ Leaderboard sync completed');
    } catch (error) {
      this.logger.error('Failed to sync leaderboard:', error);
    }
  }

  /**
   * Settle completed FastBreak markets (daily)
   */
  async settleCompletedMarkets() {
    try {
      this.logger.log('Checking for completed FastBreak markets to settle...');
      const result = await this.marketService.settleCompletedRuns();
      
      if (result.settled > 0) {
        this.logger.log(`✅ Settled ${result.settled} FastBreak markets`);
      } else {
        this.logger.debug(`No markets to settle (${result.pending} still pending)`);
      }
    } catch (error) {
      this.logger.error('Failed to settle completed markets:', error);
    }
  }

  onModuleDestroy() {
    if (this.autoCancelInterval) {
      clearInterval(this.autoCancelInterval);
    }
    if (this.settlementInterval) {
      clearInterval(this.settlementInterval);
    }
    if (this.marketCreationInterval) {
      clearInterval(this.marketCreationInterval);
    }
    if (this.leaderboardSyncInterval) {
      clearInterval(this.leaderboardSyncInterval);
    }
    if (this.marketSettlementInterval) {
      clearInterval(this.marketSettlementInterval);
    }
    this.logger.log('FastBreak scheduled tasks stopped');
  }
}
