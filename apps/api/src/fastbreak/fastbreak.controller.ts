import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { FastBreakOracleService } from './fastbreak-oracle.service';
import { FastBreakScraperService } from './fastbreak-scraper.service';
import { FastBreakSyncService } from './fastbreak-sync.service';
import { FastBreakMarketService } from './fastbreak-market.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('fastbreak')
export class FastBreakController {
  constructor(
    private readonly challengeService: FastBreakChallengeService,
    private readonly oracle: FastBreakOracleService,
    private readonly scraper: FastBreakScraperService,
    private readonly syncService: FastBreakSyncService,
    private readonly marketService: FastBreakMarketService,
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
    // Use sync service for consistent data
    return this.syncService.getLeaderboard(100);
  }

  /**
   * AUTOMATED SYNC ENDPOINTS (NEW!)
   * These replace manual CSV imports
   */

  @Post('sync/trigger')
  async triggerSync() {
    this.syncService.triggerSync();
    return { 
      message: 'FastBreak leaderboard sync triggered',
      note: 'Sync runs in background, check logs for progress'
    };
  }

  @Post('sync/verify-rank/:address')
  async verifyUserRank(@Param('address') address: string) {
    const result = await this.syncService.verifyUserRank(address);
    
    if (!result) {
      return {
        verified: false,
        message: 'Failed to verify rank',
      };
    }

    if (!result.verified) {
      return {
        verified: false,
        message: 'User not found in FastBreak leaderboard',
        note: 'Only top leaders of each group (5 players) are tracked via API',
      };
    }

    return {
      verified: true,
      rank: result.rank,
      points: result.points,
      source: result.source,
      runId: result.runId,
      runName: result.runName,
      message: `User is rank #${result.rank} with ${result.points} points`,
    };
  }

  @Get('sync/status')
  async getSyncStatus() {
    const leaderboard = await this.syncService.getLeaderboard(10);
    const totalEntries = leaderboard.length;

    return {
      status: 'active',
      syncInterval: 'hourly',
      lastSync: leaderboard[0]?.updatedAt || null,
      totalEntries,
      topLeaders: leaderboard.slice(0, 10),
      limitations: {
        apiRestriction: 'TopShot API only provides top leader of each FastBreak group',
        coverage: 'Only group leaders (rank #1 in their 5-player groups) are automatically tracked',
        verification: 'Non-leaders can still create challenges but may need manual verification',
      },
    };
  }

  /**
   * PREDICTION MARKETS ENDPOINTS (NEW!)
   * Auto-create markets for FastBreak Runs
   */

  @Post('markets/create-for-new-runs')
  async createMarketsForNewRuns() {
    const result = await this.marketService.createMarketsForNewRuns();
    return {
      message: 'FastBreak markets created for new runs',
      ...result,
    };
  }

  @Post('markets/settle-completed')
  async settleCompletedMarkets() {
    const result = await this.marketService.settleCompletedRuns();
    return {
      message: 'Completed FastBreak markets settled',
      ...result,
    };
  }

  @Get('markets')
  async getFastBreakMarkets() {
    const markets = await this.marketService.getAllFastBreakMarkets();
    return {
      total: markets.length,
      markets: markets.map((market) => ({
        id: market.id,
        title: market.title,
        description: market.description,
        state: market.state,
        closeAt: market.closeAt,
        outcomes: market.outcomes,
        tags: market.tags,
      })),
    };
  }

  @Get('markets/:id')
  async getFastBreakMarket(@Param('id') id: string) {
    const market = await this.prisma.market.findUnique({
      where: { id },
      include: { outcomes: true },
    });

    if (!market) {
      return { error: 'Market not found' };
    }

    return market;
  }

  private getCurrentWeekNumber(): number {
    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}
