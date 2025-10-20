import { QuoteTradeRequestDto, QuoteTradeResponseDto } from "./quote-trade.dto";

export interface ExecuteTradeRequestDto extends QuoteTradeRequestDto {
  signer?: string;
  network?: string;
  maxFlowAmount?: number;
}

export interface ExecuteTradeResponseDto extends QuoteTradeResponseDto {
  transactionId: string;
  signer: string;
  network: string;
}
