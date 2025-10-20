import { Module } from "@nestjs/common";

import { OraclesController } from "./oracles.controller";
import { CryptoOracleService } from "./crypto-oracle.service";
import { SportsOracleService } from "./sports-oracle.service";
import { AuthModule } from "../auth/auth.module";
import { MetaPredictionService } from "./aisports/meta-prediction.service";
import { AiSportsOracleService } from "./aisports/aisports-oracle.service";
import { LmsrService } from "../markets/lmsr/lmsr.service";

@Module({
  imports: [AuthModule],
  controllers: [OraclesController],
  providers: [CryptoOracleService, SportsOracleService, MetaPredictionService, AiSportsOracleService, LmsrService],
  exports: [CryptoOracleService, SportsOracleService, MetaPredictionService, AiSportsOracleService],
})
export class OraclesModule {}
