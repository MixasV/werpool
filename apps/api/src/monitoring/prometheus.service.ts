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

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
