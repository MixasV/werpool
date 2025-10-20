import { Injectable } from "@nestjs/common";

import { AlertService } from "./alert.service";

interface CounterMetric {
  name: string;
  count: number;
}

interface SummaryMetric extends CounterMetric {
  sum: number;
  min: number;
  max: number;
  avg: number;
}

export interface MonitoringSnapshot {
  counters: CounterMetric[];
  summaries: SummaryMetric[];
  errors: Array<{ metric: string; lastMessage: string; occurrences: number }>;
  timestamp: string;
}

@Injectable()
export class MonitoringService {
  private readonly counters = new Map<string, number>();
  private readonly summaries = new Map<
    string,
    { count: number; sum: number; min: number; max: number }
  >();
  private readonly errors = new Map<string, { count: number; lastMessage: string }>();

  constructor(private readonly alerts: AlertService) {}

  increment(metric: string, value = 1): void {
    if (!Number.isFinite(value) || value === 0) {
      return;
    }

    const current = this.counters.get(metric) ?? 0;
    const next = current + value;
    this.counters.set(metric, next < 0 ? 0 : next);
  }

  observe(metric: string, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const current = this.summaries.get(metric) ?? {
      count: 0,
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    };

    current.count += 1;
    current.sum += value;
    current.min = Math.min(current.min, value);
    current.max = Math.max(current.max, value);

    this.summaries.set(metric, current);
  }

  recordError(metric: string, error: unknown): void {
    const serialized = error instanceof Error ? error.message : String(error);
    const current = this.errors.get(metric) ?? { count: 0, lastMessage: serialized };
    current.count += 1;
    current.lastMessage = serialized;
    this.errors.set(metric, current);

    this.increment(`${metric}.error_total`);
    this.increment("errors.total");

    void this.alerts.notify({
      event: metric,
      error: serialized,
    });
  }

  snapshot(): MonitoringSnapshot {
    const counters = Array.from(this.counters.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    const summaries = Array.from(this.summaries.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      sum: Number(data.sum.toFixed(4)),
      min: Number(data.min === Number.POSITIVE_INFINITY ? 0 : data.min.toFixed(4)),
      max: Number(data.max === Number.NEGATIVE_INFINITY ? 0 : data.max.toFixed(4)),
      avg: data.count > 0 ? Number((data.sum / data.count).toFixed(4)) : 0,
    }));

    const errors = Array.from(this.errors.entries()).map(([name, data]) => ({
      metric: name,
      lastMessage: data.lastMessage,
      occurrences: data.count,
    }));

    return {
      counters,
      summaries,
      errors,
      timestamp: new Date().toISOString(),
    };
  }
}
