"use client";

import { useEffect, useState, useTransition } from "react";

import type { MarketPoolState } from "../lib/markets-api";
import { subscribeToPoolState } from "../lib/market-realtime";

interface MarketPoolPanelProps {
  marketSlug: string;
  initialState: MarketPoolState | null;
  refreshPool: () => Promise<MarketPoolState>;
}

const formatNumber = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";

export const MarketPoolPanel = ({ marketSlug, initialState, refreshPool }: MarketPoolPanelProps) => {
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (!marketSlug) {
      return () => {};
    }

    const unsubscribe = subscribeToPoolState(marketSlug, (payload) => {
      setState(payload.state);
      setUpdatedAt(payload.timestamp);
    });

    return unsubscribe;
  }, [marketSlug]);

  const handleRefresh = () => {
    startTransition(async () => {
      setError(null);
      try {
        const updated = await refreshPool();
        setState(updated);
        setUpdatedAt(new Date().toISOString());
      } catch (refreshError) {
        console.error("Failed to refresh pool state", refreshError);
        setError("Failed to refresh pool state");
      }
    });
  };

  return (
    <section className="market-detail__pool">
      <div className="market-detail__pool-header">
        <h2>Pool state</h2>
        <button type="button" className="button tertiary" onClick={handleRefresh} disabled={isPending}>
          {isPending ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {updatedAt && (
        <p className="muted">
          Last update: {new Date(updatedAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      {state ? (
        <dl className="pool-grid">
          <div>
            <dt>Liquidity parameter</dt>
            <dd>{formatNumber(state.liquidityParameter)}</dd>
          </div>
          <div>
            <dt>Total liquidity</dt>
            <dd>{formatNumber(state.totalLiquidity)}</dd>
          </div>
          <div>
            <dt>B vector</dt>
            <dd>{state.bVector.map((value) => formatNumber(value)).join(" / ")}</dd>
          </div>
          <div>
            <dt>Outcome supply</dt>
            <dd>{state.outcomeSupply.map((value) => formatNumber(value)).join(" / ")}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted">Pool data is unavailable.</p>
      )}
    </section>
  );
};
