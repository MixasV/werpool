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
      this.logger.log(`Fetching FastBreak leaderboard for runId: ${runId || 'latest'}`);

      // Query TopShot GraphQL for FastBreak leaderboard
      // Using correct FastBreak query structure from NBA TopShot API
      const query = `
        query GetFastBreak($runId: ID!) {
          getFastBreak(runId: $runId) {
            id
            runId
            status
            gameDate
            leader {
              rank
              dapperId
              points
              user {
                username
                flowAddress
              }
            }
          }
        }
      `;

      // If no runId provided, get current active FastBreak run
      const activeRunId = runId || await this.getCurrentFastBreakRunId();

      if (!activeRunId) {
        this.logger.warn('No active FastBreak run found');
        return [];
      }

      const result = await this.executeTopShotQuery<{
        data: {
          getFastBreak: {
            id: string;
            runId: string;
            status: string;
            gameDate: string;
            leader: Array<{
              rank: number;
              dapperId: string;
              points: number;
              user: {
                username: string;
                flowAddress: string;
              };
            }>;
          };
        };
      }>(query, { runId: activeRunId });

      if (!result?.data?.getFastBreak?.leader) {
        this.logger.warn(`No leaderboard data found for runId ${activeRunId}`);
        return [];
      }

      return result.data.getFastBreak.leader.map((entry) => ({
        address: entry.user.flowAddress,
        username: entry.user.username,
        score: entry.points,
        rank: entry.rank,
        runId: activeRunId,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch FastBreak leaderboard:', error);
      return [];
    }
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
