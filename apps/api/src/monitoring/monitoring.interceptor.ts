import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, throwError } from "rxjs";
import { catchError, finalize, tap } from "rxjs/operators";
import { performance } from "node:perf_hooks";

import { MonitoringService } from "./monitoring.service";
import { PrometheusService } from "./prometheus.service";

@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly prometheus: PrometheusService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    if (!request || !response) {
      return next.handle();
    }

    const start = performance.now();
    const method = (request.method ?? "UNKNOWN").toLowerCase();
    const routeKey = this.normalizeRoute(
      (request.route?.path as string | undefined) ?? request.path ?? request.url ?? "root"
    );
    const metricBase = `http.${method}.${routeKey}`;

    this.monitoring.increment("http.requests_total");
    this.monitoring.increment(`${metricBase}.requests_total`);
    this.monitoring.increment("http.inflight");
    this.monitoring.increment(`${metricBase}.inflight`);
    this.prometheus.trackInflight(method, routeKey, 1);

    return next.handle().pipe(
      tap(() => {
        const duration = performance.now() - start;
        const status = response.statusCode ?? 200;

        this.monitoring.increment("http.success_total");
        this.monitoring.increment(`${metricBase}.success_total`);
        this.monitoring.increment(`http.status.${status}`);
        this.monitoring.observe(`${metricBase}.duration_ms`, duration);
        this.monitoring.observe("http.duration_ms", duration);
        this.prometheus.observeRequest({
          method,
          route: routeKey,
          status,
          durationMs: duration,
        });
      }),
      catchError((error: unknown) => {
        const duration = performance.now() - start;
        const status = response.statusCode >= 400 ? response.statusCode : 500;

        this.monitoring.recordError(metricBase, error);
        this.monitoring.increment("http.error_total");
        this.monitoring.increment(`${metricBase}.error_total`);
        this.monitoring.increment(`http.status.${status}`);
        this.monitoring.observe(`${metricBase}.duration_ms`, duration);
        this.monitoring.observe("http.duration_ms", duration);
        this.prometheus.observeRequest({
          method,
          route: routeKey,
          status,
          durationMs: duration,
        });

        return throwError(() => error);
      }),
      finalize(() => {
        this.monitoring.increment("http.inflight", -1);
        this.monitoring.increment(`${metricBase}.inflight`, -1);
        this.prometheus.trackInflight(method, routeKey, -1);
      })
    );
  }

  private normalizeRoute(raw: string): string {
    const cleaned = raw
      .replace(/\?.*/, "")
      .replace(/:(\w+)/g, "_$1")
      .replace(/[^a-zA-Z0-9_/]/g, "")
      .replace(/\/+$/, "")
      .replace(/^\/+/, "");

    const normalized = cleaned.replace(/\//g, ".");
    return normalized.length > 0 ? normalized : "root";
  }
}
