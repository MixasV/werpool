import {
  MarketCategory,
  MarketSchedule,
  MarketState,
  OutcomeStatus,
  PatrolSignalSeverity,
  WorkflowActionStatus,
  WorkflowActionType,
} from "../domain/market";

export interface CreateOutcomeDto {
  label: string;
  status?: OutcomeStatus;
  impliedProbability: number;
  liquidity: number;
  metadata?: Record<string, unknown>;
}

export interface CreateLiquidityPoolDto {
  tokenSymbol: string;
  totalLiquidity: number;
  feeBps: number;
  providerCount: number;
}

export interface CreateWorkflowActionDto {
  type: WorkflowActionType;
  status?: WorkflowActionStatus;
  description: string;
  triggersAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSettlementDto {
  resolvedOutcomeId: string;
  txId: string;
  settledAt: string;
  notes?: string;
}

export interface CreateScheduleDto extends MarketSchedule {}

export interface CreatePatrolSignalDto {
  issuer: string;
  severity: PatrolSignalSeverity;
  code: string;
  weight: number;
  notes?: string;
  expiresAt?: string;
}

export interface CreateMarketDto {
  slug: string;
  title: string;
  description: string;
  state?: MarketState;
  category?: MarketCategory;
  tags?: string[];
  oracleId?: string;
  patrolThreshold?: number;
  closeAt?: string;
  schedule?: CreateScheduleDto;
  liquidityPool: CreateLiquidityPoolDto;
  outcomes: CreateOutcomeDto[];
  workflow?: CreateWorkflowActionDto[];
  settlement?: CreateSettlementDto;
  patrolSignals?: CreatePatrolSignalDto[];
}

export interface UpdateMarketDto extends CreateMarketDto {
  id?: string;
}
