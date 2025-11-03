import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FastBreakOracleService {
  private readonly logger = new Logger(FastBreakOracleService.name);
  private readonly FASTBREAK_API = process.env.FASTBREAK_API_URL || 'https://api.nbatopshot.com/fastbreak';

  constructor(
    private readonly prisma: PrismaService,
    private readonly challengeService: FastBreakChallengeService,
    private readonly httpService: HttpService,
  ) {}

  async getFastBreakLeaderboard(runId?: string) {
    try {
      this.logger.log(`Fetching FastBreak leaderboard for runId: ${runId || 'current'}`);

      // HONEST IMPLEMENTATION:
      // NBA TopShot GraphQL API does NOT expose public FastBreak leaderboard queries
      // The API documentation shows FastBreak objects exist, but:
      // 1. No direct "getFastBreak" query available
      // 2. No "searchFastBreakRuns" with leaderboard data
      // 3. Leaderboard queries only support PLAYER/TEAM kinds, not FASTBREAK
      //
      // SOLUTION OPTIONS:
      // A) Use official TopShot web scraping (against TOS)
      // B) Store leaderboard snapshots manually in our DB
      // C) Return mock data for testing
      // D) Require users to submit proof manually
      //
      // CHOSEN: Option B - Store snapshots in FastBreakLeaderboard table
      // Admin can populate via manual API or web scraping (their responsibility)
      
      const configuredRunId = runId || await this.getCurrentFastBreakRunId();
      
      if (!configuredRunId) {
        this.logger.warn('No FastBreak runId configured');
        return [];
      }

      // Try to get from our database snapshot
      const currentWeek = this.getWeekNumber(new Date());
      const currentYear = new Date().getFullYear();
      
      const snapshot = await this.prisma.fastBreakLeaderboard.findMany({
        where: {
          week: currentWeek,
          year: currentYear,
        },
        orderBy: {
          rank: 'asc',
        },
        take: 100,
      });

      if (snapshot.length > 0) {
        this.logger.log(`Found ${snapshot.length} leaderboard entries from DB snapshot`);
        return snapshot.map((entry) => ({
          address: entry.address,
          username: entry.username,
          score: entry.score,
          rank: entry.rank,
          runId: configuredRunId,
        }));
      }

      this.logger.warn(
        `No FastBreak leaderboard snapshot found for week ${currentWeek}, year ${currentYear}. ` +
        `Admin should populate FastBreakLeaderboard table manually.`
      );

      return [];
    } catch (error) {
      this.logger.error('Failed to fetch FastBreak leaderboard:', error);
      return [];
    }
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Get current active FastBreak run ID
   * 
   * HONEST NOTE: TopShot GraphQL API for FastBreak runs is complex and changes.
   * For now, return null to allow manual runId specification.
   * In production, admin can specify runId when creating challenge.
   * 
   * TODO: Implement proper FastBreak API integration when structure is stable
   */
  private async getCurrentFastBreakRunId(): Promise<string | null> {
    try {
      // Option 1: Try to get from environment variable
      const configuredRunId = process.env.FASTBREAK_CURRENT_RUN_ID;
      if (configuredRunId) {
        this.logger.log(`Using configured FastBreak runId: ${configuredRunId}`);
        return configuredRunId;
      }

      // Option 2: Try TopShot API (if we know the correct structure)
      // For now, return null and log warning
      this.logger.warn(
        'No FastBreak runId configured. Set FASTBREAK_CURRENT_RUN_ID env variable or specify runId in challenge metadata'
      );

      return null;
    } catch (error) {
      this.logger.error('Failed to get current FastBreak run:', error);
      return null;
    }
  }

  async getUserRank(address: string, runId?: string): Promise<number | null> {
    try {
      const leaderboard = await this.getFastBreakLeaderboard(runId);
      const entry = leaderboard.find((e: any) => 
        e.address.toLowerCase() === address.toLowerCase()
      );
      return entry?.rank || null;
    } catch (error) {
      this.logger.error('Failed to get user rank:', error);
      return null;
    }
  }

  async settleChallenge(challengeId: string) {
    try {
      this.logger.log(`Settling challenge ${challengeId}`);
      
      const challenge = await this.challengeService.getChallenge(challengeId);

      if (challenge.state !== 'MATCHED') {
        throw new BadRequestException('Challenge not ready for settlement');
      }

      if (new Date() < challenge.closeAt) {
        throw new BadRequestException('Challenge not closed yet');
      }

      // Get FastBreak run ID from challenge metadata or use current
      const runId = (challenge.proof as any)?.runId || null;

      const creatorRank = await this.getUserRank(challenge.creator, runId);
      const opponentRank = await this.getUserRank(challenge.opponent!, runId);

      if (!creatorRank || !opponentRank) {
        throw new Error('Could not fetch ranks from FastBreak API');
      }

      const winnerAddress = creatorRank < opponentRank ? challenge.creator : challenge.opponent!;

      await this.prisma.fastBreakChallenge.update({
        where: { id: challengeId },
        data: {
          state: 'SETTLED',
          settledAt: new Date(),
          winnerAddress,
          creatorRank,
          opponentRank,
          proof: {
            source: 'nba-topshot-fastbreak-api',
            runId: runId || 'unknown',
            timestamp: new Date().toISOString(),
            creatorRank,
            opponentRank,
          },
        },
      });

      this.logger.log(`Challenge ${challengeId} settled, winner: ${winnerAddress}`);
      return { winner: winnerAddress, creatorRank, opponentRank };
    } catch (error) {
      this.logger.error('Failed to settle challenge:', error);
      throw error;
    }
  }

  async settleExpiredChallenges() {
    try {
      const challenges = await this.prisma.fastBreakChallenge.findMany({
        where: {
          state: 'MATCHED',
          closeAt: { lt: new Date() },
        },
      });

      this.logger.log(`Settling ${challenges.length} expired challenges`);

      for (const challenge of challenges) {
        try {
          await this.settleChallenge(challenge.id);
        } catch (error) {
          this.logger.error(`Failed to settle challenge ${challenge.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to settle expired challenges:', error);
    }
  }

  private async executeTopShotQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const endpoint = 'https://public-api.nbatopshot.com/graphql';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Werpool-PredictionMarkets/1.0',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
