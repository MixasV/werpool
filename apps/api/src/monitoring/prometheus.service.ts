import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

interface ObserveParams {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

@Injectable()
export class PrometheusService {
  private readonly registry: Registry;
  private readonly httpRequestsTotal: Counter;
  private readonly httpRequestDuration: Histogram;
  private readonly httpInflight: Gauge;
  private readonly httpErrorsTotal: Counter;
  private readonly flowTransactionsTotal: Counter;
  private readonly flowTransactionFailures: Counter;
  private readonly flowTransactionDuration: Histogram;
  private readonly tradesTotal: Counter;
  private readonly tradeVolume: Counter;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: "forte_" });

    this.httpRequestsTotal = new Counter({
      name: "forte_http_requests_total",
      help: "Общее число HTTP-запросов",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: "forte_http_request_duration_seconds",
      help: "Длительность HTTP-запросов",
      labelNames: ["method", "route"],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.httpInflight = new Gauge({
      name: "forte_http_inflight_requests",
      help: "Текущее число активных HTTP-запросов",
      labelNames: ["method", "route"],
      registers: [this.registry],
    });

    this.httpErrorsTotal = new Counter({
      name: "forte_http_errors_total",
      help: "Число ошибок HTTP",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });

    this.flowTransactionsTotal = new Counter({
      name: "forte_flow_transactions_total",
      help: "Total number of Flow blockchain transactions",
      labelNames: ["type", "network", "status"],
      registers: [this.registry],
    });

    this.flowTransactionFailures = new Counter({
      name: "forte_flow_transaction_failures_total",
      help: "Total number of failed Flow transactions",
      labelNames: ["type", "network", "reason"],
      registers: [this.registry],
    });

    this.flowTransactionDuration = new Histogram({
      name: "forte_flow_transaction_duration_seconds",
      help: "Duration of Flow blockchain transactions",
      labelNames: ["type", "network"],
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.tradesTotal = new Counter({
      name: "forte_trades_total",
      help: "Total number of executed trades",
      labelNames: ["market_id", "is_buy"],
      registers: [this.registry],
    });

    this.tradeVolume = new Counter({
      name: "forte_trade_volume_flow",
      help: "Total trading volume in FLOW tokens",
      labelNames: ["market_id", "is_buy"],
      registers: [this.registry],
    });
  }

  trackInflight(method: string, route: string, delta: number): void {
    this.httpInflight.inc({ method, route }, delta);
  }

  observeRequest({ method, route, status, durationMs }: ObserveParams): void {
    const labels = { method, route, status: status.toString() };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe({ method, route }, durationMs / 1000);
    if (status >= 400) {
      this.httpErrorsTotal.inc(labels);
    }
  }

  trackFlowTransaction(
    type: string,
    network: string,
    status: "success" | "failed",
    durationMs: number
  ): void {
    this.flowTransactionsTotal.inc({ type, network, status });
    this.flowTransactionDuration.observe({ type, network }, durationMs / 1000);
  }

  trackFlowTransactionFailure(
    type: string,
    network: string,
    reason: string
  ): void {
    this.flowTransactionFailures.inc({ type, network, reason });
  }

  trackTrade(marketId: string, isBuy: boolean, flowAmount: number): void {
    const isBuyLabel = isBuy ? "buy" : "sell";
    this.tradesTotal.inc({ market_id: marketId, is_buy: isBuyLabel });
    this.tradeVolume.inc({ market_id: marketId, is_buy: isBuyLabel }, flowAmount);
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
