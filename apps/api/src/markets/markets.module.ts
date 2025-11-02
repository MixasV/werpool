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
import { TopShotModule } from "../topshot/topshot.module";
import { PolymarketV4Controller } from "./polymarket-v4.controller";
import { PolymarketV4Service } from "./recovered/polymarket-v4.service";
import { MarketMakerService } from "./market-maker.service";
import { FlowSchedulerService } from "../flow/flow-scheduler.service";
import { FlowModule } from "../flow/flow.module";

@Module({
  imports: [AuthModule, SchedulerModule, PointsModule, TopShotModule, FlowModule],
  controllers: [MarketsController, PolymarketV4Controller],
  providers: [
    MarketsService,
    LmsrService,
    FlowMarketService,
    MarketPoolStateService,
    FlowTransactionService,
    MarketUpdatesGateway,
    MarketAnalyticsService,
    PolymarketV4Service,
    MarketMakerService,
    FlowSchedulerService,
  ],
  exports: [MarketsService, PolymarketV4Service, MarketMakerService],
})
export class MarketsModule {}
