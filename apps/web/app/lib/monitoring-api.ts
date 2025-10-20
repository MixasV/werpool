import { API_BASE_URL, parseJson, withAuthHeaders, type AuthOptions } from "./api-client";

export interface CounterMetric {
  name: string;
  count: number;
}

export interface SummaryMetric extends CounterMetric {
  sum: number;
  min: number;
  max: number;
  avg: number;
}

export interface ErrorMetric {
  metric: string;
  lastMessage: string;
  occurrences: number;
}

export interface MonitoringSnapshot {
  counters: CounterMetric[];
  summaries: SummaryMetric[];
  errors: ErrorMetric[];
  timestamp: string;
}

export const fetchMonitoringSnapshot = async (
  auth?: AuthOptions
): Promise<MonitoringSnapshot> => {
  const response = await fetch(
    `${API_BASE_URL}/monitoring/metrics`,
    withAuthHeaders({ cache: "no-store" }, auth)
  );

  return parseJson<MonitoringSnapshot>(response);
};

export const sendMonitoringTestAlert = async (auth?: AuthOptions): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/monitoring/alerts/test`,
    withAuthHeaders({ method: "POST" }, auth)
  );

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`API ${response.status}: ${reason}`);
  }
};
