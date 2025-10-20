import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { MarketsModule } from "./markets/markets.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { FlowModule } from "./flow/flow.module";
import { RolesModule } from "./roles/roles.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { MonitoringInterceptor } from "./monitoring/monitoring.interceptor";
import { UsersModule } from "./users/users.module";
import { OraclesModule } from "./oracles/oracles.module";
import { AdminModule } from "./admin/admin.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { PointsModule } from "./points/points.module";

@Module({
  imports: [PrismaModule, AuthModule, FlowModule, RolesModule, UsersModule, OraclesModule, AdminModule, SchedulerModule, PointsModule, MonitoringModule, MarketsModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MonitoringInterceptor,
    },
  ],
})
export class AppModule {}
