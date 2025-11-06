import type { MarketDetail } from "../lib/markets-api";

const formatDateTime = (value?: string): string => {
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

const stateLabel: Record<MarketDetail["state"], string> = {
  draft: "Draft",
  live: "Live",
  suspended: "Suspended",
  closed: "Closed",
  settled: "Settled",
  voided: "Voided",
};

const percentage = (value: number): string => `${Math.round(value * 100)}%`;

export const MarketDetailPanel = ({ market }: { market: MarketDetail }) => {
  const formatVolume = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString("en-US");
  };

  return (
    <article className="market-detail">
      <header>
        <span className="market-detail__state">{stateLabel[market.state]}</span>
        <h1>{market.title}</h1>
        <p className="market-detail__description">{market.description}</p>
      </header>

      {/* Simplified stats bar */}
      <section className="market-detail__stats-bar">
        <div className="stat-item">
          <span className="stat-label">Volume</span>
          <span className="stat-value">{formatVolume(market.totalLiquidity)} FLOW</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Closes</span>
          <span className="stat-value">{formatDateTime(market.closeAt)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Category</span>
          <span className="stat-value">{market.category.toUpperCase()}</span>
        </div>
      </section>

      <section className="market-detail__outcomes">
        <h2>Outcomes</h2>
        <div className="outcomes-grid">
          {market.outcomes.map((outcome) => (
            <div key={outcome.id} className="outcome-card">
              <div className="outcome-card__header">
                <h3>{outcome.label}</h3>
                <span className={`status status--${outcome.status}`}>{outcome.status}</span>
              </div>
              <dl>
                <div>
                  <dt>Probability</dt>
                  <dd>{percentage(outcome.impliedProbability)}</dd>
                </div>
                <div>
                  <dt>Liquidity</dt>
                  <dd>{outcome.liquidity.toLocaleString("en-US")}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="market-detail__workflow">
        <h2>Workflow</h2>
        <ol>
          {market.workflow.map((action) => (
            <li key={action.id} className={`workflow-item workflow-item--${action.status}`}>
              <div className="workflow-item__meta">
                <span className="workflow-item__type">{action.type.toUpperCase()}</span>
                <time>
                  {formatDateTime(action.scheduledAt ?? action.triggersAt)}
                  {action.executedAt && ` → ${formatDateTime(action.executedAt)}`}
                </time>
              </div>
              <p>{action.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {market.patrolSignals.length > 0 && (
        <section className="market-detail__patrol">
          <h2>Patrol signals</h2>
          <ul>
            {market.patrolSignals.map((signal) => (
              <li key={signal.id} className={`patrol-signal patrol-signal--${signal.severity}`}>
                <div className="patrol-signal__header">
                  <span className="issuer">{signal.issuer}</span>
                  <span className="weight">Weight: {signal.weight.toFixed(2)}</span>
                </div>
                <div className="patrol-signal__body">
                  <span className="code">{signal.code}</span>
                  <span className="created">{formatDateTime(signal.createdAt)}</span>
                  {signal.expiresAt && (
                    <span className="expires">until {formatDateTime(signal.expiresAt)}</span>
                  )}
                </div>
                {signal.notes && <p className="notes">{signal.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="market-detail__settlement">
        <h2>Settlement</h2>
        {market.settlement ? (
          <dl className="settlement-grid">
            <div>
              <dt>Outcome</dt>
              <dd>{market.settlement.resolvedOutcomeId}</dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd>{market.settlement.txId}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDateTime(market.settlement.settledAt)}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{market.settlement.notes ?? "—"}</dd>
            </div>
            <div>
              <dt>Override reason</dt>
              <dd>{market.settlement.overrideReason ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Market is not settled yet.</p>
        )}
      </section>
    </article>
  );
};
