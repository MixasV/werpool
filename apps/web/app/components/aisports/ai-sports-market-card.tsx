"use client";

import { useMemo } from "react";

import type {
  AiSportsUserData,
  MetaMarketOutcome,
  MetaPredictionMarket,
} from "../../lib/aisports/types";

const categoryPalette: Record<string, string> = {
  aiSports_Meta: "linear-gradient(135deg, rgba(255,107,107,0.28), rgba(255,214,10,0.2))",
  aiSports_User_Performance: "linear-gradient(135deg, rgba(78,205,196,0.28), rgba(42,157,143,0.2))",
  aiSports_NFT: "linear-gradient(135deg, rgba(69,183,209,0.28), rgba(64,81,181,0.2))",
  aiSports_Community: "linear-gradient(135deg, rgba(150,206,180,0.28), rgba(72,202,228,0.2))",
};

const formatTimeRemaining = (iso: string): string => {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) {
    return "Closed";
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours <= 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
};

const formatNumber = (value?: number): string => {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
};

const formatPercent = (value?: number): string => {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

interface AiSportsMarketCardProps {
  market: MetaPredictionMarket;
  user?: AiSportsUserData | null;
  onSelect?: (market: MetaPredictionMarket, outcome: MetaMarketOutcome) => void;
  disabled?: boolean;
}

export const AiSportsMarketCard = ({ market, user, onSelect, disabled }: AiSportsMarketCardProps) => {
  const gradient = categoryPalette[market.category] ?? categoryPalette.aiSports_Meta;
  const canInteract = !disabled && market.isActive && !market.isResolved && typeof onSelect === "function";

  const requirementHints = useMemo(() => {
    const hints: string[] = [];
    const reqs = market.accessRequirements;
    if (reqs.minimumFantasyScore) {
      hints.push(`Score ≥ ${reqs.minimumFantasyScore}`);
    }
    if (reqs.minimumJuiceBalance) {
      hints.push(`$JUICE ≥ ${reqs.minimumJuiceBalance}`);
    }
    if (reqs.requiredNftRarity && reqs.requiredNftRarity.length > 0) {
      hints.push(`NFT: ${reqs.requiredNftRarity.join(", ")}`);
    }
    if (reqs.requiresActiveParticipation) {
      hints.push("Active aiSports participation required");
    }
    return hints;
  }, [market.accessRequirements]);

  return (
    <article className="ai-market-card" style={{ backgroundImage: gradient }}>
      <header className="ai-market-card__header">
        <span className="ai-market-card__category">{market.category.replace("aiSports_", "")}</span>
        <span className="ai-market-card__countdown">{formatTimeRemaining(market.resolutionTime)}</span>
      </header>
      <h3 className="ai-market-card__title">{market.title}</h3>
      <p className="ai-market-card__description">{market.description}</p>

      <dl className="ai-market-card__stats">
        <div>
          <dt>Current value</dt>
          <dd>{formatNumber(market.currentData.value)}</dd>
        </div>
        {typeof market.currentData.participants === "number" ? (
          <div>
            <dt>Participants</dt>
            <dd>{formatNumber(market.currentData.participants)}</dd>
          </div>
        ) : null}
        {market.oracleConfig.targetValue != null ? (
          <div>
            <dt>Target</dt>
            <dd>{formatNumber(market.oracleConfig.targetValue)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Probability YES</dt>
          <dd>{formatPercent(market.yesPrice)}</dd>
        </div>
        <div>
          <dt>Probability NO</dt>
          <dd>{formatPercent(market.noPrice)}</dd>
        </div>
        <div>
          <dt>Trades</dt>
          <dd>{market.tradeCount.toLocaleString("en-US")}</dd>
        </div>
      </dl>

      {user ? (
        <section className="ai-market-card__user">
          <div>
            <span className="ai-market-card__user-label">Your score</span>
            <strong>{formatNumber(user.fantasyScore)}</strong>
          </div>
          <div>
            <span className="ai-market-card__user-label">$JUICE balance</span>
            <strong>{formatNumber(user.juiceBalance)}</strong>
          </div>
          <div>
            <span className="ai-market-card__user-label">Access</span>
            <strong className={`ai-market-card__badge ai-market-card__badge--${user.accessLevel}`}>
              {user.accessLevel.toUpperCase()}
            </strong>
          </div>
        </section>
      ) : (
        <section className="ai-market-card__user ai-market-card__user--restricted">
          <span>Connect your aiSports account to participate</span>
        </section>
      )}

      {requirementHints.length > 0 ? (
        <ul className="ai-market-card__requirements">
          {requirementHints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}

      <footer className="ai-market-card__actions" data-disabled={!canInteract}>
        <button
          type="button"
          disabled={!canInteract}
          onClick={() => onSelect?.(market, "YES")}
        >
          YES
        </button>
        <button
          type="button"
          disabled={!canInteract}
          onClick={() => onSelect?.(market, "NO")}
        >
          NO
        </button>
      </footer>

      {market.isResolved ? (
        <div className="ai-market-card__resolved">Outcome: {market.outcome ?? "—"}</div>
      ) : (
        <div className="ai-market-card__meta">
          <span>Last trade: {formatDateTime(market.lastTradeAt ?? null)}</span>
        </div>
      )}
    </article>
  );
};
