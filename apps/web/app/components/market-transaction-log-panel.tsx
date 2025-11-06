"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  fetchMarketTransactions,
  type FlowTransactionStatus,
  type FlowTransactionType,
  type MarketTransactionLog,
} from "../lib/markets-api";
import { subscribeToTransactions, type TransactionLogEvent } from "../lib/market-realtime";

interface MarketTransactionLogPanelProps {
  marketId: string;
  marketSlug: string;
  initialTransactions: MarketTransactionLog[];
  limit?: number;
}

const typeLabels: Record<FlowTransactionType, string> = {
  CREATE_MARKET: "Create market",
  CREATE_POOL: "Create pool",
  MINT_OUTCOME: "Add liquidity",
  BURN_OUTCOME: "Remove liquidity",
  SYNC_POOL: "Sync pool",
  ACTIVATE: "Activate market",
  SUSPEND: "Suspend market",
  VOID: "Void market",
  SETTLE: "Settle market",
  OVERRIDE_SETTLEMENT: "Override settlement",
  EXECUTE_TRADE: "Execute trade",
  CLOSE: "Close market",
  UPDATE_SCHEDULE: "Update schedule",
  UPDATE_PATROL_THRESHOLD: "Update patrol threshold",
  RECORD_PATROL_SIGNAL: "Record patrol signal",
  CLEAR_PATROL_SIGNAL: "Clear patrol signal",
};

const statusLabels: Record<FlowTransactionStatus, string> = {
  PENDING: "Pending",
  SUCCESS: "Success",
  FAILED: "Failed",
};

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

const toTransactionLog = (payload: TransactionLogEvent): MarketTransactionLog => ({
  id: payload.id,
  marketId: payload.marketId,
  type: payload.type as FlowTransactionType,
  status: payload.status as FlowTransactionStatus,
  transactionId: payload.transactionId,
  signer: payload.signer,
  network: payload.network,
  payload: payload.payload ?? null,
  createdAt: payload.createdAt,
});

export const MarketTransactionLogPanel = ({
  marketId,
  marketSlug,
  initialTransactions,
  limit = 100,
}: MarketTransactionLogPanelProps) => {
  const [transactions, setTransactions] = useState<MarketTransactionLog[]>(() =>
    initialTransactions.slice(0, limit)
  );
  const [error, setError] = useState<string | null>(null);
  const [isReloading, startReload] = useTransition();

  useEffect(() => {
    setTransactions(initialTransactions.slice(0, limit));
  }, [initialTransactions, limit]);

  useEffect(() => {
    if (!marketSlug) {
      return () => {};
    }

    const unsubscribe = subscribeToTransactions(marketSlug, (event) => {
      const entry = toTransactionLog(event);
      setTransactions((current) => {
        const filtered = current.filter(
          (item) => item.transactionId !== entry.transactionId && item.id !== entry.id
        );
        return [entry, ...filtered].slice(0, limit);
      });
    });

    return unsubscribe;
  }, [marketSlug, limit]);

  const handleReload = useCallback(() => {
    if (!marketId) {
      return;
    }

    startReload(async () => {
      setError(null);
      try {
        const fresh = await fetchMarketTransactions(marketId, limit);
        setTransactions(fresh.slice(0, limit));
      } catch (reloadError) {
        console.error("Failed to refresh transaction log", reloadError);
        setError(
          reloadError instanceof Error
            ? reloadError.message
            : "Failed to refresh transaction log"
        );
      }
    });
  }, [marketId, limit]);

  const groupedTransactions = useMemo(() => transactions, [transactions]);

  return (
    <section className="market-transactions">
      <header className="market-transactions__header">
        <div>
          <h2>Transaction log</h2>
          <p className="muted">
            Latest on-chain operations. The feed refreshes automatically via WebSocket updates.
          </p>
        </div>
        <button
          type="button"
          className="button tertiary"
          onClick={handleReload}
          disabled={isReloading}
        >
          {isReloading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && <p className="error-text">{error}</p>}

      {groupedTransactions.length === 0 ? (
        <p className="muted">No transactions recorded yet.</p>
      ) : (
        <div className="transaction-log-list">
          {groupedTransactions.map((entry) => {
            const status = statusLabels[entry.status] ?? entry.status;
            const type = typeLabels[entry.type] ?? entry.type;
            const statusClass = `status status--${entry.status.toLowerCase()}`;

            return (
              <div key={`${entry.id}:${entry.transactionId}`} className="transaction-log-item">
                <div className="transaction-log-item__header">
                  <span className={statusClass}>{status}</span>
                  <span className="transaction-log-item__type">{type}</span>
                  <time className="transaction-log-item__time">{formatDateTime(entry.createdAt)}</time>
                </div>
                <div className="transaction-log-item__details">
                  <div className="transaction-log-detail">
                    <span className="label">Tx ID</span>
                    <span className="value">{entry.transactionId.slice(0, 16)}...</span>
                  </div>
                  <div className="transaction-log-detail">
                    <span className="label">Signer</span>
                    <span className="value">{entry.signer.slice(0, 10)}...{entry.signer.slice(-4)}</span>
                  </div>
                  <div className="transaction-log-detail">
                    <span className="label">Network</span>
                    <span className="value">{entry.network}</span>
                  </div>
                </div>
                {entry.payload ? (
                  <details className="transaction-log-item__payload">
                    <summary>View payload</summary>
                    <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
