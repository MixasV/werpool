"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MarketCategory, MarketState, MarketSummary } from "../lib/markets-api";
import { subscribeToTrades, type TradeEvent } from "../lib/market-realtime";
import { MarketCard } from "./market-card";

const stateOptions: Array<{ value: MarketState | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  // { value: "draft", label: "Draft" }, // Hidden: Draft markets not shown on public page
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Closed" },
  { value: "settled", label: "Settled" },
  { value: "voided", label: "Voided" },
];

const categoryLabels: Record<MarketCategory, string> = {
  crypto: "Crypto",
  sports: "Sports",
  esports: "Esports",
  custom: "Custom",
};

const categoryOptions: Array<{ value: MarketCategory | "all"; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "crypto", label: categoryLabels.crypto },
  { value: "sports", label: categoryLabels.sports },
  { value: "esports", label: categoryLabels.esports },
  { value: "custom", label: categoryLabels.custom },
];

const formatTagLabel = (tag: string): string => {
  if (!tag) {
    return tag;
  }
  const normalized = tag.replace(/#/g, "").trim();
  if (!normalized) {
    return tag;
  }
  return normalized.length === 1
    ? normalized.toUpperCase()
    : normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const MAX_FEED_ITEMS = 25;
const MAX_TRACKED_MARKETS = 12;

interface FeedEntry {
  id: string;
  slug: string;
  outcomeLabel: string;
  isBuy: boolean;
  shares: number;
  flowAmount: number;
  createdAt: string;
}

interface MarketsExplorerProps {
  markets: MarketSummary[];
}

const MarketsLiveFeed = ({ markets }: { markets: MarketSummary[] }) => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());

  const trackedMarkets = useMemo(() => markets.slice(0, MAX_TRACKED_MARKETS), [markets]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    const allowedSlugs = new Set(trackedMarkets.map((market) => market.slug));

    subscriptions.forEach((unsubscribe, slug) => {
      if (!allowedSlugs.has(slug)) {
        unsubscribe();
        subscriptions.delete(slug);
      }
    });

    trackedMarkets.forEach((market) => {
      if (subscriptions.has(market.slug)) {
        return;
      }

      try {
        const unsubscribe = subscribeToTrades(market.slug, (event: TradeEvent) => {
          const shares = Number.parseFloat(event.shares);
          const flow = Number.parseFloat(event.flowAmount);
          if (!Number.isFinite(shares) || !Number.isFinite(flow)) {
            return;
          }

          setEntries((prev) => {
            if (prev.some((entry) => entry.id === event.id)) {
              return prev;
            }

            const nextEntry: FeedEntry = {
              id: event.id,
              slug: event.slug,
              outcomeLabel: event.outcomeLabel,
              isBuy: event.isBuy,
              shares,
              flowAmount: flow,
              createdAt: event.createdAt,
            };

            const next = [nextEntry, ...prev].slice(0, MAX_FEED_ITEMS);
            next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return next;
          });
        });
        subscriptions.set(market.slug, unsubscribe);
      } catch (error) {
        console.error(`Failed to subscribe to trades for ${market.slug}`, error);
      }
    });
  }, [trackedMarkets]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions.clear();
    };
  }, []);

  const hasEntries = entries.length > 0;
  const trackedCount = trackedMarkets.length;
  const isActive = subscriptionsRef.current.size > 0;

  return (
    <aside className="markets-live-feed">
      <header className="markets-live-feed__header">
        <h3>Live market feed</h3>
        <span className="markets-live-feed__status" data-active={isActive}>
          {isActive ? "Online" : "Offline"}
        </span>
      </header>
      <p className="markets-live-feed__hint">
        {trackedCount > 0
          ? `Streaming updates for ${trackedCount} markets`
          : "Select markets to start the live feed"}
      </p>
      {hasEntries ? (
        <ul className="markets-live-feed__list">
          {entries.map((entry) => (
            <li key={entry.id} className="markets-live-feed__item">
              <div className="markets-live-feed__title">
                <span className="markets-live-feed__badge" data-type={entry.isBuy ? "buy" : "sell"}>
                  {entry.isBuy ? "Buy" : "Sell"}
                </span>
                <span>
                  {entry.shares.toFixed(2)} SHARES · “{entry.outcomeLabel}”
                </span>
              </div>
              <div className="markets-live-feed__meta">
                <span className="markets-live-feed__slug">#{entry.slug}</span>
                <span className="markets-live-feed__flow" data-type={entry.isBuy ? "buy" : "sell"}>
                  {entry.isBuy ? "−" : "+"}
                  {entry.flowAmount.toFixed(2)} FLOW
                </span>
                <span>{new Date(entry.createdAt).toLocaleTimeString("en-US")}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted markets-live-feed__empty">
          Trades will appear as soon as activity happens on the selected markets.
        </p>
      )}
    </aside>
  );
};

export const MarketsExplorer = ({ markets }: MarketsExplorerProps) => {
  const [stateFilter, setStateFilter] = useState<MarketState | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<MarketCategory | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    markets.forEach((market) => {
      market.tags.forEach((tag) => {
        const normalized = tag.trim().toLowerCase();
        if (normalized) {
          tagSet.add(normalized);
        }
      });
    });
    return Array.from(tagSet).sort();
  }, [markets]);

  const filtered = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return markets.filter((market) => {
      const matchesState = stateFilter === "all" || market.state === stateFilter;
      const matchesCategory = categoryFilter === "all" || market.category === categoryFilter;

      const normalizedTags = market.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
      const matchesTags =
        selectedTags.length === 0 || selectedTags.every((tag) => normalizedTags.includes(tag));

      const matchesSearch =
        normalizedSearch.length === 0 ||
        market.title.toLowerCase().includes(normalizedSearch) ||
        market.slug.toLowerCase().includes(normalizedSearch) ||
        normalizedTags.some((tag) => tag.includes(normalizedSearch));

      return matchesState && matchesCategory && matchesTags && matchesSearch;
    });
  }, [markets, stateFilter, categoryFilter, selectedTags, searchTerm]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((existing) => existing !== tag) : [...prev, tag]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setStateFilter("all");
    setCategoryFilter("all");
    setSearchTerm("");
    setSelectedTags([]);
  }, []);

  const hasFiltersApplied =
    stateFilter !== "all" ||
    categoryFilter !== "all" ||
    selectedTags.length > 0 ||
    searchTerm.trim().length > 0;

  const feedSource = filtered.length > 0 ? filtered : markets;

  return (
    <section className="markets-page__content">
      <div className="markets-page__filters">
        <div className="markets-page__filter-row">
          <label className="markets-page__filter">
            <span>Status</span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as MarketState | "all")}
            >
              {stateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="markets-page__filter">
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as MarketCategory | "all")
              }
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="markets-page__filter markets-page__search">
            <span>Search</span>
            <input
              type="search"
              placeholder="Title, slug, or tag"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <span className="markets-page__counter">Found: {filtered.length}</span>

          {hasFiltersApplied && (
            <button
              type="button"
              className="button tertiary markets-page__reset"
              onClick={clearFilters}
            >
              Reset
            </button>
          )}
        </div>

        {availableTags.length > 0 && (
          <div className="markets-page__tags">
            {availableTags.map((tag) => (
              <button
                type="button"
                key={tag}
                className="markets-page__tag"
                data-active={selectedTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                #{formatTagLabel(tag)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="markets-page__layout">
        <div className="markets-page__grid-wrapper">
          {filtered.length > 0 ? (
            <div className="markets-grid">
              {filtered.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          ) : (
            <p className="muted">No markets match the selected filters.</p>
          )}
        </div>
        <MarketsLiveFeed markets={feedSource} />
      </div>
    </section>
  );
};
