import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { PointsModule } from "../points/points.module";
import { OraclesModule } from "../oracles/oracles.module";
import { SchedulerService } from "./scheduler.service";
import { SchedulerController } from "./scheduler.controller";
import { ScheduledSettlementService } from "./scheduled-settlement.service";

@Module({
  imports: [PrismaModule, AuthModule, PointsModule, OraclesModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, ScheduledSettlementService],
  exports: [SchedulerService, ScheduledSettlementService],
})
export class SchedulerModule {}
