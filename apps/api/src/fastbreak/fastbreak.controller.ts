import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { FastBreakOracleService } from './fastbreak-oracle.service';
import { FastBreakScraperService } from './fastbreak-scraper.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('fastbreak')
export class FastBreakController {
  constructor(
    private readonly challengeService: FastBreakChallengeService,
    private readonly oracle: FastBreakOracleService,
    private readonly scraper: FastBreakScraperService,
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

  @Post('leaderboard/import')
  async importLeaderboard(@Body() body: { entries: any[]; week?: number; year?: number }) {
    return this.scraper.importLeaderboard(body.entries, body.week, body.year);
  }

  @Post('leaderboard/import-csv')
  async importLeaderboardCSV(@Body() body: { csv: string; week?: number; year?: number }) {
    return this.scraper.importFromCSV(body.csv, body.week, body.year);
  }

  @Get('leaderboard')
  async getLeaderboard() {
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = new Date().getFullYear();

    return this.prisma.fastBreakLeaderboard.findMany({
      where: {
        week: currentWeek,
        year: currentYear,
      },
      orderBy: { rank: 'asc' },
      take: 100,
    });
  }

  private getCurrentWeekNumber(): number {
    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}
