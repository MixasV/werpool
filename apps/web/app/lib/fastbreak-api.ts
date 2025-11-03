import { API_BASE_URL, parseJson } from "./api-client";
import type { MarketSummary } from "./markets-api";

/**
 * FastBreak Markets API
 * 
 * Fetches prediction markets for NBA TopShot FastBreak Runs
 * Markets are auto-created by backend when new Runs start
 */

export interface FastBreakMarket extends MarketSummary {
  runId?: string;
  runName?: string;
}

/**
 * Fetch all FastBreak prediction markets
 */
export async function fetchFastBreakMarkets(): Promise<FastBreakMarket[]> {
  const url = `${API_BASE_URL}/fastbreak/markets`;
  
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch FastBreak markets: ${response.statusText}`);
  }

  const data = await parseJson<{ total: number; markets: any[] }>(response);
  
  // Backend returns { total, markets }
  if (data.markets && Array.isArray(data.markets)) {
    return data.markets.map((market) => {
      // Extract runId from tags (format: "run:xxx-xxx-xxx")
      const runTag = market.tags?.find((tag: string) => tag.startsWith('run:'));
      const runId = runTag?.replace('run:', '');
      
      // Extract run name from tags (format: last tag is usually the name)
      const runName = market.tags?.find((tag: string) => 
        !tag.startsWith('run:') && tag !== 'fastbreak'
      );

      return {
        ...market,
        runId,
        runName,
      };
    });
  }

  return [];
}

/**
 * Fetch single FastBreak market by ID
 */
export async function fetchFastBreakMarket(id: string): Promise<FastBreakMarket | null> {
  const url = `${API_BASE_URL}/fastbreak/markets/${id}`;
  
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch FastBreak market: ${response.statusText}`);
  }

  const market = await parseJson(response);
  
  // Extract metadata from tags
  const runTag = market.tags?.find((tag: string) => tag.startsWith('run:'));
  const runId = runTag?.replace('run:', '');
  const runName = market.tags?.find((tag: string) => 
    !tag.startsWith('run:') && tag !== 'fastbreak'
  );

  return {
    ...market,
    runId,
    runName,
  };
}

/**
 * Trigger market creation for new FastBreak Runs (admin only)
 */
export async function createMarketsForNewRuns(): Promise<{
  totalRuns: number;
  created: number;
  skipped: number;
}> {
  const url = `${API_BASE_URL}/fastbreak/markets/create-for-new-runs`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to create markets: ${response.statusText}`);
  }

  return parseJson(response);
}

/**
 * Trigger settlement for completed FastBreak Runs (admin only)
 */
export async function settleCompletedMarkets(): Promise<{
  total: number;
  settled: number;
  pending: number;
}> {
  const url = `${API_BASE_URL}/fastbreak/markets/settle-completed`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to settle markets: ${response.statusText}`);
  }

  return parseJson(response);
}
