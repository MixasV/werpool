"use client";

import { useMemo, useState, useTransition } from "react";

import type {
  ClaimRewardsPayload,
  ClaimRewardsResult,
  MarketDetail,
} from "../lib/markets-api";
import { useFlowWallet } from "../providers/flow-wallet-provider";

export interface ClaimActionResult {
  ok: boolean;
  data?: ClaimRewardsResult;
  error?: string;
}

interface ClaimCenterProps {
  markets: MarketDetail[];
  onClaim: (formData: FormData) => Promise<ClaimActionResult>;
}

interface ClaimStatusEntry {
  type: "success" | "error";
  message: string;
  transactionId?: string;
}

interface FormValues {
  shares: string;
  maxFlowAmount: string;
}

const defaultFormValues: FormValues = {
  shares: "1",
  maxFlowAmount: "",
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFlowAmount = (value: string): string => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return `${parsed.toFixed(2)} FLOW`;
};

const formatAddress = (address?: string | null): string => {
  if (!address) {
    return "—";
  }
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  if (normalized.length <= 8) {
    return `0x${normalized}`;
  }
  return `0x${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
};

export const ClaimCenter = ({ markets, onClaim }: ClaimCenterProps) => {
  const { addr, loggedIn, isReady, logIn, logOut } = useFlowWallet();
  const [formValues, setFormValues] = useState<Record<string, FormValues>>({});
  const [status, setStatus] = useState<Record<string, ClaimStatusEntry>>({});
  const [pendingMarket, setPendingMarket] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const network = process.env.NEXT_PUBLIC_FLOW_NETWORK ?? "emulator";

  const sortedMarkets = useMemo(() => {
    return [...markets].sort((a, b) => {
      const left = a.settlement?.settledAt ?? a.closeAt ?? a.createdAt;
      const right = b.settlement?.settledAt ?? b.closeAt ?? b.createdAt;
      return right.localeCompare(left);
    });
  }, [markets]);

  const getFormState = (marketId: string): FormValues => {
    return formValues[marketId] ?? defaultFormValues;
  };

  const handleInputChange = (marketId: string, field: keyof FormValues, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [marketId]: {
        ...getFormState(marketId),
        [field]: value,
      },
    }));
  };

  const handleClaim = (market: MarketDetail) => {
    const settlement = market.settlement;
    if (!settlement) {
      setStatus((prev) => ({
        ...prev,
        [market.id]: {
          type: "error",
          message: "Market is not settled yet",
        },
      }));
      return;
    }

    const outcomeIndex = market.outcomes.findIndex(
      (outcome) => outcome.id === settlement.resolvedOutcomeId
    );

    if (outcomeIndex < 0) {
      setStatus((prev) => ({
        ...prev,
        [market.id]: {
          type: "error",
          message: "Unable to determine resolved outcome",
        },
      }));
      return;
    }

    if (!loggedIn || !addr) {
      setStatus((prev) => ({
        ...prev,
        [market.id]: {
          type: "error",
          message: "Connect your Flow wallet to claim rewards",
        },
      }));
      return;
    }

    const values = getFormState(market.id);
    const shares = Number.parseFloat(values.shares);

    if (!Number.isFinite(shares) || shares <= 0) {
      setStatus((prev) => ({
        ...prev,
        [market.id]: {
          type: "error",
          message: "Enter a share amount greater than zero",
        },
      }));
      return;
    }

    const maxFlowParsed = values.maxFlowAmount.trim().length > 0
      ? Number.parseFloat(values.maxFlowAmount)
      : undefined;

    if (maxFlowParsed !== undefined && (!Number.isFinite(maxFlowParsed) || maxFlowParsed <= 0)) {
      setStatus((prev) => ({
        ...prev,
        [market.id]: {
          type: "error",
          message: "Maximum amount must be a positive number",
        },
      }));
      return;
    }

    const payload: ClaimRewardsPayload = {
      outcomeIndex,
      shares,
      signer: addr ?? undefined,
      network,
      ...(maxFlowParsed !== undefined ? { maxFlowAmount: maxFlowParsed } : {}),
    };

    const formData = new FormData();
    formData.append("marketId", market.id);
    formData.append("payload", JSON.stringify(payload));
    formData.append("slug", market.slug);

    setStatus((prev) => ({
      ...prev,
      [market.id]: {
        type: "success",
        message: "Submitting transaction…",
      },
    }));

    startTransition(() => {
      setPendingMarket(market.id);
      onClaim(formData)
        .then((result) => {
          if (result?.ok && result.data) {
            const { claimAmount, transactionId } = result.data;
            setStatus((prev) => ({
              ...prev,
              [market.id]: {
                type: "success",
                message: `Rewards: ${formatFlowAmount(claimAmount)}`,
                transactionId,
              },
            }));
          } else {
            const errorMessage = result?.error ?? "Failed to process claim";
            setStatus((prev) => ({
              ...prev,
              [market.id]: {
                type: "error",
                message: errorMessage,
              },
            }));
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Claim request failed";
          setStatus((prev) => ({
            ...prev,
            [market.id]: {
              type: "error",
              message,
            },
          }));
        })
        .finally(() => {
          setPendingMarket((current) => (current === market.id ? null : current));
        });
    });
  };

  if (sortedMarkets.length === 0) {
    return (
      <section className="claim-center">
        <h2>Payout Center</h2>
        <p className="muted">No settled markets with available rewards yet.</p>
      </section>
    );
  }

  return (
    <section className="claim-center">
      <header className="claim-center__header">
        <div>
          <h2>Payout Center</h2>
          <p className="muted">
            Claim rewards for settled markets. Enter how many of your shares to claim and submit
            the transaction to Flow.
          </p>
        </div>
        <div className="claim-center__wallet">
          {loggedIn ? (
            <button
              type="button"
              className="button tertiary"
              onClick={() => {
                void logOut();
              }}
            >
              Disconnect {formatAddress(addr)}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              disabled={!isReady}
              onClick={() => {
                void logIn();
              }}
            >
              Connect Flow Wallet
            </button>
          )}
        </div>
      </header>

      <div className="claim-center__list">
        {sortedMarkets.map((market) => {
          const settlement = market.settlement;
          const resolvedOutcome = settlement
            ? market.outcomes.find((outcome) => outcome.id === settlement.resolvedOutcomeId)
            : null;
          const values = getFormState(market.id);
          const entryStatus = status[market.id];
          const isProcessing = pendingMarket === market.id || isPending;

          return (
            <article key={market.id} className="claim-card">
              <header className="claim-card__header">
                <div>
                  <h3>{market.title}</h3>
                  <p className="muted">Slug: {market.slug}</p>
                </div>
                <div className="claim-card__meta">
                  <span>Settled at: {formatDateTime(settlement?.settledAt)}</span>
                  <span>
                    Resolved outcome: {resolvedOutcome ? resolvedOutcome.label : "Unknown"}
                  </span>
                </div>
              </header>

              <div className="claim-card__form">
                <label className="field">
                  <span>Shares to claim</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={values.shares}
                    onChange={(event) =>
                      handleInputChange(market.id, "shares", event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Max FLOW (optional)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.maxFlowAmount}
                    onChange={(event) =>
                      handleInputChange(market.id, "maxFlowAmount", event.target.value)
                    }
                  />
                </label>

                <button
                  type="button"
                  className="button"
                  onClick={() => handleClaim(market)}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Submitting…" : "Claim rewards"}
                </button>
              </div>

              {entryStatus && (
                <div
                  className={`claim-card__status claim-card__status--${entryStatus.type}`}
                >
                  <p>{entryStatus.message}</p>
                  {entryStatus.transactionId && (
                    <p className="muted">TX: {entryStatus.transactionId}</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

ClaimCenter.displayName = "ClaimCenter";
