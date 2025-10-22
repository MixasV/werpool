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
  readonly id: string;
  readonly rarity: AiSportsNftRarity;
  readonly type: string;
  readonly metadata: Record<string, unknown>;
}

export interface AiSportsUserData {
  readonly address: string;
  readonly fantasyScore: number;
  readonly juiceBalance: number;
  readonly nfts: readonly AiSportsNft[];
  readonly lastActivity: Date;
  readonly accessLevel: AiSportsAccessLevel;
}

export interface AiSportsTournamentStats {
  readonly totalParticipants: number;
  readonly currentPrizePool: number;
  readonly averageScore: number;
  readonly activeContests: number;
  readonly timestamp: Date;
}

export interface AiSportsOracleConfig {
  readonly dataSource: string;
  readonly targetValue?: number;
  readonly comparisonType?: AiSportsComparisonType;
  readonly resolutionFunction: string;
}

export interface AiSportsMarketData {
  readonly value: number;
  readonly participants?: number;
  readonly timeRemaining: string;
  readonly lastUpdate: Date;
}

export interface AiSportsMarketAccessRequirements {
  readonly minimumFantasyScore?: number;
  readonly minimumJuiceBalance?: number;
  readonly requiredNftRarity?: readonly AiSportsNftRarity[];
  readonly requiresActiveParticipation?: boolean;
}

export type MetaMarketOutcome = "YES" | "NO";

export interface MetaMarketPoolState {
  readonly liquidityParameter: number;
  readonly bVector: readonly number[];
  readonly outcomeSupply: readonly number[];
  readonly totalLiquidity: number;
}

export interface MetaMarketTrade {
  readonly id: string;
  readonly marketId: string;
  readonly outcome: MetaMarketOutcome;
  readonly shares: number;
  readonly flowAmount: number;
  readonly isBuy: boolean;
  readonly price: number;
  readonly signer: string | null;
  readonly createdAt: Date;
  readonly probabilities: readonly number[];
  readonly txId?: string;
  readonly txStatus?: 'pending' | 'sealed' | 'failed';
}

export interface MetaMarketQuote {
  readonly marketId: string;
  readonly outcome: MetaMarketOutcome;
  readonly shares: number;
  readonly flowAmount: number;
  readonly price: number;
  readonly probabilities: readonly number[];
  readonly poolState: MetaMarketPoolState;
}

export interface MetaMarketExecutionResult {
  readonly market: MetaPredictionMarket;
  readonly quote: MetaMarketQuote;
  readonly trade: MetaMarketTrade;
  readonly txResult?: {
    readonly txId: string;
    readonly status: 'pending' | 'sealed' | 'failed';
    readonly timestamp: Date;
    readonly blockHeight?: number;
  };
}

export interface MetaPredictionMarket {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: AiSportsMarketCategory;
  readonly type: AiSportsMarketType;
  readonly resolutionTime: Date;
  readonly createdAt: Date;
  readonly isActive: boolean;
  readonly isResolved: boolean;
  readonly outcome?: string | number;
  readonly oracleConfig: AiSportsOracleConfig;
  readonly currentData: AiSportsMarketData;
  readonly accessRequirements: AiSportsMarketAccessRequirements;
  readonly poolState: MetaMarketPoolState;
  readonly tradeVolume: number;
  readonly tradeCount: number;
  readonly yesPrice: number;
  readonly noPrice: number;
  readonly lastTradeAt?: Date;
}

export interface AiSportsLeaderboardEntry {
  readonly address: string;
  readonly score: number;
  readonly rank: number;
}
