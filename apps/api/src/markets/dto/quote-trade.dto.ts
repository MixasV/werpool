export interface QuoteTradeRequestDto {
  outcomeIndex: number;
  shares: number;
  isBuy: boolean;
  signer?: string;
}

export interface QuoteTradeResponseDto {
  flowAmount: string;
  outcomeAmount: string;
  newBVector: string[];
  newTotalLiquidity: string;
  newOutcomeSupply: string[];
  probabilities: number[];
  cadenceArguments: Array<{ type: string; value: unknown }>;
  transactionPath: string;
  userPositionInfo?: {
    currentPosition: number;
    maxPosition: number;
    remainingCapacity: number;
    wouldExceedLimit: boolean;
  };
}
