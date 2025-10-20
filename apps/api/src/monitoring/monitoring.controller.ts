import { Controller, Get, Header, Post, UseGuards } from "@nestjs/common";

import { MonitoringService, MonitoringSnapshot } from "./monitoring.service";
import { AlertService } from "./alert.service";
import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";
import { PrometheusService } from "./prometheus.service";
import { AiSportsFlowService } from "../flow/aisports-flow.service";
import { MetaPredictionService } from "../oracles/aisports/meta-prediction.service";

@Controller("monitoring")
@UseGuards(FlowOrApiGuard)
@RequireFlowRoles("ADMIN", "OPERATOR")
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly alerts: AlertService,
    private readonly prometheus: PrometheusService,
    private readonly aiSports: AiSportsFlowService,
    private readonly metaPrediction: MetaPredictionService
  ) {}

  @Get("metrics")
  getMetrics(): MonitoringSnapshot {
    return this.monitoring.snapshot();
  }

  @Post("alerts/test")
  async sendTestAlert(): Promise<{ success: true }> {
    await this.alerts.notify({ event: "monitoring.test", detail: { source: "manual" } });
    return { success: true } as const;
  }

  @Get("prometheus")
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  async prometheusMetrics(): Promise<string> {
    return this.prometheus.metrics();
  }

  @Get("health/aisports")
  async aiSportsHealth(): Promise<{ enabled: boolean; ok: boolean; markets: number; trades: number; lastTradeAt: string | null }> {
    const enabled = this.aiSports.isEnabled();
    const ok = enabled ? await this.aiSports.ping() : false;
    const markets = enabled ? await this.metaPrediction.getMarkets() : [];
    const marketCount = markets.length;
    const tradeCount = markets.reduce((acc, market) => acc + market.tradeCount, 0);
    const lastTradeAt = markets
      .map((market) => market.lastTradeAt ?? null)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      enabled,
      ok,
      markets: marketCount,
      trades: tradeCount,
      lastTradeAt: lastTradeAt ? lastTradeAt.toISOString() : null,
    };
  }
}
