export type TopShotMomentTier = "Common" | "Fandom" | "Rare" | "Legendary" | "Ultimate" | "Parallel" | "Unknown";

export interface TopShotMomentDetail {
  readonly id: string;
  readonly playId: string;
  readonly setId: string;
  readonly serialNumber: number;
  readonly playerId?: string;
  readonly fullName?: string;
  readonly teamName?: string;
  readonly teamId?: string;
  readonly primaryPosition?: string;
  readonly jerseyNumber?: string;
  readonly tier: TopShotMomentTier;
  readonly imageUrl?: string;
}

export interface TopShotMomentSnapshot extends TopShotMomentDetail {
  readonly ownerAddress: string;
  readonly capturedAt: Date;
}

export interface TopShotMomentLockDto {
  readonly id: string;
  readonly marketId: string;
  readonly eventId: string;
  readonly momentId: string;
  readonly userAddress: string;
  readonly rarity: TopShotMomentTier;
  readonly outcomeType: "home" | "away" | "draw" | "cancel" | "unknown";
  readonly outcomeIndex: number;
  readonly playerId?: string;
  readonly playerName?: string;
  readonly teamName?: string;
  readonly lockedAt: Date;
  readonly changeDeadline: Date;
  readonly lockedUntil: Date;
  readonly status: "ACTIVE" | "TRANSFERRED" | "RELEASED" | "CANCELLED" | "EXPIRED";
  readonly estimatedReward?: number;
}

export interface TopShotProjectedBonus {
  readonly momentId: string;
  readonly marketId: string;
  readonly eventId: string;
  readonly outcomeType: "home" | "away" | "draw" | "cancel" | "unknown";
  readonly playerId?: string;
  readonly playerName?: string;
  readonly rarity: TopShotMomentTier;
  readonly projectedPoints: number | null;
  readonly capPerMatch: number;
}

export interface TopShotRewardOutcome {
  readonly userAddress: string;
  readonly momentId: string;
  readonly pointsAwarded: number;
  readonly reason: string;
}
