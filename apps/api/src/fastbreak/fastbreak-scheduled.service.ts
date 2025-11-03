import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { FastBreakOracleService } from './fastbreak-oracle.service';

/**
 * FastBreak Scheduled Tasks Service
 * 
 * NOTE: This service provides manual methods for scheduled tasks.
 * In production, call these methods via:
 * 1. Cron jobs (if @nestjs/schedule installed)
 * 2. External scheduler (PM2, node-cron)
 * 3. Manual API endpoints
 */
@Injectable()
export class FastBreakScheduledService implements OnModuleInit {
  private readonly logger = new Logger(FastBreakScheduledService.name);
  private autoCancelInterval?: NodeJS.Timeout;
  private settlementInterval?: NodeJS.Timeout;

  constructor(
    private readonly challengeService: FastBreakChallengeService,
    private readonly oracleService: FastBreakOracleService,
  ) {}

  async onModuleInit() {
    // Start auto-cancel interval (every 10 minutes)
    this.autoCancelInterval = setInterval(
      () => this.autoCancelExpiredPendingChallenges(),
      10 * 60 * 1000
    );

    // Start settlement interval (every 30 minutes)
    this.settlementInterval = setInterval(
      () => this.settleExpiredChallenges(),
      30 * 60 * 1000
    );

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

  onModuleDestroy() {
    if (this.autoCancelInterval) {
      clearInterval(this.autoCancelInterval);
    }
    if (this.settlementInterval) {
      clearInterval(this.settlementInterval);
    }
    this.logger.log('FastBreak scheduled tasks stopped');
  }
}
