import { QuoteTradeRequestDto, QuoteTradeResponseDto } from "./quote-trade.dto";

export interface TopShotSelectionDto {
  momentId: string;
  estimatedReward?: number;
}

export interface ExecuteTradeRequestDto extends QuoteTradeRequestDto {
  signer?: string;
  network?: string;
  maxFlowAmount?: number;
  topShotSelection?: TopShotSelectionDto | null;
}

export interface ExecuteTradeResponseDto extends QuoteTradeResponseDto {
  transactionId: string;
  signer: string;
  network: string;
}
