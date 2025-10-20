export type MarketState =
  | "draft"
  | "live"
  | "suspended"
  | "closed"
  | "settled"
  | "voided";

export type MarketCategory = "crypto" | "sports" | "esports" | "custom";

export type PatrolSignalSeverity = "info" | "warning" | "critical";

export interface MarketSchedule {
  scheduledStartAt?: string;
  tradingLockAt?: string;
  freezeWindowStartAt?: string;
  freezeWindowEndAt?: string;
}

export type OutcomeStatus = "active" | "suspended" | "settled";

export interface Outcome {
  id: string;
  index?: number;
  label: string;
  status: OutcomeStatus;
  impliedProbability: number;
  liquidity: number;
  metadata?: Record<string, unknown>;
}

export interface PatrolSignal {
  id: string;
  issuer: string;
  severity: PatrolSignalSeverity;
  code: string;
  weight: number;
  createdAt: string;
  expiresAt?: string;
  notes?: string;
}

export interface LiquidityPool {
  id: string;
  tokenSymbol: string;
  totalLiquidity: number;
  feeBps: number;
  providerCount: number;
}

export type WorkflowActionType =
  | "open"
  | "suspend"
  | "settle"
  | "void"
  | "distribute"
  | "custom";

export type WorkflowActionStatus = "pending" | "scheduled" | "executed" | "failed";

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  status: WorkflowActionStatus;
  description: string;
  scheduledAt?: string;
  executedAt?: string;
  triggersAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Settlement {
  id: string;
  resolvedOutcomeId: string;
  txId: string;
  settledAt: string;
  notes?: string;
  overrideReason?: string;
}

export interface Market {
  id: string;
  slug: string;
  title: string;
  description: string;
  state: MarketState;
  category: MarketCategory;
  tags: string[];
  oracleId?: string;
  patrolThreshold?: number;
  createdAt: string;
  closeAt?: string;
  schedule: MarketSchedule;
  liquidityPool: LiquidityPool;
  outcomes: Outcome[];
  workflow: WorkflowAction[];
  settlement?: Settlement;
  patrolSignals: PatrolSignal[];
}
