import { Module } from "@nestjs/common";

import { OraclesController } from "./oracles.controller";
import { CryptoOracleService } from "./crypto-oracle.service";
import { SportsOracleService } from "./sports-oracle.service";
import { FlowVolumeOracleService } from "./flow-volume-oracle.service";
import { NBAStatsClient } from "./providers/nba-stats.client";
import { AuthModule } from "../auth/auth.module";
import { MetaPredictionService } from "./aisports/meta-prediction.service";
import { AiSportsOracleService } from "./aisports/aisports-oracle.service";
import { LmsrService } from "../markets/lmsr/lmsr.service";
import { AiSportsTransactionModule } from "../aisports/transaction/transaction.module";
import { AiSportsFlowService } from "../flow/aisports-flow.service";
import { NFTBoostService } from "../aisports/nft-boost/nft-boost.service";

@Module({
  imports: [AuthModule, AiSportsTransactionModule],
  controllers: [OraclesController],
  providers: [
    CryptoOracleService,
    SportsOracleService,
    FlowVolumeOracleService,
    NBAStatsClient,
    MetaPredictionService,
    AiSportsOracleService,
    LmsrService,
    AiSportsFlowService,
    NFTBoostService,
  ],
  exports: [
    CryptoOracleService,
    SportsOracleService,
    FlowVolumeOracleService,
    NBAStatsClient,
    MetaPredictionService,
    AiSportsOracleService,
  ],
})
export class OraclesModule {}
