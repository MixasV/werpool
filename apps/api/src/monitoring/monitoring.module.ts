import { Module } from "@nestjs/common";

import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";
import { AlertService } from "./alert.service";
import { MonitoringInterceptor } from "./monitoring.interceptor";
import { AuthModule } from "../auth/auth.module";
import { PrometheusService } from "./prometheus.service";
import { OraclesModule } from "../oracles/oracles.module";
import { FlowModule } from "../flow/flow.module";

@Module({
  imports: [AuthModule, OraclesModule, FlowModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, AlertService, MonitoringInterceptor, PrometheusService],
  exports: [MonitoringService, AlertService, MonitoringInterceptor, PrometheusService],
})
export class MonitoringModule {}
