import { Module } from "@nestjs/common";

import { MarketsController } from "./markets.controller";
import { MarketsService } from "./markets.service";
import { LmsrService } from "./lmsr/lmsr.service";
import { FlowMarketService } from "./flow/flow-market.service";
import { FlowTransactionService } from "./flow/flow-transaction.service";
import { MarketUpdatesGateway } from "./market-updates.gateway";
import { MarketAnalyticsService } from "./market-analytics.service";
import { AuthModule } from "../auth/auth.module";
import { MarketPoolStateService } from "./market-pool-state.service";
import { SchedulerModule } from "../scheduler/scheduler.module";
import { PointsModule } from "../points/points.module";

@Module({
  imports: [AuthModule, SchedulerModule, PointsModule],
  controllers: [MarketsController],
  providers: [
    MarketsService,
    LmsrService,
    FlowMarketService,
    MarketPoolStateService,
    FlowTransactionService,
    MarketUpdatesGateway,
    MarketAnalyticsService,
  ],
  exports: [MarketsService],
})
export class MarketsModule {}
