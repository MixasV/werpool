import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('markets/:id/transactions')
  async getMarketTransactions(@Param('id') marketId: string) {
    return this.analyticsService.getMarketTransactionHistory(marketId);
  }

  @Get('markets/:id/settlement-proof')
  async getSettlementProof(@Param('id') marketId: string) {
    return this.analyticsService.getSettlementProof(marketId);
  }

  @Get('trading-volume')
  async getTradingVolume(@Query('marketId') marketId?: string) {
    return this.analyticsService.getTradingVolumeAnalytics({ marketId });
  }

  @Get('users/:address/activity')
  async getUserActivity(@Param('address') address: string) {
    return this.analyticsService.getUserActivityDashboard(address);
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.analyticsService.search(query);
  }
}
