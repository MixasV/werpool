const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export interface FastBreakChallenge {
  id: string;
  type: string;
  bettingType: string;
  creator: string;
  creatorUsername?: string;
  opponent?: string;
  opponentUsername?: string;
  creatorStake: number;
  opponentStake?: number;
  question: string;
  duration: number;
  closeAt: string;
  state: string;
  createdAt: string;
  matchedAt?: string;
  settledAt?: string;
  winnerAddress?: string;
  creatorRank?: number;
  opponentRank?: number;
  marketId?: string;
}

export async function fetchFastBreakChallenges(): Promise<FastBreakChallenge[]> {
  const response = await fetch(`${API_BASE_URL}/fastbreak/challenges`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch challenges');
  }

  return response.json();
}

export async function fetchFastBreakChallenge(id: string): Promise<FastBreakChallenge> {
  const response = await fetch(`${API_BASE_URL}/fastbreak/challenges/${id}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch challenge');
  }

  return response.json();
}

export async function createFastBreakChallenge(data: any) {
  const response = await fetch(`${API_BASE_URL}/fastbreak/challenges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create challenge');
  }

  return response.json();
}

export async function acceptFastBreakChallenge(id: string) {
  const response = await fetch(`${API_BASE_URL}/fastbreak/challenges/${id}/accept`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to accept challenge');
  }

  return response.json();
}

export async function cancelFastBreakChallenge(id: string) {
  const response = await fetch(`${API_BASE_URL}/fastbreak/challenges/${id}/cancel`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to cancel challenge');
  }

  return response.json();
}
