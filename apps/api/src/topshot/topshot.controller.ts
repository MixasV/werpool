import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { TopShotLockService } from './topshot-lock.service';
import { TopShotRewardService } from './topshot-reward.service';
import { TopShotService } from './topshot.service';
import { MomentLockStatus } from '@prisma/client';
import { FlowOrApiGuard } from '../auth/flow-or-api.guard';
import type { FlowSessionPayload } from '../auth/flow-auth.service';
import {
  CreateMomentLockDto,
  UpdateMomentLockDto,
  MomentLockResponseDto,
} from './dto/moment-lock.dto';

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

@Controller('topshot')
export class TopShotController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: TopShotLockService,
    private readonly rewardService: TopShotRewardService,
    private readonly topShotService: TopShotService,
  ) {}

  @UseGuards(FlowOrApiGuard)
  @Post('lock')
  async createLock(
    @Req() req: RequestWithSession,
    @Body() dto: CreateMomentLockDto,
  ): Promise<MomentLockResponseDto> {
    const address = req.flowSession?.address;
    if (!address) {
      throw new Error('User address not found in session');
    }
    return this.lockService.createLock(address, dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Patch('lock/:id')
  async updateLock(
    @Req() req: RequestWithSession,
    @Param('id') lockId: string,
    @Body() dto: UpdateMomentLockDto,
  ): Promise<MomentLockResponseDto> {
    const address = req.flowSession?.address;
    if (!address) {
      throw new Error('User address not found in session');
    }
    return this.lockService.updateLock(lockId, address, dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('lock/:id/release')
  async releaseLock(
    @Req() req: RequestWithSession,
    @Param('id') lockId: string,
  ): Promise<{ success: boolean }> {
    const address = req.flowSession?.address;
    if (!address) {
      throw new Error('User address not found in session');
    }
    await this.lockService.releaseLock(lockId, address, MomentLockStatus.RELEASED);
    return { success: true };
  }

  @Get('locks/:address')
  async getUserLocks(@Param('address') address: string): Promise<MomentLockResponseDto[]> {
    return this.lockService.getUserLocks(address);
  }

  @Get('rewards/:address')
  async getUserRewards(@Param('address') address: string) {
    const rewards = await this.prisma.topShotReward.findMany({
      where: { userAddress: address.toLowerCase() },
      orderBy: { awardedAt: 'desc' },
      take: 50,
    });

    return rewards.map((reward) => ({
      id: reward.id,
      lockId: reward.lockId,
      userAddress: reward.userAddress,
      marketId: reward.marketId,
      eventId: reward.eventId,
      outcomeIndex: reward.outcomeIndex,
      momentId: reward.momentId,
      points: Number(reward.points),
      awardedAt: reward.awardedAt,
      metadata: reward.metadata,
    }));
  }

  @Get('moments/:address')
  async getUserMoments(@Param('address') address: string) {
    const moments = await this.topShotService.getOwnerMoments(address, { limit: 100 });
    return moments;
  }

  @Get('market/:marketId/locks')
  async getMarketLocks(@Param('marketId') marketId: string): Promise<MomentLockResponseDto[]> {
    return this.lockService.getMarketLocks(marketId);
  }
}
