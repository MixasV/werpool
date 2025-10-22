const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export async function fetchMarketTransactions(marketId: string) {
  const response = await fetch(`${API_BASE_URL}/analytics/markets/${marketId}/transactions`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch transactions');
  }

  return response.json();
}

export async function fetchSettlementProof(marketId: string) {
  const response = await fetch(`${API_BASE_URL}/analytics/markets/${marketId}/settlement-proof`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch settlement proof');
  }

  return response.json();
}

export async function fetchTradingVolumeAnalytics(marketId?: string) {
  const url = marketId
    ? `${API_BASE_URL}/analytics/trading-volume?marketId=${marketId}`
    : `${API_BASE_URL}/analytics/trading-volume`;

  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch trading volume');
  }

  return response.json();
}

export async function fetchUserActivity(address: string) {
  const response = await fetch(`${API_BASE_URL}/analytics/users/${address}/activity`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user activity');
  }

  return response.json();
}
