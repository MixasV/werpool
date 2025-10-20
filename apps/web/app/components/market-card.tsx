'use client';

import Link from "next/link";

import type { MarketSummary } from "../lib/markets-api";

const statePalette: Record<MarketSummary["state"], string> = {
  draft: "var(--market-draft-bg)",
  live: "var(--market-live-bg)",
  suspended: "var(--market-suspended-bg)",
  closed: "var(--market-closed-bg)",
  settled: "var(--market-settled-bg)",
  voided: "var(--market-void-bg)",
};

const stateLabel: Record<MarketSummary["state"], string> = {
  draft: "Draft",
  live: "Live",
  suspended: "Suspended",
  closed: "Closed",
  settled: "Settled",
  voided: "Voided",
};

const formatDate = (value?: string): string => {
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

const formatLiquidity = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US");
};

interface MarketCardProps {
  market: MarketSummary;
}

export const MarketCard = ({ market }: MarketCardProps) => {
  return (
    <Link 
      className="market-card" 
      href={`/markets/${market.slug ?? market.id}`}
      aria-label={`View market: ${market.title}`}
    >
      <div
        className="market-card__status"
        style={{ background: statePalette[market.state] }}
        role="status"
        aria-label={`Market status: ${stateLabel[market.state]}`}
      >
        {stateLabel[market.state]}
      </div>
      <h3>{market.title}</h3>
      <dl className="market-card__meta">
        <div>
          <dt>Created</dt>
          <dd>{formatDate(market.createdAt)}</dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>{formatDate(market.closeAt)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{market.category.toUpperCase()}</dd>
        </div>
        <div>
          <dt>Liquidity</dt>
          <dd>{formatLiquidity(market.totalLiquidity)}</dd>
        </div>
      </dl>
    </Link>
  );
};
