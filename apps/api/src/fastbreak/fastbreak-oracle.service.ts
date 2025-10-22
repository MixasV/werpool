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

  async getFastBreakLeaderboard(week?: number, year?: number) {
    try {
      this.logger.log(`Fetching FastBreak leaderboard for week ${week}, year ${year}`);

      // Query TopShot GraphQL for FastBreak leaderboard
      const query = `
        query GetLeaderboard($input: GetLeaderboardInput!) {
          getLeaderboard(input: $input) {
            entries {
              flowAddress
              username
              score
              rank
            }
            pagination {
              cursor
              hasNextPage
            }
          }
        }
      `;

      const result = await this.executeTopShotQuery<{
        data: {
          getLeaderboard: {
            entries: Array<{
              flowAddress: string;
              username: string;
              score: number;
              rank: number;
            }>;
            pagination: {
              cursor: string | null;
              hasNextPage: boolean;
            };
          };
        };
      }>(query, {
        input: {
          leaderboardType: 'FASTBREAK',
          week: week || this.getCurrentWeekNumber(),
          year: year || new Date().getFullYear(),
          limit: 100,
        },
      });

      if (!result?.data?.getLeaderboard?.entries) {
        this.logger.warn(`No leaderboard data found for week ${week}, year ${year}`);
        return [];
      }

      return result.data.getLeaderboard.entries.map((entry) => ({
        address: entry.flowAddress,
        username: entry.username,
        score: entry.score,
        rank: entry.rank,
        week: week || this.getCurrentWeekNumber(),
        year: year || new Date().getFullYear(),
      }));
    } catch (error) {
      this.logger.error('Failed to fetch leaderboard:', error);
      return [];
    }
  }

  async getUserRank(address: string, week?: number, year?: number): Promise<number | null> {
    try {
      const leaderboard = await this.getFastBreakLeaderboard(week, year);
      const entry = leaderboard.find((e: any) => e.address === address);
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

      const week = this.getWeekNumber(challenge.closeAt);
      const year = challenge.closeAt.getFullYear();

      const creatorRank = await this.getUserRank(challenge.creator, week, year);
      const opponentRank = await this.getUserRank(challenge.opponent!, week, year);

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
            week,
            year,
            timestamp: new Date(),
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

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private getCurrentWeekNumber(): number {
    return this.getWeekNumber(new Date());
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
