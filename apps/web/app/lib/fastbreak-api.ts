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

  const market = await parseJson<any>(response);
  
  // Extract metadata from tags
  const runTag = market?.tags?.find((tag: string) => tag.startsWith('run:'));
  const runId = runTag?.replace('run:', '');
  const runName = market?.tags?.find((tag: string) => 
    !tag.startsWith('run:') && tag !== 'fastbreak'
  );

  return {
    ...market,
    runId,
    runName,
  } as FastBreakMarket;
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

/**
 * FastBreak Challenges API
 */

export interface FastBreakChallenge {
  id: string;
  creatorId: string;
  opponentId?: string;
  question: string;
  stake: number;
  creatorStake?: number;
  opponentStake?: number;
  status: string;
  state: string;
  type: string;
  createdAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  closeAt?: string;
  winnerId?: string;
  creatorPick?: number;
  opponentPick?: number;
  creator?: { id: string; address: string; username?: string };
  opponent?: { id: string; address: string; username?: string };
  creatorUsername?: string;
  opponentUsername?: string;
  duration?: number;
}

export async function fetchFastBreakChallenges(): Promise<FastBreakChallenge[]> {
  const url = `${API_BASE_URL}/fastbreak/challenges`;
  
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch challenges: ${response.statusText}`);
  }

  return parseJson<FastBreakChallenge[]>(response);
}

export async function fetchFastBreakChallenge(id: string): Promise<FastBreakChallenge | null> {
  const url = `${API_BASE_URL}/fastbreak/challenges/${id}`;
  
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
    throw new Error(`Failed to fetch challenge: ${response.statusText}`);
  }

  return parseJson<FastBreakChallenge>(response);
}

export async function createFastBreakChallenge(data: {
  question: string;
  stake?: number;
  stakeAmount?: number;
  opponentId?: string;
  opponentUsername?: string;
  type?: string;
  bettingType?: string;
  duration?: number;
}): Promise<FastBreakChallenge> {
  const url = `${API_BASE_URL}/fastbreak/challenges`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create challenge: ${response.statusText}`);
  }

  return parseJson<FastBreakChallenge>(response);
}

export async function acceptFastBreakChallenge(id: string): Promise<FastBreakChallenge> {
  const url = `${API_BASE_URL}/fastbreak/challenges/${id}/accept`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to accept challenge: ${response.statusText}`);
  }

  return parseJson<FastBreakChallenge>(response);
}

export async function cancelFastBreakChallenge(id: string): Promise<void> {
  const url = `${API_BASE_URL}/fastbreak/challenges/${id}`;
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to cancel challenge: ${response.statusText}`);
  }
}
