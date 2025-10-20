import { MarketSchedule, PatrolSignalSeverity } from "../domain/market";
import { MarketDto } from "./market.dto";

export interface MarketActionRequestBaseDto {
  signer?: string;
  network?: string;
}

export interface ActivateMarketRequestDto extends MarketActionRequestBaseDto {}

export interface SuspendMarketRequestDto extends MarketActionRequestBaseDto {
  reason?: string;
}

export interface VoidMarketRequestDto extends MarketActionRequestBaseDto {}

export interface CloseMarketRequestDto extends MarketActionRequestBaseDto {
  reason?: string;
  closedAt?: string;
}

export interface SettleMarketRequestDto extends MarketActionRequestBaseDto {
  outcomeId: number;
  resolvedOutcomeId: string;
  txHash: string;
  notes?: string;
}

export interface OverrideSettlementRequestDto extends MarketActionRequestBaseDto {
  outcomeId: number;
  resolvedOutcomeId: string;
  txHash: string;
  notes?: string;
  reason: string;
}

export interface UpdateMarketScheduleRequestDto
  extends MarketActionRequestBaseDto,
    Partial<MarketSchedule> {}

export interface UpdatePatrolThresholdRequestDto extends MarketActionRequestBaseDto {
  patrolThreshold: number;
}

export interface RecordPatrolSignalRequestDto extends MarketActionRequestBaseDto {
  issuer?: string;
  severity: PatrolSignalSeverity;
  code: string;
  weight: number;
  expiresAt?: string;
  notes?: string;
}

export interface ClearPatrolSignalRequestDto extends MarketActionRequestBaseDto {
  patrolAddress: string;
}

export interface MarketActionResponseDto {
  market: MarketDto;
  transactionPath: string;
  cadenceArguments: { type: string; value: unknown }[];
  transactionId: string;
  signer: string;
  network: string;
}
