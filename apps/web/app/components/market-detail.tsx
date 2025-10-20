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
  return (
    <article className="market-detail">
      <header>
        <span className="market-detail__state">{stateLabel[market.state]}</span>
        <h1>{market.title}</h1>
        <div className="market-detail__meta">
          <span className="category">Category: {market.category.toUpperCase()}</span>
          {market.tags.length > 0 && (
            <span className="tags">Tags: {market.tags.join(", ")}</span>
          )}
        </div>
        <p className="market-detail__description">{market.description}</p>
      </header>

      <section className="market-detail__stats">
        <div>
          <span className="label">Liquidity</span>
          <span className="value">{market.totalLiquidity.toLocaleString("en-US")}</span>
        </div>
        <div>
          <span className="label">Pool token</span>
          <span className="value">{market.liquidityPool.tokenSymbol}</span>
        </div>
        <div>
          <span className="label">Providers</span>
          <span className="value">{market.liquidityPool.providerCount}</span>
        </div>
        <div>
          <span className="label">LP fee</span>
          <span className="value">{market.liquidityPool.feeBps / 100}%</span>
        </div>
        <div>
          <span className="label">Created</span>
          <span className="value">{formatDateTime(market.createdAt)}</span>
        </div>
        <div>
          <span className="label">Scheduled close</span>
          <span className="value">{formatDateTime(market.closeAt)}</span>
        </div>
        <div>
          <span className="label">Launch</span>
          <span className="value">{formatDateTime(market.schedule.scheduledStartAt)}</span>
        </div>
        <div>
          <span className="label">Trading lock</span>
          <span className="value">{formatDateTime(market.schedule.tradingLockAt)}</span>
        </div>
        <div>
          <span className="label">Freeze window</span>
          <span className="value">
            {formatDateTime(market.schedule.freezeWindowStartAt)} —
            {formatDateTime(market.schedule.freezeWindowEndAt)}
          </span>
        </div>
        <div>
          <span className="label">Patrol threshold</span>
          <span className="value">{market.patrolThreshold.toFixed(2)}</span>
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
