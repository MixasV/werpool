import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { MarketsModule } from "../markets/markets.module";
import { OraclesModule } from "../oracles/oracles.module";
import { FlowModule } from "../flow/flow.module";

import { CryptoMarketAutomationService } from "./crypto-market-automation.service";
import { SportsMarketAutomationService } from "./sports-market-automation.service";
import { AiSportsMarketAutomationService } from "./aisports-market-automation.service";

@Module({
  imports: [PrismaModule, MarketsModule, OraclesModule, FlowModule],
  providers: [
    CryptoMarketAutomationService,
    SportsMarketAutomationService,
    AiSportsMarketAutomationService,
  ],
})
export class AutomationModule {}
