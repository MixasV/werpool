import { API_BASE_URL, parseJson, withAuthHeaders } from "../api-client";
import type {
  AiSportsLeaderboardEntry,
  AiSportsUserData,
  MetaMarketExecutionResult,
  MetaMarketQuote,
  MetaMarketTrade,
  MetaMarketTradePayload,
  MetaPredictionMarket,
} from "./types";

export const listMetaMarkets = async (address?: string): Promise<MetaPredictionMarket[]> => {
  const params = new URLSearchParams();
  if (address) {
    params.set("address", address);
  }

  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/meta${params.toString() ? `?${params.toString()}` : ""}`,
    withAuthHeaders({ cache: "no-store" })
  );

  return parseJson<MetaPredictionMarket[]>(response);
};

export const getMetaMarket = async (id: string): Promise<MetaPredictionMarket | null> => {
  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/meta/${encodeURIComponent(id)}`,
    withAuthHeaders({ cache: "no-store" })
  );

  if (response.status === 404) {
    return null;
  }

  return parseJson<MetaPredictionMarket | null>(response);
};

export const getAiSportsProfile = async (address: string): Promise<AiSportsUserData> => {
  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/profile/${encodeURIComponent(address)}`,
    withAuthHeaders({ cache: "no-store" })
  );
  return parseJson<AiSportsUserData>(response);
};

export const quoteMetaMarket = async (
  marketId: string,
  payload: MetaMarketTradePayload
): Promise<MetaMarketQuote> => {
  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/meta/${encodeURIComponent(marketId)}/quote`,
    withAuthHeaders(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
      { allowApiTokenFallback: true }
    )
  );
  return parseJson<MetaMarketQuote>(response);
};

export const executeMetaMarket = async (
  marketId: string,
  payload: MetaMarketTradePayload
): Promise<MetaMarketExecutionResult> => {
  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/meta/${encodeURIComponent(marketId)}/execute`,
    withAuthHeaders(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
      { allowApiTokenFallback: false }
    )
  );
  return parseJson<MetaMarketExecutionResult>(response);
};

export const listMetaMarketTrades = async (
  marketId: string,
  limit = 25
): Promise<MetaMarketTrade[]> => {
  const params = Number.isFinite(limit) ? `?limit=${Math.max(1, Math.floor(limit))}` : "";
  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/meta/${encodeURIComponent(marketId)}/trades${params}`,
    withAuthHeaders({ cache: "no-store" })
  );
  return parseJson<MetaMarketTrade[]>(response);
};

export const getAiSportsLeaderboard = async (
  limit = 20
): Promise<AiSportsLeaderboardEntry[]> => {
  const params = Number.isFinite(limit) ? `?limit=${Math.max(1, Math.floor(limit))}` : "";
  const response = await fetch(
    `${API_BASE_URL}/oracles/aisports/leaderboard${params}`,
    withAuthHeaders({ cache: "no-store" })
  );
  return parseJson<AiSportsLeaderboardEntry[]>(response);
};
