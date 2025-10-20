export interface LmsrState {
  liquidityParameter: number;
  bVector: number[];
  totalLiquidity: number;
  outcomeSupply: number[];
}

export interface LmsrTradeInput {
  outcomeIndex: number;
  shares: number;
  isBuy: boolean;
}

export interface LmsrTradeQuote {
  flowAmount: number;
  outcomeAmount: number;
  newBVector: number[];
  newTotalLiquidity: number;
  newOutcomeSupply: number[];
  probabilities: number[];
}
