import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { PointsModule } from "../points/points.module";
import { SchedulerService } from "./scheduler.service";
import { SchedulerController } from "./scheduler.controller";

@Module({
  imports: [PrismaModule, AuthModule, PointsModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
