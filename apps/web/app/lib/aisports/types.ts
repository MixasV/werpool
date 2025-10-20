export type AiSportsAccessLevel = "none" | "basic" | "advanced" | "premium";

export type AiSportsMarketCategory =
  | "aiSports_Meta"
  | "aiSports_User_Performance"
  | "aiSports_NFT"
  | "aiSports_Community";

export type AiSportsMarketType = "yes_no" | "multiple_choice" | "scalar";

export type AiSportsComparisonType =
  | "greater_than"
  | "less_than"
  | "equal_to"
  | "top_percentage";

export type AiSportsNftRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export interface AiSportsNft {
  id: string;
  rarity: AiSportsNftRarity;
  type: string;
  metadata: Record<string, unknown>;
}

export interface AiSportsUserData {
  address: string;
  fantasyScore: number;
  juiceBalance: number;
  nfts: readonly AiSportsNft[];
  lastActivity: string;
  accessLevel: AiSportsAccessLevel;
}

export interface AiSportsTournamentStats {
  totalParticipants: number;
  currentPrizePool: number;
  averageScore: number;
  activeContests: number;
  timestamp: string;
}

export interface AiSportsOracleConfig {
  dataSource: string;
  targetValue?: number;
  comparisonType?: AiSportsComparisonType;
  resolutionFunction: string;
}

export interface AiSportsMarketSnapshot {
  value: number;
  participants?: number;
  timeRemaining: string;
  lastUpdate: string;
}

export interface AiSportsAccessRequirements {
  minimumFantasyScore?: number;
  minimumJuiceBalance?: number;
  requiredNftRarity?: readonly AiSportsNftRarity[];
  requiresActiveParticipation?: boolean;
}

export type MetaMarketOutcome = "YES" | "NO";

export interface MetaMarketPoolState {
  liquidityParameter: number;
  bVector: readonly number[];
  outcomeSupply: readonly number[];
  totalLiquidity: number;
}

export interface MetaMarketTrade {
  id: string;
  marketId: string;
  outcome: MetaMarketOutcome;
  shares: number;
  flowAmount: number;
  isBuy: boolean;
  price: number;
  signer: string | null;
  createdAt: string;
  probabilities: readonly number[];
}

export interface MetaMarketQuote {
  marketId: string;
  outcome: MetaMarketOutcome;
  shares: number;
  flowAmount: number;
  price: number;
  probabilities: readonly number[];
  poolState: MetaMarketPoolState;
}

export interface MetaMarketExecutionResult {
  market: MetaPredictionMarket;
  quote: MetaMarketQuote;
  trade: MetaMarketTrade;
}

export interface MetaMarketTradePayload {
  outcome: MetaMarketOutcome;
  shares: number;
}

export interface AiSportsLeaderboardEntry {
  address: string;
  score: number;
  rank: number;
}

export interface MetaPredictionMarket {
  id: string;
  title: string;
  description: string;
  category: AiSportsMarketCategory;
  type: AiSportsMarketType;
  resolutionTime: string;
  createdAt: string;
  isActive: boolean;
  isResolved: boolean;
  outcome?: string | number;
  oracleConfig: AiSportsOracleConfig;
  currentData: AiSportsMarketSnapshot;
  accessRequirements: AiSportsAccessRequirements;
  poolState: MetaMarketPoolState;
  tradeVolume: number;
  tradeCount: number;
  yesPrice: number;
  noPrice: number;
  lastTradeAt?: string | null;
}
