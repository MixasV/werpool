"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  fetchMarketTrades,
  type ExecuteTradePayload,
  type ExecuteTradeResult,
  type MarketDetail,
  type MarketPoolState,
  type MarketAccountBalances,
  type MarketTrade,
  type QuoteTradePayload,
  type QuoteTradeResult,
} from "../lib/markets-api";
import { useFlowWallet } from "../providers/flow-wallet-provider";
import { ExecutionStatus } from "./execution-status";
import { subscribeToPoolState, subscribeToTrades } from "../lib/market-realtime";

interface MarketTradePanelProps {
  outcomes: MarketDetail["outcomes"];
  onQuote: (payload: QuoteTradePayload) => Promise<QuoteTradeResult>;
  onExecute: (payload: ExecuteTradePayload) => Promise<ExecuteTradeResult>;
  fetchBalances: (address: string) => Promise<MarketAccountBalances>;
  initialPoolState: MarketPoolState | null;
  refreshPool: () => Promise<MarketPoolState>;
  marketSlug: string;
  marketId: string;
  initialTrades: MarketTrade[];
  tradesLimit?: number;
}

const formatFlow = (value: string) => `${value} FLOW`;
const formatShares = (value: string) => `${value} SHARES`;
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

const computeProbabilities = (state: MarketPoolState | null): number[] | null => {
  if (!state) {
    return null;
  }

  const { bVector, liquidityParameter } = state;
  const scaled = bVector.map((value) => value / liquidityParameter);
  const max = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, current) => acc + current, 0);
  return exps.map((value) => value / sum);
};

const roundTo = (value: number, precision = 1e8) => Math.round(value * precision) / precision;

const computeLogSumExp = (vector: number[], liquidityParameter: number): number => {
  if (vector.length === 0) {
    return 0;
  }
  if (liquidityParameter <= 0) {
    return Math.max(...vector);
  }
  const scaled = vector.map((value) => value / liquidityParameter);
  const max = Math.max(...scaled);
  const sum = scaled.reduce((acc, current) => acc + Math.exp(current - max), 0);
  return max + Math.log(sum);
};

const computeProbabilitiesFromVector = (vector: number[], liquidityParameter: number): number[] => {
  if (vector.length === 0) {
    return [];
  }
  if (liquidityParameter <= 0) {
    const uniform = 1 / vector.length;
    return vector.map(() => uniform);
  }

  const scaled = vector.map((value) => value / liquidityParameter);
  const max = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, current) => acc + current, 0);
  if (sum === 0) {
    const uniform = 1 / vector.length;
    return vector.map(() => uniform);
  }
  return exps.map((value) => value / sum);
};

interface SimulatedQuote {
  flowAmount: number;
  nextTotalLiquidity: number;
  nextSupply: number[];
  probabilities: number[];
}

interface OrderbookLevel {
  shares: number;
  flow: number;
  avgPrice: number;
  priceAfter: number;
  slippage: number | null;
}

const simulateQuote = (
  state: MarketPoolState,
  outcomeIndex: number,
  shares: number,
  isBuy: boolean
): SimulatedQuote | null => {
  if (!Number.isFinite(shares) || shares <= 0) {
    return null;
  }

  if (outcomeIndex < 0 || outcomeIndex >= state.bVector.length) {
    return null;
  }

  const direction = isBuy ? shares : -shares;
  const nextSupply = state.outcomeSupply.map((value, index) =>
    index === outcomeIndex ? Math.max(0, value + direction) : value
  );

  if (!isBuy) {
    const available = state.outcomeSupply[outcomeIndex] ?? 0;
    if (shares > available) {
      return null;
    }
  }

  const nextBVector = state.bVector.map((value, index) =>
    index === outcomeIndex ? roundTo(value + direction) : value
  );

  const before = computeLogSumExp(state.bVector, state.liquidityParameter);
  const after = computeLogSumExp(nextBVector, state.liquidityParameter);
  const flowAmountRaw = state.liquidityParameter * (after - before);
  const flowAmount = Math.abs(roundTo(flowAmountRaw, 1e6));
  const nextTotalLiquidity = isBuy
    ? state.totalLiquidity + flowAmount
    : Math.max(0, state.totalLiquidity - flowAmount);

  const probabilities = computeProbabilitiesFromVector(nextBVector, state.liquidityParameter);

  return {
    flowAmount,
    nextTotalLiquidity,
    nextSupply,
    probabilities,
  };
};

