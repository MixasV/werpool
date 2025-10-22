import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TopShotUsernameService } from '../topshot/topshot-username.service';
import { MarketCategory, MarketState } from '@prisma/client';

interface CreateChallengeDto {
  type: 'private' | 'public';
  bettingType: 'head-to-head' | 'spectator';
  opponentUsername?: string;
  stakeAmount: number;
  question: string;
  duration: number;
}

@Injectable()
export class FastBreakChallengeService {
  private readonly logger = new Logger(FastBreakChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topShotUsername: TopShotUsernameService,
  ) {}

  async createChallenge(dto: CreateChallengeDto, creator: string) {
    try {
      this.logger.log(`Creating challenge for ${creator}`);

      let opponentAddress: string | null = null;
      
      if (dto.type === 'private' && dto.opponentUsername) {
        opponentAddress = await this.topShotUsername.resolveUsername(dto.opponentUsername);
      }

      const closeAt = this.calculateCloseDate(dto.duration);

      const challenge = await this.prisma.fastBreakChallenge.create({
        data: {
          type: dto.type,
          bettingType: dto.bettingType,
          creator,
          creatorUsername: await this.topShotUsername.getUsername(creator),
          opponent: opponentAddress,
          opponentUsername: dto.opponentUsername,
          creatorStake: dto.stakeAmount,
          question: dto.question,
          duration: dto.duration,
          closeAt,
          state: 'PENDING',
        },
      });

      this.logger.log(`Created challenge ${challenge.id}`);
      return challenge;
    } catch (error) {
      this.logger.error('Failed to create challenge:', error);
      throw error;
    }
  }

  async acceptChallenge(challengeId: string, opponent: string) {
    try {
      const challenge = await this.getChallenge(challengeId);

      if (challenge.state !== 'PENDING') {
        throw new BadRequestException('Challenge not available');
      }

      if (challenge.type === 'private' && challenge.opponent !== opponent) {
        throw new ForbiddenException('Challenge not for you');
      }

      const opponentUsername = await this.topShotUsername.getUsername(opponent);

      await this.prisma.fastBreakChallenge.update({
        where: { id: challengeId },
        data: {
          opponent,
          opponentUsername,
          opponentStake: challenge.creatorStake,
          state: 'MATCHED',
          matchedAt: new Date(),
        },
      });

      this.logger.log(`Challenge ${challengeId} accepted by ${opponent}`);
      return challenge;
    } catch (error) {
      this.logger.error('Failed to accept challenge:', error);
      throw error;
    }
  }

  async editChallenge(challengeId: string, userId: string, updates: Partial<CreateChallengeDto>) {
    try {
      const challenge = await this.getChallenge(challengeId);

      if (challenge.creator !== userId) {
        throw new ForbiddenException('Only creator can edit');
      }

      if (challenge.state !== 'PENDING') {
        throw new BadRequestException('Cannot edit challenge in current state');
      }

      const updateData: any = {};
      
      if (updates.stakeAmount !== undefined) {
        updateData.creatorStake = updates.stakeAmount;
      }
      if (updates.question) {
        updateData.question = updates.question;
      }
      if (updates.duration) {
        updateData.duration = updates.duration;
        updateData.closeAt = this.calculateCloseDate(updates.duration);
      }
      if (updates.opponentUsername) {
        updateData.opponentUsername = updates.opponentUsername;
        updateData.opponent = await this.topShotUsername.resolveUsername(updates.opponentUsername);
      }

      return await this.prisma.fastBreakChallenge.update({
        where: { id: challengeId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error('Failed to edit challenge:', error);
      throw error;
    }
  }

  async cancelChallenge(challengeId: string, userId: string) {
    try {
      const challenge = await this.getChallenge(challengeId);

      if (challenge.creator !== userId) {
        throw new ForbiddenException('Only creator can cancel');
      }

      if (challenge.state !== 'PENDING') {
        throw new BadRequestException('Cannot cancel challenge in current state');
      }

      await this.prisma.fastBreakChallenge.update({
        where: { id: challengeId },
        data: {
          state: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      this.logger.log(`Challenge ${challengeId} cancelled`);
      return { refunded: challenge.creatorStake };
    } catch (error) {
      this.logger.error('Failed to cancel challenge:', error);
      throw error;
    }
  }

  async getChallenge(id: string) {
    const challenge = await this.prisma.fastBreakChallenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    return challenge;
  }

  async getChallengesForUser(address: string) {
    return this.prisma.fastBreakChallenge.findMany({
      where: {
        OR: [
          { creator: address },
          { opponent: address },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private calculateCloseDate(weeks: number): Date {
    const now = new Date();
    const closeAt = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
    
    // Set to end of Sunday
    const dayOfWeek = closeAt.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    closeAt.setDate(closeAt.getDate() + daysUntilSunday);
    closeAt.setHours(23, 59, 59, 999);
    
    return closeAt;
  }
}
