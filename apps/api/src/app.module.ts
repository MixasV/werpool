import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { MarketsModule } from "./markets/markets.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { FlowModule } from "./flow/flow.module";
import { RolesModule } from "./roles/roles.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { MonitoringInterceptor } from "./monitoring/monitoring.interceptor";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { UsersModule } from "./users/users.module";
import { OraclesModule } from "./oracles/oracles.module";
import { AdminModule } from "./admin/admin.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { PointsModule } from "./points/points.module";
import { AutomationModule } from "./automation/automation.module";
import { TopShotModule } from "./topshot/topshot.module";
import { MFLModule } from "./mfl/mfl.module";
import { FastBreakModule } from "./fastbreak/fastbreak.module";
import { AnalyticsModule } from "./analytics/analytics.module";

const RATE_LIMIT_TTL_MS = Number(process.env.RATE_LIMIT_TTL_MS ?? "60000");
const RATE_LIMIT_LIMIT = Number(process.env.RATE_LIMIT_LIMIT ?? "120");

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "global",
          ttl: Number.isFinite(RATE_LIMIT_TTL_MS)
            ? Math.max(1, Math.floor(RATE_LIMIT_TTL_MS / 1000))
            : 60,
          limit: Number.isFinite(RATE_LIMIT_LIMIT) ? Math.max(1, RATE_LIMIT_LIMIT) : 120,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    FlowModule,
    RolesModule,
    UsersModule,
    OraclesModule,
    AdminModule,
    SchedulerModule,
    PointsModule,
    MonitoringModule,
    MarketsModule,
    AutomationModule,
    TopShotModule,
    MFLModule,
    FastBreakModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MonitoringInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
