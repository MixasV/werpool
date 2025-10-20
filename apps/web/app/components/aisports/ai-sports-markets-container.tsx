"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  executeMetaMarket,
  getAiSportsLeaderboard,
  getAiSportsProfile,
  listMetaMarketTrades,
  listMetaMarkets,
  quoteMetaMarket,
} from "../../lib/aisports/api";
import type {
  AiSportsLeaderboardEntry,
  AiSportsUserData,
  MetaMarketOutcome,
  MetaMarketQuote,
  MetaMarketTrade,
  MetaPredictionMarket,
} from "../../lib/aisports/types";
import { useFlowWallet } from "../../providers/flow-wallet-provider";
import { AiSportsMarketCard } from "./ai-sports-market-card";

const DEFAULT_SHARES = "10";

type ToastState = { status: "success" | "error"; message: string } | null;

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
};

const formatPercent = (value?: number): string => {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatDateTime = (value: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const shortenAddress = (address: string): string => {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const tradeProbability = (trade: MetaMarketTrade): number | undefined => {
  if (!Array.isArray(trade.probabilities) || trade.probabilities.length < 2) {
    return undefined;
  }
  return trade.outcome === "YES" ? trade.probabilities[0] : trade.probabilities[1];
};

export const AiSportsMarketsContainer = () => {
  const { addr, loggedIn, logIn } = useFlowWallet();
  const address = useMemo(() => (addr ? addr.toLowerCase() : null), [addr]);

  const [markets, setMarkets] = useState<MetaPredictionMarket[]>([]);
  const [userData, setUserData] = useState<AiSportsUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<AiSportsLeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [tradeModal, setTradeModal] = useState<
    { market: MetaPredictionMarket; outcome: MetaMarketOutcome } | null
  >(null);
  const [sharesInput, setSharesInput] = useState<string>(DEFAULT_SHARES);
  const [quote, setQuote] = useState<MetaMarketQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setQuoting] = useState(false);
  const [isExecuting, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [trades, setTrades] = useState<MetaMarketTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const quoteRequestId = useRef(0);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [marketsPayload, userPayload] = await Promise.all([
        listMetaMarkets(address ?? undefined),
        address ? getAiSportsProfile(address) : Promise.resolve(null),
      ]);
      setMarkets(marketsPayload);
      setUserData(userPayload);
      setTradeModal((current) => {
        if (!current) {
          return current;
        }
        const updated = marketsPayload.find((item) => item.id === current.market.id);
        return updated ? { market: updated, outcome: current.outcome } : current;
      });
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Failed to load aiSports data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const payload = await getAiSportsLeaderboard(15);
      setLeaderboard(payload);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Failed to load leaderboard";
      setLeaderboardError(message);
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const closeTradeModal = useCallback(() => {
    quoteRequestId.current += 1;
    setTradeModal(null);
    setQuote(null);
    setQuoteError(null);
    setExecutionError(null);
    setSharesInput(DEFAULT_SHARES);
    setTrades([]);
    setTradesLoading(false);
    setQuoting(false);
    setExecuting(false);
  }, []);

  const openTradeModal = useCallback(
    async (market: MetaPredictionMarket, outcome: MetaMarketOutcome) => {
      if (!loggedIn) {
        try {
          await logIn();
        } catch (authError) {
          const message =
            authError instanceof Error ? authError.message : "Flow authentication required";
          setToast({ status: "error", message });
        }
        return;
      }

      quoteRequestId.current += 1;
      setTradeModal({ market, outcome });
      setSharesInput(DEFAULT_SHARES);
      setQuote(null);
      setQuoteError(null);
      setExecutionError(null);
      setTrades([]);
      setTradesLoading(true);

      try {
        const recent = await listMetaMarketTrades(market.id, 20);
        setTrades(recent);
      } catch (fetchError) {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load trade history";
        setExecutionError(message);
      } finally {
        setTradesLoading(false);
      }
    },
    [logIn, loggedIn]
  );

  useEffect(() => {
    if (!tradeModal) {
      return;
    }

    const shares = Number(sharesInput);
    if (!Number.isFinite(shares) || shares <= 0) {
      setQuote(null);
      setQuoteError("Enter a valid share amount");
      setQuoting(false);
      return;
    }

    const requestId = ++quoteRequestId.current;
    setQuoting(true);

    const timer = window.setTimeout(() => {
      quoteMetaMarket(tradeModal.market.id, {
        outcome: tradeModal.outcome,
        shares,
      })
        .then((payload) => {
          if (quoteRequestId.current !== requestId) {
            return;
          }
          setQuote(payload);
          setQuoteError(null);
        })
        .catch((fetchError) => {
          if (quoteRequestId.current !== requestId) {
            return;
          }
          const message =
            fetchError instanceof Error ? fetchError.message : "Failed to fetch quote";
          setQuote(null);
          setQuoteError(message);
        })
        .finally(() => {
          if (quoteRequestId.current === requestId) {
            setQuoting(false);
          }
        });
    }, 320);

    return () => {
      window.clearTimeout(timer);
    };
  }, [tradeModal, sharesInput]);

  useEffect(() => {
    void fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (!toast || typeof window === "undefined") {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!tradeModal || typeof window === "undefined") {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTradeModal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [tradeModal, closeTradeModal]);

  const handleSharesChange = useCallback((value: string) => {
    setSharesInput(value.replace(/,/g, "."));
  }, []);

  const submitTrade = useCallback(async () => {
    if (!tradeModal) {
      return;
    }

    const shares = Number(sharesInput);
    if (!Number.isFinite(shares) || shares <= 0) {
      setQuoteError("Enter a valid share amount");
      return;
    }

    setExecuting(true);
    setExecutionError(null);

    try {
      const result = await executeMetaMarket(tradeModal.market.id, {
        outcome: tradeModal.outcome,
        shares,
      });

      setQuote(result.quote);
      setQuoteError(null);
      setMarkets((current) =>
        current.map((item) => (item.id === result.market.id ? result.market : item))
      );
      setTradeModal((current) =>
        current && current.market.id === result.market.id
          ? { market: result.market, outcome: current.outcome }
          : current
      );
      setTrades((current) => [...current, result.trade].slice(-20));
      setToast({
        status: "success",
        message: `Trade ${result.trade.outcome} for ${formatNumber(result.trade.shares)} shares confirmed`,
      });
      void fetchLeaderboard();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to execute trade";
      setExecutionError(message);
      setToast({ status: "error", message });
    } finally {
      setExecuting(false);
    }
  }, [fetchLeaderboard, sharesInput, tradeModal]);

  if (loading) {
    return (
      <section className="ai-market-grid ai-market-grid--loading">
        <div className="ai-market-grid__spinner" />
        <p>Loading aiSports meta markets…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ai-market-grid ai-market-grid--error">
        <p>Error: {error}</p>
        <button type="button" onClick={() => fetchMarkets()}>
          Retry
        </button>
      </section>
    );
  }

  if (markets.length === 0) {
    return (
      <section className="ai-market-grid ai-market-grid--empty">
        <p>aiSports meta markets are temporarily unavailable. Please try again later.</p>
        <button type="button" onClick={() => fetchMarkets()}>
          Refresh
        </button>
      </section>
    );
  }

  return (
    <section className="ai-market-grid">
      <header className="ai-market-grid__header">
        <div>
          <h2>aiSports Meta Markets</h2>
          <p>
            Experimental LMSR markets synchronized with the aiSports fantasy platform.
            {" "}
            {loggedIn
              ? "Select an outcome to get a quote and execute a trade."
              : "Sign in with Flow to check eligibility and place trades."}
          </p>
        </div>
        <button type="button" onClick={() => fetchMarkets()}>
          Refresh data
        </button>
      </header>

      <div className="ai-market-grid__layout">
        <div className="ai-market-grid__content">
          {markets.map((market) => (
            <AiSportsMarketCard
              key={market.id}
              market={market}
              user={userData}
              disabled={Boolean(tradeModal)}
              onSelect={openTradeModal}
            />
          ))}
        </div>
        <aside className="ai-market-grid__aside">
          <div className="ai-market-leaderboard">
            <div className="ai-market-leaderboard__header">
              <h3>Trader leaderboard</h3>
              <button
                type="button"
                onClick={() => fetchLeaderboard()}
                disabled={leaderboardLoading}
              >
                Refresh
              </button>
            </div>
            {leaderboardLoading ? (
              <div className="ai-market-grid__spinner ai-market-grid__spinner--inline" />
            ) : leaderboardError ? (
              <p className="ai-market-leaderboard__error">{leaderboardError}</p>
            ) : leaderboard.length === 0 ? (
              <p className="ai-market-leaderboard__empty">No trades yet.</p>
            ) : (
              <ul className="ai-market-leaderboard__list">
                {leaderboard.map((entry) => (
                  <li key={entry.address}>
                    <span className="ai-market-leaderboard__rank">#{entry.rank}</span>
                    <span className="ai-market-leaderboard__address">
                      {shortenAddress(entry.address)}
                    </span>
                    <span className="ai-market-leaderboard__score">
                      {formatNumber(entry.score)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {toast ? (
        <div
          className={`ai-market-grid__toast${
            toast.status === "error" ? " ai-market-grid__toast--error" : ""
          }`}
          role={toast.status === "error" ? "alert" : "status"}
        >
          {toast.message}
        </div>
      ) : null}

      {tradeModal ? (
        <div
          className="ai-market-modal"
          role="dialog"
          aria-modal="true"
          onClick={closeTradeModal}
        >
          <div
            className="ai-market-modal__panel"
            role="document"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ai-market-modal__header">
              <div>
                <h3>{tradeModal.market.title}</h3>
                <p>
                  Outcome:{" "}
                  <span data-outcome={tradeModal.outcome}>{tradeModal.outcome}</span>
                </p>
              </div>
              <button type="button" onClick={closeTradeModal} aria-label="Close" disabled={isExecuting}>
                ×
              </button>
            </header>

            <div className="ai-market-modal__body">
              <label className="ai-market-modal__field">
                <span>Shares</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={sharesInput}
                  onChange={(event) => handleSharesChange(event.target.value)}
                  disabled={isExecuting}
                />
              </label>

              {quoteError ? (
                <p className="ai-market-modal__error">{quoteError}</p>
              ) : null}

              <dl className="ai-market-modal__quote" data-loading={isQuoting}>
                <div>
                  <dt>Total cost</dt>
                  <dd>{quote ? `${formatNumber(quote.flowAmount)} FLOW` : "—"}</dd>
                </div>
                <div>
                  <dt>Price per share</dt>
                  <dd>{quote ? `${formatNumber(quote.price)} FLOW` : "—"}</dd>
                </div>
                <div>
                  <dt>Probability YES</dt>
                  <dd>{quote ? formatPercent(quote.probabilities[0]) : "—"}</dd>
                </div>
                <div>
                  <dt>Probability NO</dt>
                  <dd>{quote ? formatPercent(quote.probabilities[1]) : "—"}</dd>
                </div>
              </dl>

              {executionError ? (
                <p className="ai-market-modal__error ai-market-modal__error--inline">
                  {executionError}
                </p>
              ) : null}

              <section className="ai-market-modal__trades">
                <h4>Recent trades</h4>
                {tradesLoading ? (
                  <div className="ai-market-modal__spinner" />
                ) : trades.length === 0 ? (
                  <p className="ai-market-modal__trades-empty">No trades yet.</p>
                ) : (
                  <ul>
                    {trades
                      .slice()
                      .reverse()
                      .map((trade) => (
                        <li key={trade.id}>
                          <span>{formatDateTime(trade.createdAt)}</span>
                          <span data-outcome={trade.outcome}>{trade.outcome}</span>
                          <span>{formatNumber(trade.shares)} shares</span>
                          <span>{formatNumber(trade.flowAmount)} FLOW</span>
                          <span>{formatPercent(tradeProbability(trade))}</span>
                          <span>{trade.signer ? shortenAddress(trade.signer) : "—"}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </div>

            <footer className="ai-market-modal__footer">
              <button type="button" onClick={closeTradeModal} disabled={isExecuting}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitTrade()}
                disabled={isExecuting || isQuoting || !!quoteError || !quote}
              >
                {isExecuting ? "Executing…" : "Confirm trade"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
};
