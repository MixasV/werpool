/**
 * API Client for Top Shot Rewards & Moment Locking
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface TopShotReward {
  id: string;
  lockId: string;
  userAddress: string;
  marketId: string;
  eventId: string;
  outcomeIndex: number;
  momentId: string;
  points: number;
  awardedAt: string;
  metadata?: {
    playerId?: string;
    playerName?: string;
    rarity?: string;
    score?: number;
    multiplier?: number;
    ownershipFactor?: number;
    netShares?: number;
  };
}

export interface MomentLock {
  id: string;
  userAddress: string;
  marketId: string;
  eventId: string;
  momentId: string;
  rarity: string;
  playerId?: string;
  playerName?: string;
  teamName?: string;
  outcomeType: string;
  outcomeIndex: number;
  lockedAt: string;
  changeDeadline: string;
  lockedUntil: string;
  releasedAt?: string | null;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  estimatedReward?: number | null;
  metadata?: any;
}

export interface TopShotMoment {
  id: string;
  flowId: string;
  play: {
    stats: {
      playerName: string;
      playerId: string;
      teamName?: string;
    };
  };
  serialNumber: number;
  tier: string;
}

/**
 * Get user's Top Shot rewards
 */
export async function getUserTopShotRewards(address: string): Promise<TopShotReward[]> {
  const response = await fetch(`${API_BASE_URL}/topshot/rewards/${address}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Top Shot rewards');
  }

  return response.json();
}

/**
 * Get user's moment locks
 */
export async function getUserMomentLocks(address: string): Promise<MomentLock[]> {
  const response = await fetch(`${API_BASE_URL}/topshot/locks/${address}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch moment locks');
  }

  return response.json();
}

/**
 * Get user's Top Shot moments
 */
export async function getUserMoments(address: string): Promise<TopShotMoment[]> {
  const response = await fetch(`${API_BASE_URL}/topshot/moments/${address}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Top Shot moments');
  }

  return response.json();
}

/**
 * Lock a moment to an event
 */
export async function lockMoment(params: {
  marketId: string;
  eventId: string;
  momentId: string;
  outcomeIndex: number;
}): Promise<MomentLock> {
  const response = await fetch(`${API_BASE_URL}/topshot/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to lock moment');
  }

  return response.json();
}

/**
 * Update locked moment (change outcome before deadline)
 */
export async function updateMomentLock(lockId: string, outcomeIndex: number): Promise<MomentLock> {
  const response = await fetch(`${API_BASE_URL}/topshot/lock/${lockId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ outcomeIndex }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update moment lock');
  }

  return response.json();
}

/**
 * Release a moment lock
 */
export async function releaseMomentLock(lockId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/topshot/lock/${lockId}/release`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to release moment lock');
  }
}
