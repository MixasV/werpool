"use client";

import * as fcl from "@onflow/fcl";
import { useEffect, useMemo, useState } from "react";

interface ExecutionStatusProps {
  transactionId: string;
  network: string;
  signer: string;
}

const statusLabel: Record<number, string> = {
  0: "Unknown",
  1: "Started",
  2: "Executing",
  3: "Sealed in block",
  4: "Finalized",
};

const formatAddress = (address?: string | null) => {
  if (!address) {
    return "—";
  }
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  if (normalized.length <= 8) {
    return `0x${normalized}`;
  }
  return `0x${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
};

export const ExecutionStatus = ({ transactionId, network, signer }: ExecutionStatusProps) => {
  const [status, setStatus] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ type: string; transactionId: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const track = async () => {
      try {
        unsubscribe = fcl
          .tx(transactionId)
          .subscribe((txStatus: { status: number; errorMessage?: string; events?: unknown }) => {
            if (cancelled) {
              return;
            }
            setStatus(txStatus.status ?? 0);
            if (txStatus.errorMessage) {
              setErrorMessage(txStatus.errorMessage);
            }

            if (Array.isArray(txStatus.events)) {
              setEvents(
                txStatus.events.map((event: unknown) => {
                  const candidate = event as { type?: string; transactionId?: string };
                  return {
                    type: candidate.type ?? "Unknown",
                    transactionId: candidate.transactionId ?? transactionId,
                  };
                })
              );
            }
          });
      } catch (error) {
        console.error("Failed to track transaction", error);
        setErrorMessage(error instanceof Error ? error.message : "Tracking error");
      }
    };

    void track();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [transactionId]);

  const label = useMemo(() => statusLabel[status] ?? `Status ${status}`, [status]);

  return (
    <section className="execution-status">
      <header className="execution-status__header">
        <h4>Transaction status</h4>
        <span className="execution-status__badge">{label}</span>
      </header>
      <dl className="execution-status__meta">
        <div>
          <dt>TxID</dt>
          <dd>
            <code>{transactionId}</code>
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{network}</dd>
        </div>
        <div>
          <dt>Signer</dt>
          <dd>{formatAddress(signer)}</dd>
        </div>
      </dl>

      {errorMessage && <p className="error-text">{errorMessage}</p>}

      {events.length > 0 ? (
        <ul className="execution-status__events">
          {events.map((event) => (
            <li key={`${event.type}-${event.transactionId}`}>{event.type}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No events received yet.</p>
      )}
    </section>
  );
};
