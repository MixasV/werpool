import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FastBreakGraphQLClient } from './fastbreak-graphql.client';

/**
 * FastBreak Sync Service - HONEST Automated Leaderboard Sync
 * 
 * WHAT IT DOES:
 * - Fetches top leaders from all active FastBreak groups periodically
 * - Stores leader data in database for verification and statistics
 * - Provides real-time rank checking for challenge creation
 * 
 * LIMITATIONS (due to TopShot API):
 * - Only tracks TOP LEADER of each group (5 players per group)
 * - Cannot get full leaderboard with all participants via API
 * - Non-leaders must be verified differently (e.g., manual proof)
 * 
 * WHY THIS WORKS:
 * - Most users creating challenges will be top performers (leaders)
 * - Leaders get automatic verification via periodic sync
 * - Non-leaders can still create challenges with manual verification
 * - This is HONEST automation using only public API data
 * 
 * NOTE: Sync is triggered manually or via scheduler service
 * Install @nestjs/schedule and add @Cron decorator for automatic hourly sync
 */
@Injectable()
export class FastBreakSyncService {
  private readonly logger = new Logger(FastBreakSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphqlClient: FastBreakGraphQLClient,
  ) {}

  /**
   * Sync top leaders from TopShot API
   * Call this manually or via scheduler
   */
  async syncTopLeaders() {
    try {
      this.logger.log('Starting FastBreak top leaders sync...');
      
      const result = await this.graphqlClient.searchActiveFastBreakRuns();
      const runs = result.data.searchFastBreakRuns.fastBreakRuns;

      if (runs.length === 0) {
        this.logger.warn('No active FastBreak runs found');
        return;
      }

      let totalLeaders = 0;
      let updatedLeaders = 0;

      for (const run of runs) {
        this.logger.log(`Processing run: ${run.runName} (${run.id})`);

        for (const fastBreak of run.fastBreaks) {
          if (!fastBreak.leader || !fastBreak.leader.user) {
            continue;
          }

          totalLeaders++;

          try {
            await this.saveLeaderToDb({
              runId: run.id,
              runName: run.runName,
              fastBreakId: fastBreak.id,
              rank: fastBreak.leader.rank,
              points: fastBreak.leader.points,
              address: fastBreak.leader.user.flowAddress,
              username: fastBreak.leader.user.username,
              dapperId: fastBreak.leader.user.dapperID,
              status: fastBreak.status,
              gameDate: new Date(fastBreak.gameDate),
            });

            updatedLeaders++;
          } catch (error) {
            this.logger.error(`Failed to save leader ${fastBreak.leader.user.username}:`, error);
          }
        }
      }

      this.logger.log(
        `Sync completed: ${updatedLeaders}/${totalLeaders} leaders updated from ${runs.length} runs`
      );
    } catch (error) {
      this.logger.error('Failed to sync top leaders:', error);
    }
  }

  /**
   * Verify user rank in real-time
   * Called when user creates a challenge
   * 
   * Returns:
   * - null if user not found in current leaderboard
   * - { rank, points, verified: true } if found in synced data
   * - { rank, points, verified: true } if found via live API check
   */
  async verifyUserRank(userAddress: string): Promise<{
    rank: number;
    points: number;
    verified: boolean;
    source: 'db_cache' | 'live_api' | 'not_found';
    runId?: string;
    runName?: string;
  } | null> {
    try {
      // 1. Check database cache first (from periodic sync)
      const cached = await this.prisma.fastBreakLeaderboard.findFirst({
        where: {
          address: { equals: userAddress, mode: 'insensitive' },
          // Only check recent data (last 7 days)
          snapshotAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { snapshotAt: 'desc' },
      });

      if (cached) {
        this.logger.log(
          `User ${userAddress} found in cache: rank ${cached.rank}, ${cached.score} points`
        );

        return {
          rank: cached.rank,
          points: cached.score,
          verified: true,
          source: 'db_cache',
        };
      }

      // 2. Check live API (real-time verification)
      this.logger.log(`User ${userAddress} not in cache, checking live API...`);

      const liveData = await this.graphqlClient.findUserFastBreakGroup(userAddress);

      if (liveData) {
        this.logger.log(
          `User ${userAddress} found live: rank ${liveData.rank}, ${liveData.points} points`
        );

        // Save to cache for next time
        await this.saveLeaderToDb({
          runId: liveData.runId,
          runName: liveData.runName,
          fastBreakId: liveData.fastBreakId,
          rank: liveData.rank,
          points: liveData.points,
          address: userAddress,
          username: '', // Will be filled by next sync
          dapperId: '',
          status: liveData.status,
          gameDate: new Date(liveData.gameDate),
        });

        return {
          rank: liveData.rank,
          points: liveData.points,
          verified: true,
          source: 'live_api',
          runId: liveData.runId,
          runName: liveData.runName,
        };
      }

      // 3. Not found (user not a top leader in any group)
      this.logger.log(
        `User ${userAddress} not found in FastBreak leaderboard (not a group leader)`
      );

      return {
        rank: 0,
        points: 0,
        verified: false,
        source: 'not_found',
      };
    } catch (error) {
      this.logger.error(`Failed to verify user rank for ${userAddress}:`, error);
      return null;
    }
  }

  /**
   * Get leaderboard from database
   * Returns cached data from last sync
   */
  async getLeaderboard(limit: number = 100): Promise<Array<{
    address: string;
    username: string;
    rank: number;
    score: number;
    week: number;
    year: number;
  }>> {
    const currentWeek = this.getWeekNumber(new Date());
    const currentYear = new Date().getFullYear();

    return this.prisma.fastBreakLeaderboard.findMany({
      where: {
        week: currentWeek,
        year: currentYear,
      },
      orderBy: { rank: 'asc' },
      take: limit,
    });
  }

  /**
   * Manual sync trigger (for testing or admin use)
   */
  async triggerSync() {
    this.logger.log('Manual sync triggered');
    return this.syncTopLeaders();
  }

  /**
   * Save leader data to database
   */
  private async saveLeaderToDb(data: {
    runId: string;
    runName: string;
    fastBreakId: string;
    rank: number;
    points: number;
    address: string;
    username: string;
    dapperId: string;
    status: string;
    gameDate: Date;
  }) {
    const week = this.getWeekNumber(data.gameDate);
    const year = data.gameDate.getFullYear();

    await this.prisma.fastBreakLeaderboard.upsert({
      where: {
        week_year_address: {
          week,
          year,
          address: data.address,
        },
      },
      create: {
        week,
        year,
        address: data.address,
        username: data.username || data.address.slice(0, 8),
        rank: data.rank,
        score: data.points,
      },
      update: {
        username: data.username || data.address.slice(0, 8),
        rank: data.rank,
        score: data.points,
        snapshotAt: new Date(),
      },
    });
  }

  /**
   * Calculate week number from date
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}
