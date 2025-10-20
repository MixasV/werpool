"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import type {
  CreatePoolPayload,
  CreatePoolResult,
  MarketPoolState,
  MintOutcomePayload,
  MintOutcomeResult,
  Outcome,
} from "../lib/markets-api";
import { subscribeToPoolState } from "../lib/market-realtime";
import { useFlowWallet } from "../providers/flow-wallet-provider";
import { ExecutionStatus } from "./execution-status";

interface MarketLiquidityPanelProps {
  marketSlug: string;
  outcomes: Outcome[];
  initialState: MarketPoolState | null;
  refreshPool: () => Promise<MarketPoolState>;
  onCreatePool: (payload: CreatePoolPayload) => Promise<CreatePoolResult>;
  onMint: (payload: MintOutcomePayload) => Promise<MintOutcomeResult>;
  onBurn: (payload: MintOutcomePayload) => Promise<MintOutcomeResult>;
}

type LiquidityActionResult =
  | { kind: "create"; result: CreatePoolResult }
  | { kind: "mint"; result: MintOutcomeResult }
  | { kind: "burn"; result: MintOutcomeResult };

const formatNumber = (value: number | string, options?: Intl.NumberFormatOptions) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: numeric < 1 ? 4 : 2,
    ...(options ?? {}),
  });
};

const formatOutcomeList = (outcomes: Outcome[]) =>
  outcomes.map((outcome, index) => `${index + 1}. ${outcome.label}`).join("\n");

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

const networkDefault = process.env.NEXT_PUBLIC_FLOW_NETWORK ?? "emulator";

