"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

import {
  fetchMarketAnalytics,
  type MarketAnalyticsInterval,
  type MarketAnalyticsPoint,
} from "../lib/markets-api";
import { subscribeToAnalytics } from "../lib/market-realtime";

interface MarketAnalyticsPanelProps {
  marketId: string;
  marketSlug: string;
  outcomes: Array<{ id: string; label: string; impliedProbability: number }>;
  defaultInterval?: MarketAnalyticsInterval;
  initialOutcomeIndex?: number;
  initialSnapshots: MarketAnalyticsPoint[];
}

interface AnalyticsState {
  snapshots: MarketAnalyticsPoint[];
  lastUpdated: string | null;
}

const intervalOptions: MarketAnalyticsInterval[] = ["hour", "day"];

const MAX_VISIBLE_ROWS = 50;

export function MarketAnalyticsPanel({
  marketId,
  marketSlug,
  outcomes,
  defaultInterval = "hour",
  initialOutcomeIndex = 0,
  initialSnapshots,
}: MarketAnalyticsPanelProps) {
  const [selectedInterval, setSelectedInterval] = useState<MarketAnalyticsInterval>(
    defaultInterval
  );
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number>(
    initialOutcomeIndex
  );
  const [{ snapshots, lastUpdated }, setAnalytics] = useState<AnalyticsState>((): AnalyticsState => {
    const sorted = [...initialSnapshots].sort((a, b) =>
      a.bucketStart.localeCompare(b.bucketStart)
    );
    const newest = sorted.at(-1)?.updatedAt ?? null;
    return {
      snapshots: sorted,
      lastUpdated: newest,
    };
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refreshAnalytics = useCallback(
    async (interval: MarketAnalyticsInterval, outcomeIndex: number) => {
      try {
        const result = await fetchMarketAnalytics(marketId, {
          interval,
          outcomeIndex,
        });
        const sorted = [...result].sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
        const newest = sorted.at(-1)?.updatedAt ?? null;
        setAnalytics({ snapshots: sorted, lastUpdated: newest });
        setError(null);
      } catch (fetchError) {
        console.error("Failed to refresh market analytics", fetchError);
        setError("Unable to refresh analytics. Please try again later.");
      }
    },
    [marketId]
  );

  useEffect(() => {
    const unsubscribe = subscribeToAnalytics(marketSlug, (payload) => {
      if (payload.interval !== selectedInterval || payload.outcomeIndex !== selectedOutcomeIndex) {
        return;
      }

      setAnalytics((current) => {
        const nextSnapshots = current.snapshots.filter(
          (snapshot) => snapshot.bucketStart !== payload.bucketStart
        );
        nextSnapshots.push({
          bucketStart: payload.bucketStart,
          bucketEnd: payload.bucketEnd,
          closePrice: payload.closePrice,
          openPrice: payload.openPrice,
          highPrice: payload.highPrice,
          lowPrice: payload.lowPrice,
          averagePrice: payload.averagePrice,
          volumeFlow: payload.volumeFlow,
          volumeShares: payload.volumeShares,
          netFlow: payload.netFlow,
          tradeCount: payload.tradeCount,
          updatedAt: payload.updatedAt,
          id: payload.id,
          marketId: payload.marketId,
          outcomeId: payload.outcomeId,
          outcomeIndex: payload.outcomeIndex,
          outcomeLabel: payload.outcomeLabel,
          interval: payload.interval as MarketAnalyticsInterval,
        });

        nextSnapshots.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));

        return {
          snapshots: nextSnapshots,
          lastUpdated: payload.updatedAt,
        };
      });
    });

    return () => {
      unsubscribe();
    };
  }, [marketSlug, selectedInterval, selectedOutcomeIndex]);

  const handleIntervalChange = useCallback(
    (interval: MarketAnalyticsInterval) => {
      if (interval === selectedInterval) {
        return;
      }

      setSelectedInterval(interval);
      startTransition(() => {
        void refreshAnalytics(interval, selectedOutcomeIndex);
      });
    },
    [refreshAnalytics, selectedInterval, selectedOutcomeIndex]
  );

  const handleOutcomeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const outcomeIndex = Number.parseInt(event.target.value, 10);
      setSelectedOutcomeIndex(outcomeIndex);
      startTransition(() => {
        void refreshAnalytics(selectedInterval, outcomeIndex);
      });
    },
    [refreshAnalytics, selectedInterval]
  );

  const priceSeries = useMemo(() => snapshots.map((item) => item.closePrice), [snapshots]);
  const volumeSeries = useMemo(() => snapshots.map((item) => item.volumeFlow), [snapshots]);

  const stats = useMemo(() => {
    if (snapshots.length === 0) {
      return null;
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const totalVolume = snapshots.reduce((acc, item) => acc + item.volumeFlow, 0);
    const totalTrades = snapshots.reduce((acc, item) => acc + item.tradeCount, 0);
    const totalNetFlow = snapshots.reduce((acc, item) => acc + item.netFlow, 0);
    const priceChange = last.closePrice - first.closePrice;
    const priceChangePercent = first.closePrice === 0 ? 0 : (priceChange / first.closePrice) * 100;

    return {
      lastPrice: last.closePrice,
      priceChange,
      priceChangePercent,
      totalVolume,
      totalTrades,
      totalNetFlow,
    };
  }, [snapshots]);

  return (
    <section className="market-analytics-panel">
      <header className="market-analytics-panel__header">
        <div className="market-analytics-panel__filters">
          <div className="market-analytics-panel__intervals">
            {intervalOptions.map((interval) => (
              <button
                key={interval}
                type="button"
                className={`button ${interval === selectedInterval ? "primary" : "secondary"}`}
                onClick={() => handleIntervalChange(interval)}
                disabled={isPending}
              >
                {interval === "hour" ? "Hourly" : "Daily"}
              </button>
            ))}
          </div>
          <label className="market-analytics-panel__select">
            <span>Outcome:</span>
            <select
              value={selectedOutcomeIndex}
              onChange={handleOutcomeChange}
              disabled={isPending}
            >
              {outcomes.map((outcome, index) => (
                <option key={outcome.id} value={index}>
                  {outcome.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button tertiary"
            onClick={() =>
              startTransition(() => {
                void refreshAnalytics(selectedInterval, selectedOutcomeIndex);
              })
            }
            disabled={isPending}
          >
            Refresh
          </button>
        </div>
        {lastUpdated && (
          <span className="market-analytics-panel__timestamp">
            Updated: {new Date(lastUpdated).toLocaleString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </header>

      {error && <p className="market-analytics-panel__error">{error}</p>}

      {snapshots.length === 0 ? (
        <p className="market-analytics-panel__empty">No analytics data for the selected filters.</p>
      ) : (
        <>
          {stats && (
            <div className="market-analytics-panel__stats">
              <div className="market-analytics-panel__stat">
                <span className="market-analytics-panel__stat-label">Last price</span>
                <span className="market-analytics-panel__stat-value">
                  {stats.lastPrice.toFixed(4)}
                </span>
              </div>
              <div className="market-analytics-panel__stat">
                <span className="market-analytics-panel__stat-label">Change</span>
                <span
                  className={`market-analytics-panel__stat-value market-analytics-panel__stat-value--${
                    stats.priceChange >= 0 ? "positive" : "negative"
                  }`}
                >
                  {stats.priceChange >= 0 ? "+" : ""}
                  {stats.priceChange.toFixed(4)} ({stats.priceChangePercent.toFixed(2)}%)
                </span>
              </div>
              <div className="market-analytics-panel__stat">
                <span className="market-analytics-panel__stat-label">Volume (FLOW)</span>
                <span className="market-analytics-panel__stat-value">{stats.totalVolume.toFixed(2)}</span>
              </div>
              <div className="market-analytics-panel__stat">
                <span className="market-analytics-panel__stat-label">Trades</span>
                <span className="market-analytics-panel__stat-value">{stats.totalTrades}</span>
              </div>
              <div className="market-analytics-panel__stat">
                <span className="market-analytics-panel__stat-label">Net flow (FLOW)</span>
                <span className="market-analytics-panel__stat-value">{stats.totalNetFlow.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="market-analytics-panel__charts">
            <AnalyticsSparkline
              title="Price trend"
              data={priceSeries}
              formatValue={(value) => value.toFixed(4)}
              emptyLabel="Not enough data for price chart"
            />
            <AnalyticsSparkline
              title="Volume (FLOW)"
              data={volumeSeries}
              formatValue={(value) => value.toFixed(2)}
              emptyLabel="Not enough data for volume chart"
            />
          </div>

          <table className="market-analytics-panel__table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Open</th>
                <th>Close</th>
                <th>High</th>
                <th>Low</th>
                <th>Average</th>
                <th>Volume (FLOW)</th>
                <th>Volume (SHARES)</th>
                <th>Net Flow</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.slice(-MAX_VISIBLE_ROWS).map((snapshot) => (
                <tr key={`${snapshot.bucketStart}-${snapshot.outcomeIndex}`}>
                  <td>
                    {new Date(snapshot.bucketStart).toLocaleString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </td>
                  <td>{snapshot.openPrice.toFixed(4)}</td>
                  <td>{snapshot.closePrice.toFixed(4)}</td>
                  <td>{snapshot.highPrice.toFixed(4)}</td>
                  <td>{snapshot.lowPrice.toFixed(4)}</td>
                  <td>{snapshot.averagePrice.toFixed(4)}</td>
                  <td>{snapshot.volumeFlow.toFixed(2)}</td>
                  <td>{snapshot.volumeShares.toFixed(2)}</td>
                  <td>{snapshot.netFlow.toFixed(2)}</td>
                  <td>{snapshot.tradeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {isPending && <p className="market-analytics-panel__loading">Refreshing data…</p>}
    </section>
  );
}

interface AnalyticsSparklineProps {
  data: number[];
  title: string;
  emptyLabel: string;
  formatValue: (value: number) => string;
}

const AnalyticsSparkline = ({ data, title, emptyLabel, formatValue }: AnalyticsSparklineProps) => {
  const path = useMemo(() => buildSparklinePath(data), [data]);
  const latestValue = data.at(-1);

  return (
    <div className="analytics-sparkline">
      <header className="analytics-sparkline__header">
        <span className="analytics-sparkline__title">{title}</span>
        {latestValue !== undefined && (
          <span className="analytics-sparkline__value">{formatValue(latestValue)}</span>
        )}
      </header>
      {data.length < 2 ? (
        <p className="analytics-sparkline__empty">{emptyLabel}</p>
      ) : (
        <svg className="analytics-sparkline__chart" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={path} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
};

const buildSparklinePath = (values: number[]): string => {
  if (values.length < 2) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const horizontalStep = 100 / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * horizontalStep;
      const normalizedY = ((max - value) / range) * 40;
      const command = index === 0 ? "M" : "L";
      return `${command}${x},${normalizedY}`;
    })
    .join(" ");
};