const formatFlowValue = (value: number) => `${value.toFixed(2)} FLOW`;
const formatSharesValue = (value: number) => `${value.toFixed(2)} SHARES`;
const formatPercentValue = (value: number) => `${(value * 100).toFixed(2)}%`;
const formatFlowPerShare = (value: number) => `${value.toFixed(2)} FLOW/SHARE`;

export const MarketTradePanel = ({
  outcomes,
  onQuote,
  onExecute,
  fetchBalances,
  initialPoolState,
  refreshPool,
  marketSlug,
  marketId,
  initialTrades,
  tradesLimit = 50,
}: MarketTradePanelProps) => {
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const [sharesInput, setSharesInput] = useState("1");
  const [isBuy, setIsBuy] = useState(true);
  const [quote, setQuote] = useState<QuoteTradeResult | null>(null);
  const [execution, setExecution] = useState<ExecuteTradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<MarketAccountBalances | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isBalancesLoading, setBalancesLoading] = useState(false);
  const [toleranceInput, setToleranceInput] = useState("1");
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<ExecuteTradePayload | null>(null);
  const [history, setHistory] = useState<MarketTrade[]>(initialTrades);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setHistoryLoading] = useState(false);
  const [poolState, setPoolState] = useState<MarketPoolState | null>(initialPoolState);
  const [isPoolRefreshing, setPoolRefreshing] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [priceImpact, setPriceImpact] = useState<number | null>(null);
  const [isQuoting, startQuote] = useTransition();
  const [isExecuting, startExecute] = useTransition();
  const { addr, loggedIn, isReady, logIn, logOut } = useFlowWallet();

  const hasOutcomes = outcomes.length > 0;
  const selectedOutcome = useMemo(
    () => outcomes[outcomeIndex] ?? null,
    [outcomes, outcomeIndex]
  );
  const network = process.env.NEXT_PUBLIC_FLOW_NETWORK ?? "emulator";
  const baseProbabilities = useMemo(() => computeProbabilities(poolState), [poolState]);
  const currentProbability = baseProbabilities && outcomeIndex < baseProbabilities.length
    ? baseProbabilities[outcomeIndex]
    : null;

  const orderbook = useMemo(() => {
    if (!poolState || outcomes.length === 0) {
      return {
        currentPrice: null,
        buyLevels: [] as OrderbookLevel[],
        sellLevels: [] as OrderbookLevel[],
      };
    }

    const shareSteps = [0.5, 1, 2, 5];
    const probabilities = computeProbabilities(poolState);
    const current = probabilities && outcomeIndex < probabilities.length ? probabilities[outcomeIndex] : null;

    const buyLevels: OrderbookLevel[] = [];
    for (const shares of shareSteps) {
      const quote = simulateQuote(poolState, outcomeIndex, shares, true);
      if (!quote) {
        continue;
      }
      const priceAfter = quote.probabilities[outcomeIndex] ?? null;
      if (priceAfter === null) {
        continue;
      }
      const avgPrice = shares > 0 ? quote.flowAmount / shares : 0;
      buyLevels.push({
        shares,
        flow: quote.flowAmount,
        avgPrice,
        priceAfter,
        slippage: current !== null ? priceAfter - current : null,
      });
    }

    const availableSupply = poolState.outcomeSupply[outcomeIndex] ?? 0;
    const sellLevels: OrderbookLevel[] = [];
    for (const shares of shareSteps) {
      if (shares > availableSupply) {
        continue;
      }
      const quote = simulateQuote(poolState, outcomeIndex, shares, false);
      if (!quote) {
        continue;
      }
      const priceAfter = quote.probabilities[outcomeIndex] ?? null;
      if (priceAfter === null) {
        continue;
      }
      const avgPrice = shares > 0 ? quote.flowAmount / shares : 0;
      sellLevels.push({
        shares,
        flow: quote.flowAmount,
        avgPrice,
        priceAfter,
        slippage: current !== null ? priceAfter - current : null,
      });
    }

    return {
      currentPrice: current,
      buyLevels,
      sellLevels,
    };
  }, [poolState, outcomes.length, outcomeIndex]);

  useEffect(() => {
    setPoolState(initialPoolState);
  }, [initialPoolState]);

  useEffect(() => {
    setHistory(initialTrades);
    setHistoryError(null);
    setHistoryLoading(false);
  }, [initialTrades]);

  useEffect(() => {
    if (!marketSlug) {
      return () => {};
    }

    const unsubscribe = subscribeToPoolState(marketSlug, (payload) => {
      setPoolState(payload.state);
    });

    return unsubscribe;
  }, [marketSlug]);

  useEffect(() => {
    setPriceImpact(null);
  }, [outcomeIndex, isBuy, poolState]);

  const reloadHistory = useCallback(async (): Promise<MarketTrade[]> => {
    if (!marketId) {
      setHistory([]);
      setHistoryError(null);
      return [];
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const trades = await fetchMarketTrades(marketId, tradesLimit);
      setHistory(trades);
      return trades;
    } catch (reloadError) {
      const message =
        reloadError instanceof Error
          ? reloadError.message
          : "Failed to load trade history";
      setHistoryError(message);
      throw reloadError;
    } finally {
      setHistoryLoading(false);
    }
  }, [marketId, tradesLimit]);

  useEffect(() => {
    if (!loggedIn || !addr) {
      setBalances(null);
      setBalanceError(null);
      setBalancesLoading(false);
      return;
    }

    let cancelled = false;
    setBalancesLoading(true);
    setBalanceError(null);

    fetchBalances(addr)
      .then((result) => {
        if (!cancelled) {
          setBalances(result);
        }
      })
      .catch((balanceFetchError) => {
        if (!cancelled) {
          const message =
            balanceFetchError instanceof Error
              ? balanceFetchError.message
              : "Failed to load balances";
          setBalanceError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBalancesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addr, loggedIn, fetchBalances, execution?.transactionId]);
  const parseShares = (): number | null => {
    const value = Number.parseFloat(sharesInput);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  };

  const refreshPoolState = useCallback(async () => {
    setPoolRefreshing(true);
    setPoolError(null);
    try {
      const updated = await refreshPool();
      setPoolState(updated);
      return updated;
    } catch (poolRefreshError) {
      const message =
        poolRefreshError instanceof Error
          ? poolRefreshError.message
          : "Failed to refresh pool state";
      setPoolError(message);
      throw poolRefreshError;
    } finally {
      setPoolRefreshing(false);
    }
  }, [refreshPool]);

  useEffect(() => {
    if (!marketSlug) {
      return () => {};
    }

    const unsubscribe = subscribeToTrades(marketSlug, () => {
      reloadHistory().catch((error) => {
        console.error("Failed to refresh trade history after event", error);
      });
    });

    return unsubscribe;
  }, [marketSlug, reloadHistory]);

  const finalizeExecution = useCallback(
    async (response: ExecuteTradeResult) => {
      setExecution(response);

      try {
        await refreshPoolState();
      } catch (refreshError) {
        console.error("Failed to refresh pool after trade", refreshError);
      }

      try {
        await reloadHistory();
      } catch (historyError) {
        console.error("Failed to refresh trade history", historyError);
      }
    },
    [refreshPoolState, reloadHistory]
  );

  const handleQuote = () => {
    const shares = parseShares();
    if (shares === null) {
      setError("Enter a positive share amount");
      return;
    }

    startQuote(async () => {
      setError(null);
      setExecution(null);
      try {
        const payload: QuoteTradePayload = {
          outcomeIndex,
          shares,
          isBuy,
        };
        const response = await onQuote(payload);
        setQuote(response);
        if (currentProbability !== null) {
          const nextProbability = response.probabilities[outcomeIndex] ?? null;
          setPriceImpact(
            nextProbability !== null ? (nextProbability - currentProbability) * 100 : null
          );
        } else {
          setPriceImpact(null);
        }
      } catch (quoteError) {
        console.error("Failed to obtain quote", quoteError);
        setError(quoteError instanceof Error ? quoteError.message : "Quote calculation failed");
        setPriceImpact(null);
      }
    });
  };

  const handleExecute = () => {
    const shares = parseShares();
    if (shares === null) {
      setError("Enter a positive share amount");
      return;
    }

    if (!loggedIn) {
      void logIn();
      return;
    }

    if (!quote) {
      setError("Request a quote before executing the trade");
      return;
    }

    const tolerance = Number.parseFloat(toleranceInput);
    const safeTolerance = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0;
    const flowAmountValue = Number.parseFloat(quote.flowAmount);
    const maxFlowAmount = Number.isFinite(flowAmountValue)
      ? flowAmountValue * (1 + safeTolerance / 100)
      : undefined;

    const payload: ExecuteTradePayload = {
      outcomeIndex,
      shares,
      isBuy,
      signer: addr ?? undefined,
      network,
      ...(maxFlowAmount ? { maxFlowAmount } : {}),
    };

    setPendingPayload(payload);
    setConfirmOpen(true);
  };

  const confirmExecute = () => {
    if (!pendingPayload) {
      setConfirmOpen(false);
      return;
    }

    startExecute(async () => {
      setError(null);
      try {
        const response = await onExecute(pendingPayload);
        await finalizeExecution(response);
        setConfirmOpen(false);
        setPendingPayload(null);
      } catch (executeError) {
        console.error("Failed to execute trade", executeError);
        setError(executeError instanceof Error ? executeError.message : "Trade execution failed");
      }
    });
  };

  const cancelExecute = () => {
    setConfirmOpen(false);
    setPendingPayload(null);
  };

  return (
    <section className="market-trade">
      <header className="market-trade__header">
        <h2>Trading</h2>
        <div className="wallet-status">
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
              className="button tertiary"
              onClick={() => {
                void logIn();
              }}
              disabled={!isReady}
            >
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {!hasOutcomes ? (
        <p className="muted">This market has no outcomes configured yet.</p>
      ) : (
        <>
          {loggedIn && (
            <div className="wallet-balances">
              <p className="muted">
                Flow balance: {isBalancesLoading ? "Loading…" : balances ? formatFlow(balances.flowBalance) : "—"}
              </p>
              <p className="muted">
                Outcome balance: {isBalancesLoading ? "Loading…" : balances ? formatShares(balances.outcomeBalance) : "—"}
              </p>
              {balanceError && <p className="error-text">{balanceError}</p>}
            </div>
          )}

          <div className="market-trade__controls">
            <label className="field">
              <span>Outcome</span>
              <select
                value={outcomeIndex}
                onChange={(event) => setOutcomeIndex(Number.parseInt(event.target.value, 10))}
              >
                {outcomes.map((outcome, index) => (
                  <option key={outcome.id} value={index}>
                    {outcome.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Shares</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={sharesInput}
                onChange={(event) => setSharesInput(event.target.value)}
              />
            </label>

            <label className="field checkbox">
              <input
                type="checkbox"
                checked={isBuy}
                onChange={(event) => setIsBuy(event.target.checked)}
              />
              <span>{isBuy ? "Buy" : "Sell"}</span>
            </label>

            <label className="field">
              <span>Slippage (%)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={toleranceInput}
                onChange={(event) => setToleranceInput(event.target.value)}
              />
            </label>
          </div>

          <div className="market-trade__actions">
            <button type="button" className="button" onClick={handleQuote} disabled={isQuoting}>
              {isQuoting ? "Requesting quote…" : "Get quote"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={handleExecute}
              disabled={isExecuting}
            >
              {isExecuting ? "Executing…" : "Execute trade"}
            </button>
            <button
              type="button"
              className="button tertiary"
              onClick={() => {
                void refreshPoolState();
              }}
              disabled={isPoolRefreshing}
            >
              {isPoolRefreshing ? "Refreshing pool…" : "Refresh pool"}
            </button>
          </div>

          <div className="market-trade__result">
            <h3>Results</h3>
            {error && <p className="error-text">{error}</p>}
            {poolError && <p className="error-text">{poolError}</p>}
            {quote ? (
              <dl className="quote-grid">
                <div>
                  <dt>Action</dt>
                  <dd>
                    {isBuy ? "Buy" : "Sell"} {sharesInput}
                    {selectedOutcome ? ` for “${selectedOutcome.label}”` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Flow</dt>
                  <dd>{formatFlow(quote.flowAmount)}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>{quote.outcomeAmount}</dd>
                </div>
                <div>
                  <dt>Slippage</dt>
                  <dd>{toleranceInput || "0"}%</dd>
                </div>
                <div>
                  <dt>Current probability</dt>
                  <dd>
                    {currentProbability !== null
                      ? `${(currentProbability * 100).toFixed(2)}%`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>New probability</dt>
                  <dd>
                    {quote.probabilities[outcomeIndex] !== undefined
                      ? `${(quote.probabilities[outcomeIndex]! * 100).toFixed(2)}%`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Price impact</dt>
                  <dd>
                    {priceImpact !== null
                      ? `${priceImpact >= 0 ? "+" : ""}${priceImpact.toFixed(2)}%`
                      : currentProbability !== null
                        ? "0.00%"
                        : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Probabilities</dt>
                  <dd>{quote.probabilities.map((p) => `${(p * 100).toFixed(2)}%`).join(" / ")}</dd>
                </div>
                <div>
                  <dt>Path</dt>
                  <dd>{quote.transactionPath}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Request a quote to see the trade calculation.</p>
            )}

            {execution && (
              <ExecutionStatus
                transactionId={execution.transactionId}
                network={execution.network}
                signer={execution.signer}
              />
            )}
          </div>

          <section className="market-trade__orderbook">
            <header className="market-trade__orderbook-header">
              <h3>Simulated order book</h3>
              {orderbook.currentPrice !== null && (
                <span className="market-trade__orderbook-price">
                  Current price: {formatPercentValue(orderbook.currentPrice)}
                </span>
              )}
            </header>
            {orderbook.buyLevels.length === 0 && orderbook.sellLevels.length === 0 ? (
              <p className="muted">Not enough data to build an order book.</p>
            ) : (
              <div className="orderbook-grid">
                <div className="orderbook-panel">
                  <div className="orderbook-panel__header">
                    <h4>Buy</h4>
                    <span className="orderbook-panel__caption">(+ shares → FLOW out)</span>
                  </div>
                  {orderbook.buyLevels.length === 0 ? (
                    <p className="muted">No liquidity available for buys.</p>
                  ) : (
                    <table className="orderbook-table">
                      <thead>
                        <tr>
                          <th>Shares</th>
                          <th>FLOW</th>
                          <th>Average price</th>
                          <th>New probability</th>
                          <th>Δ Prob.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderbook.buyLevels.map((level) => (
                          <tr key={`buy-${level.shares}`}>
                            <td>{formatSharesValue(level.shares)}</td>
                            <td className="orderbook-table__flow orderbook-table__flow--buy">
                              {formatFlowValue(level.flow)}
                            </td>
                            <td>{formatFlowPerShare(level.avgPrice)}</td>
                            <td>{formatPercentValue(level.priceAfter)}</td>
                            <td>
                              {level.slippage !== null
                                ? `${level.slippage >= 0 ? "+" : ""}${formatPercentValue(level.slippage)}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="orderbook-panel">
                  <div className="orderbook-panel__header">
                    <h4>Sell</h4>
                    <span className="orderbook-panel__caption">(- shares → FLOW back)</span>
                  </div>
                  {orderbook.sellLevels.length === 0 ? (
                    <p className="muted">No shares available to sell.</p>
                  ) : (
                    <table className="orderbook-table">
                      <thead>
                        <tr>
                          <th>Shares</th>
                          <th>FLOW</th>
                          <th>Average price</th>
                          <th>New probability</th>
                          <th>Δ Prob.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderbook.sellLevels.map((level) => (
                          <tr key={`sell-${level.shares}`}>
                            <td>{formatSharesValue(level.shares)}</td>
                            <td className="orderbook-table__flow orderbook-table__flow--sell">
                              {formatFlowValue(level.flow)}
                            </td>
                            <td>{formatFlowPerShare(level.avgPrice)}</td>
                            <td>{formatPercentValue(level.priceAfter)}</td>
                            <td>
                              {level.slippage !== null
                                ? `${level.slippage >= 0 ? "+" : ""}${formatPercentValue(level.slippage)}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="market-trade__history">
            <header className="market-trade__history-header">
              <h3>Trade history</h3>
              <button
                type="button"
                className="button tertiary"
                onClick={() => {
                  reloadHistory().catch((error) => {
                    console.error("Failed to refresh trade history", error);
                  });
                }}
                disabled={isHistoryLoading}
              >
                {isHistoryLoading ? "Refreshing…" : "Refresh"}
              </button>
            </header>
            {historyError && <p className="error-text">{historyError}</p>}
            {history.length > 0 ? (
              <ul>
                {history.map((item) => (
                  <li key={item.id}>
                    <strong>{item.isBuy ? "Buy" : "Sell"}</strong> {item.shares} → {formatFlow(item.flowAmount)} for “{item.outcomeLabel}” · {new Date(item.createdAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                {isHistoryLoading ? "Loading trade history…" : "No trades yet."}
              </p>
            )}
          </section>
        </>
      )}

      <footer className="market-trade__footnote">
        <p className="muted">
          Trades are executed via the backend service using the LMSR pool. Ensure API parameters are
          accurate before submitting orders.
        </p>
      </footer>

      {isConfirmOpen && pendingPayload && quote && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm trade</h3>
            <p>
              {pendingPayload.isBuy ? "Buy" : "Sell"} {sharesInput} shares for “
              {selectedOutcome?.label ?? "—"}” at a cost of {formatFlow(quote.flowAmount)}
            </p>
            <p>Slippage tolerance up to {toleranceInput || "0"}%.</p>
            <div className="modal__actions">
              <button type="button" className="button" onClick={confirmExecute} disabled={isExecuting}>
                {isExecuting ? "Executing…" : "Confirm"}
              </button>
              <button type="button" className="button secondary" onClick={cancelExecute}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};