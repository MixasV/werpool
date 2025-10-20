import {
  LiquidityPool,
  Market,
  MarketSchedule,
  Outcome,
  PatrolSignal,
  Settlement,
  WorkflowAction,
} from "../domain/market";

export interface OutcomeDto {
  id: string;
  index?: number;
  label: string;
  status: Outcome["status"];
  impliedProbability: number;
  liquidity: number;
  metadata?: Record<string, unknown>;
}

export interface LiquidityPoolDto {
  id: string;
  tokenSymbol: string;
  totalLiquidity: number;
  feeBps: number;
  providerCount: number;
}

export interface WorkflowActionDto {
  id: string;
  type: WorkflowAction["type"];
  status: WorkflowAction["status"];
  description: string;
  scheduledAt?: string;
  executedAt?: string;
  triggersAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SettlementDto {
  id: string;
  resolvedOutcomeId: string;
  txId: string;
  settledAt: string;
  notes?: string;
  overrideReason?: string;
}

export interface MarketScheduleDto extends MarketSchedule {}

export interface PatrolSignalDto {
  id: string;
  issuer: string;
  severity: PatrolSignal["severity"];
  code: string;
  weight: number;
  createdAt: string;
  expiresAt?: string;
  notes?: string;
}

export interface MarketSummaryDto {
  id: string;
  slug: string;
  title: string;
  state: Market["state"];
  category: Market["category"];
  tags: string[];
  createdAt: string;
  closeAt?: string;
  primaryOutcomeId: string;
  totalLiquidity: number;
}

export interface MarketDto extends MarketSummaryDto {
  description: string;
  oracleId?: string;
  patrolThreshold?: number;
  schedule: MarketScheduleDto;
  liquidityPool: LiquidityPoolDto;
  outcomes: OutcomeDto[];
  workflow: WorkflowActionDto[];
  settlement?: SettlementDto;
  patrolSignals: PatrolSignalDto[];
}

const mapOutcome = (outcome: Outcome): OutcomeDto => ({
  id: outcome.id,
  index: outcome.index,
  label: outcome.label,
  status: outcome.status,
  impliedProbability: outcome.impliedProbability,
  liquidity: outcome.liquidity,
  metadata: outcome.metadata,
});

const mapLiquidityPool = (pool: LiquidityPool): LiquidityPoolDto => ({
  id: pool.id,
  tokenSymbol: pool.tokenSymbol,
  totalLiquidity: pool.totalLiquidity,
  feeBps: pool.feeBps,
  providerCount: pool.providerCount,
});

const mapWorkflowAction = (action: WorkflowAction): WorkflowActionDto => ({
  id: action.id,
  type: action.type,
  status: action.status,
  description: action.description,
  scheduledAt: action.scheduledAt,
  executedAt: action.executedAt,
  triggersAt: action.triggersAt,
  metadata: action.metadata,
});

const mapSettlement = (settlement: Settlement): SettlementDto => ({
  id: settlement.id,
  resolvedOutcomeId: settlement.resolvedOutcomeId,
  txId: settlement.txId,
  settledAt: settlement.settledAt,
  notes: settlement.notes,
  overrideReason: settlement.overrideReason,
});

const mapSchedule = (schedule: MarketSchedule): MarketScheduleDto => ({
  scheduledStartAt: schedule.scheduledStartAt,
  tradingLockAt: schedule.tradingLockAt,
  freezeWindowStartAt: schedule.freezeWindowStartAt,
  freezeWindowEndAt: schedule.freezeWindowEndAt,
});

const mapPatrolSignal = (signal: PatrolSignal): PatrolSignalDto => ({
  id: signal.id,
  issuer: signal.issuer,
  severity: signal.severity,
  code: signal.code,
  weight: signal.weight,
  createdAt: signal.createdAt,
  expiresAt: signal.expiresAt,
  notes: signal.notes,
});

export const toMarketSummaryDto = (market: Market): MarketSummaryDto => ({
  id: market.id,
  slug: market.slug,
  title: market.title,
  state: market.state,
  category: market.category,
  tags: market.tags,
  createdAt: market.createdAt,
  closeAt: market.closeAt,
  primaryOutcomeId: market.outcomes[0]?.id ?? "",
  totalLiquidity: market.liquidityPool.totalLiquidity,
});

export const toMarketDto = (market: Market): MarketDto => ({
  ...toMarketSummaryDto(market),
  description: market.description,
  oracleId: market.oracleId,
  patrolThreshold: market.patrolThreshold,
  schedule: mapSchedule(market.schedule),
  liquidityPool: mapLiquidityPool(market.liquidityPool),
  outcomes: market.outcomes.map(mapOutcome),
  workflow: market.workflow.map(mapWorkflowAction),
  settlement: market.settlement ? mapSettlement(market.settlement) : undefined,
  patrolSignals: market.patrolSignals.map(mapPatrolSignal),
});
