import { ExecuteTradeResponseDto } from "./execute-trade.dto";

export interface ClaimRewardsRequestDto {
  outcomeIndex: number;
  shares: number;
  signer?: string;
  network?: string;
  maxFlowAmount?: number;
}

export interface ClaimRewardsResponseDto extends ExecuteTradeResponseDto {
  claimAmount: string;
  claimedShares: string;
}
