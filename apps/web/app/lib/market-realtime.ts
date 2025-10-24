"use client";

import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "./api-client";
import type { MarketPoolState } from "./markets-api";

interface PoolStateUpdatePayload {
  marketId: string;
  slug: string;
  state: MarketPoolState;
  timestamp: string;
}

type PoolStateListener = (payload: PoolStateUpdatePayload) => void;

export interface TransactionLogEvent {
  id: string;
  marketId: string;
  slug: string;
  type: string;
  status: string;
  transactionId: string;
  signer: string;
  network: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface TradeEvent {
  id: string;
  marketId: string;
  slug: string;
  outcomeId: string | null;
  outcomeLabel: string;
  outcomeIndex: number;
  shares: string;
  flowAmount: string;
  isBuy: boolean;
  probabilities: number[];
  maxFlowAmount?: string;
  transactionId: string;
  signer: string;
  network: string;
  createdAt: string;
}

type TransactionListener = (payload: TransactionLogEvent) => void;
type TradeListener = (payload: TradeEvent) => void;
type AnalyticsListener = (payload: AnalyticsEvent) => void;

export interface AnalyticsEvent {
  id: string;
  marketId: string;
  slug: string;
  outcomeId: string | null;
  outcomeIndex: number;
  outcomeLabel: string;
  interval: string;
  bucketStart: string;
  bucketEnd: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  averagePrice: number;
  volumeShares: number;
  volumeFlow: number;
  netFlow: number;
  tradeCount: number;
  updatedAt: string;
}

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL ?? API_BASE_URL;

let socket: Socket | null = null;
interface ListenerEntry {
  pool: Set<PoolStateListener>;
  transaction: Set<TransactionListener>;
  trade: Set<TradeListener>;
  analytics: Set<AnalyticsListener>;
}

const listenerRegistry = new Map<string, ListenerEntry>();

const getOrCreateEntry = (slug: string): ListenerEntry => {
  const existing = listenerRegistry.get(slug);
  if (existing) {
    return existing;
  }

  const entry: ListenerEntry = {
    pool: new Set<PoolStateListener>(),
    transaction: new Set<TransactionListener>(),
    trade: new Set<TradeListener>(),
    analytics: new Set<AnalyticsListener>(),
  };
  listenerRegistry.set(slug, entry);
  return entry;
};

const totalListeners = (entry: ListenerEntry): number =>
  entry.pool.size + entry.transaction.size + entry.trade.size + entry.analytics.size;

const getSocket = (): Socket => {
  if (!socket) {
    const socketUrl = `${WS_BASE_URL}/markets`;
    socket = io(socketUrl, {
      path: '/socket.io',
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });

    socket.on("connect_error", (error) => {
      console.error("Market realtime: connection error", error);
    });

    socket.on("market.pool-state", (payload: PoolStateUpdatePayload) => {
      const entry = listenerRegistry.get(payload.slug);
      if (!entry) {
        return;
      }
      entry.pool.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error("Market realtime: pool-state handler failed", error);
        }
      });
    });

    socket.on("market.transaction", (payload: TransactionLogEvent) => {
      const entry = listenerRegistry.get(payload.slug);
      if (!entry) {
        return;
      }
      entry.transaction.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error("Market realtime: transaction handler failed", error);
        }
      });
    });

    socket.on("market.trade", (payload: TradeEvent) => {
      const entry = listenerRegistry.get(payload.slug);
      if (!entry) {
        return;
      }
      entry.trade.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error("Market realtime: trade handler failed", error);
        }
      });
    });

    socket.on("market.analytics", (payload: AnalyticsEvent) => {
      const entry = listenerRegistry.get(payload.slug);
      if (!entry) {
        return;
      }
      entry.analytics.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error("Market realtime: analytics handler failed", error);
        }
      });
    });
  }

  return socket;
};

const subscribeInternal = <
  T extends PoolStateListener | TransactionListener | TradeListener | AnalyticsListener
>(
  slug: string,
  type: "pool" | "transaction" | "trade" | "analytics",
  listener: T
): (() => void) => {
  const normalized = slug.trim();
  if (!normalized) {
    throw new Error("Slug is required to subscribe for market updates");
  }

  const socketInstance = getSocket();
  const entry = getOrCreateEntry(normalized);
  const before = totalListeners(entry);

  entry[type].add(listener as never);

  if (before === 0) {
    socketInstance.emit("market.subscribe", { slug: normalized });
  }

  return () => {
    const stored = listenerRegistry.get(normalized);
    if (!stored) {
      return;
    }

    stored[type].delete(listener as never);

    if (totalListeners(stored) === 0) {
      listenerRegistry.delete(normalized);
      socketInstance.emit("market.unsubscribe", { slug: normalized });
    }
  };
};

export const subscribeToPoolState = (
  slug: string,
  listener: PoolStateListener
): (() => void) => {
  return subscribeInternal(slug, "pool", listener);
};

export const subscribeToTransactions = (
  slug: string,
  listener: TransactionListener
): (() => void) => subscribeInternal(slug, "transaction", listener);

export const subscribeToTrades = (
  slug: string,
  listener: TradeListener
): (() => void) => subscribeInternal(slug, "trade", listener);

export const subscribeToAnalytics = (
  slug: string,
  listener: AnalyticsListener
): (() => void) => subscribeInternal(slug, "analytics", listener);

export const disconnectRealtime = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
    listenerRegistry.clear();
  }
};
