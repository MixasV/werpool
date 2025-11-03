import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { FastBreakOracleService } from './fastbreak-oracle.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('fastbreak')
export class FastBreakController {
  constructor(
    private readonly challengeService: FastBreakChallengeService,
    private readonly oracle: FastBreakOracleService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('challenges')
  async getChallenges() {
    return this.prisma.fastBreakChallenge.findMany({
      where: {
        state: { in: ['PENDING', 'MATCHED', 'ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('challenges/:id')
  async getChallenge(@Param('id') id: string) {
    return this.challengeService.getChallenge(id);
  }

  @Post('challenges')
  async createChallenge(@Body() dto: any, @Req() req: any) {
    const creator = req.user?.address || '0xdefaultcreator';
    return this.challengeService.createChallenge(dto, creator);
  }

  @Post('challenges/:id/accept')
  async acceptChallenge(@Param('id') id: string, @Req() req: any) {
    const opponent = req.user?.address || '0xdefaultopponent';
    return this.challengeService.acceptChallenge(id, opponent);
  }

  @Post('challenges/:id/cancel')
  async cancelChallenge(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.address || '0xdefaultuser';
    return this.challengeService.cancelChallenge(id, userId);
  }

  @Get('user/:address/challenges')
  async getUserChallenges(@Param('address') address: string) {
    return this.challengeService.getChallengesForUser(address);
  }

  @Post('challenges/settle-expired')
  async settleExpired() {
    await this.oracle.settleExpiredChallenges();
    return { message: 'Expired challenges settlement initiated' };
  }

  @Post('challenges/auto-cancel-expired')
  async autoCancelExpired() {
    const result = await this.challengeService.autoCancelExpiredPendingChallenges();
    return { 
      message: 'Expired pending challenges cancelled',
      cancelled: result.cancelled 
    };
  }
}