export const MarketLiquidityPanel = ({
  marketSlug,
  outcomes,
  initialState,
  refreshPool,
  onCreatePool,
  onMint,
  onBurn,
}: MarketLiquidityPanelProps) => {
  const [poolState, setPoolState] = useState<MarketPoolState | null>(initialState);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LiquidityActionResult | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createLiquidityParam, setCreateLiquidityParam] = useState("10");
  const [createSeedAmount, setCreateSeedAmount] = useState("100");
  const [mintAmount, setMintAmount] = useState("50");
  const [burnAmount, setBurnAmount] = useState("10");
  const [isRefreshing, startRefresh] = useTransition();
  const [isCreating, startCreate] = useTransition();
  const [isMinting, startMint] = useTransition();
  const [isBurning, startBurn] = useTransition();
  const { addr, loggedIn, isReady, logIn, logOut } = useFlowWallet();

  useEffect(() => {
    setPoolState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (!marketSlug) {
      return () => {};
    }

    const unsubscribe = subscribeToPoolState(marketSlug, (payload) => {
      setPoolState(payload.state);
    });

    return unsubscribe;
  }, [marketSlug]);

  const updatePoolFromServer = useCallback(async () => {
    try {
      const updated = await refreshPool();
      setPoolState(updated);
    } catch (refreshErr) {
      const message = refreshErr instanceof Error ? refreshErr.message : "Failed to refresh pool";
      setPoolError(message);
    }
  }, [refreshPool]);

  const refreshPoolState = useCallback(async () => {
    startRefresh(async () => {
      setPoolError(null);
      await updatePoolFromServer();
    });
  }, [updatePoolFromServer]);

  const ensureWallet = useCallback(async () => {
    if (!loggedIn) {
      await logIn();
      return false;
    }
    return true;
  }, [loggedIn, logIn]);

  const outcomeCount = outcomes.length;
  const poolExists = Boolean(poolState);

  const poolSummary = useMemo(() => {
    if (!poolState) {
      return null;
    }

    return {
      liquidityParameter: formatNumber(poolState.liquidityParameter),
      totalLiquidity: formatNumber(poolState.totalLiquidity),
      bVector: poolState.bVector.map((value) => formatNumber(value)).join(" / "),
      outcomeSupply: poolState.outcomeSupply.map((value) => formatNumber(value)).join(" / "),
    };
  }, [poolState]);

  const handleCreatePool = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const liquidityParameter = Number.parseFloat(createLiquidityParam);
    const seedAmountValue = Number.parseFloat(createSeedAmount);

    if (!Number.isFinite(liquidityParameter) || liquidityParameter <= 0) {
      setError("Enter a positive liquidity parameter");
      return;
    }

    if (!Number.isFinite(seedAmountValue) || seedAmountValue <= 0) {
      setError("Enter a positive seed liquidity amount");
      return;
    }

    startCreate(async () => {
      setError(null);
      setActionMessage(null);
      const walletReady = await ensureWallet();
      if (!walletReady) {
        return;
      }

      try {
        const payload: CreatePoolPayload = {
          outcomeCount,
          liquidityParameter,
          seedAmount: seedAmountValue,
          signer: addr ?? undefined,
          network: networkDefault,
        };

        const result = await onCreatePool(payload);
        setLastAction({ kind: "create", result });
        setActionMessage(
          `Created pool with parameter ${formatNumber(liquidityParameter)} and initial liquidity ${formatNumber(seedAmountValue)}`
        );
        await updatePoolFromServer();
      } catch (createError) {
        console.error("Failed to create pool", createError);
        setError(
          createError instanceof Error
            ? createError.message
            : "Failed to create pool"
        );
      }
    });
  };

  const handleMint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountValue = Number.parseFloat(mintAmount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Enter a positive amount to add liquidity");
      return;
    }

    startMint(async () => {
      setError(null);
      setActionMessage(null);
      const walletReady = await ensureWallet();
      if (!walletReady) {
        return;
      }

      try {
        const payload: MintOutcomePayload = {
          amount: amountValue,
          signer: addr ?? undefined,
          network: networkDefault,
        };

        const result = await onMint(payload);
        setLastAction({ kind: "mint", result });
        setActionMessage(`Added liquidity: ${formatNumber(result.amount)} FLOW`);
        setMintAmount("0");
        await updatePoolFromServer();
      } catch (mintError) {
        console.error("Failed to add liquidity", mintError);
        setError(
          mintError instanceof Error
            ? mintError.message
            : "Failed to add liquidity"
        );
      }
    });
  };

  const handleBurn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountValue = Number.parseFloat(burnAmount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Enter a positive amount to remove liquidity");
      return;
    }

    startBurn(async () => {
      setError(null);
      setActionMessage(null);
      const walletReady = await ensureWallet();
      if (!walletReady) {
        return;
      }

      try {
        const payload: MintOutcomePayload = {
          amount: amountValue,
          signer: addr ?? undefined,
          network: networkDefault,
        };

        const result = await onBurn(payload);
        setLastAction({ kind: "burn", result });
        setActionMessage(`Removed liquidity: ${formatNumber(result.amount)} FLOW`);
        setBurnAmount("0");
        await updatePoolFromServer();
      } catch (burnError) {
        console.error("Failed to remove liquidity", burnError);
        setError(
          burnError instanceof Error
            ? burnError.message
            : "Failed to remove liquidity"
        );
      }
    });
  };

  const lastTransaction = useMemo(() => {
    if (!lastAction) {
      return null;
    }

    if (lastAction.kind === "create") {
      return {
        transactionId: lastAction.result.transactionId,
        network: lastAction.result.network,
        signer: lastAction.result.signer,
      };
    }

    return {
      transactionId: lastAction.result.transactionId,
      network: lastAction.result.network,
      signer: lastAction.result.signer,
    };
  }, [lastAction]);

  return (
    <section className="market-liquidity">
      <header className="market-liquidity__header">
        <div>
          <h2>Liquidity provider tools</h2>
          <p className="muted">
            Manage LMSR pool shares and track state changes directly from the market interface.
          </p>
        </div>
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

      {poolSummary ? (
        <dl className="market-liquidity__stats">
          <div>
            <dt>Liquidity parameter</dt>
            <dd>{poolSummary.liquidityParameter}</dd>
          </div>
          <div>
            <dt>Total liquidity</dt>
            <dd>{poolSummary.totalLiquidity}</dd>
          </div>
          <div>
            <dt>B vector</dt>
            <dd>{poolSummary.bVector}</dd>
          </div>
          <div>
            <dt>Outcome supply</dt>
            <dd>{poolSummary.outcomeSupply}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted">Pool has not been created yet. Provide launch parameters and sign the transaction.</p>
      )}

      {poolError && <p className="error-text">{poolError}</p>}
      {error && <p className="error-text">{error}</p>}
      {actionMessage && <p className="success-text">{actionMessage}</p>}

      <details className="market-liquidity__outcomes" open>
        <summary>Market outcomes</summary>
        <pre>{formatOutcomeList(outcomes)}</pre>
      </details>

      <div className="market-liquidity__actions">
        <form className="market-liquidity__form" onSubmit={handleCreatePool}>
          <h3>Create pool</h3>
          <p className="muted">
            Initialize the liquidity pool. The outcome count is derived automatically.
          </p>
          <div className="market-liquidity__form-grid">
            <label>
              <span>Liquidity parameter</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={createLiquidityParam}
                onChange={(event) => setCreateLiquidityParam(event.target.value)}
              />
            </label>
            <label>
              <span>Seed liquidity (FLOW)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={createSeedAmount}
                onChange={(event) => setCreateSeedAmount(event.target.value)}
              />
            </label>
            <label>
              <span>Outcome count</span>
              <input type="number" value={outcomeCount} readOnly />
            </label>
          </div>
          <div className="market-liquidity__form-actions">
            <button
              type="submit"
              className="button primary"
              disabled={isCreating || poolExists}
            >
              {isCreating ? "Creating…" : poolExists ? "Pool already exists" : "Create pool"}
            </button>
          </div>
        </form>

        <form className="market-liquidity__form" onSubmit={handleMint}>
          <h3>Add liquidity</h3>
          <p className="muted">
            Mint additional outcome tokens and deposit them to tighten the spread.
          </p>
          <div className="market-liquidity__form-grid">
            <label>
              <span>Amount (FLOW)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={mintAmount}
                onChange={(event) => setMintAmount(event.target.value)}
              />
            </label>
          </div>
          <div className="market-liquidity__form-actions">
            <button
              type="submit"
              className="button secondary"
              disabled={isMinting || !poolExists}
            >
              {isMinting ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        <form className="market-liquidity__form" onSubmit={handleBurn}>
          <h3>Remove liquidity</h3>
          <p className="muted">
            Burn outcome tokens and withdraw your portion of the pool. Available only after pool creation.
          </p>
          <div className="market-liquidity__form-grid">
            <label>
              <span>Amount (FLOW)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={burnAmount}
                onChange={(event) => setBurnAmount(event.target.value)}
              />
            </label>
          </div>
          <div className="market-liquidity__form-actions">
            <button
              type="submit"
              className="button tertiary"
              disabled={isBurning || !poolExists}
            >
              {isBurning ? "Removing…" : "Remove"}
            </button>
          </div>
        </form>
      </div>

      <div className="market-liquidity__footer">
        <button
          type="button"
          className="button tertiary"
          onClick={() => {
            void refreshPoolState();
          }}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing…" : "Refresh pool state"}
        </button>
      </div>

      {lastTransaction && (
        <ExecutionStatus
          transactionId={lastTransaction.transactionId}
          network={lastTransaction.network}
          signer={lastTransaction.signer}
        />
      )}
    </section>
  );
};
