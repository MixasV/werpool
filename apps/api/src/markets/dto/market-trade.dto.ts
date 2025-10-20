import { MarketTrade as PrismaMarketTrade } from "@prisma/client";

const decimalToString = (value: PrismaMarketTrade["shares"]): string =>
  value.toString();

export interface MarketTradeDto {
  id: string;
  marketId: string;
  outcomeId: string | null;
  outcomeLabel: string;
  outcomeIndex: number;
  shares: string;
  flowAmount: string;
  isBuy: boolean;
  probabilities: number[];
  maxFlowAmount?: string;
  transactionId: string;
  signer: string;
  network: string;
  createdAt: string;
}

export const toMarketTradeDto = (trade: PrismaMarketTrade): MarketTradeDto => ({
  id: trade.id,
  marketId: trade.marketId,
  outcomeId: trade.outcomeId,
  outcomeLabel: trade.outcomeLabel,
  outcomeIndex: trade.outcomeIndex,
  shares: decimalToString(trade.shares),
  flowAmount: decimalToString(trade.flowAmount),
  isBuy: trade.isBuy,
  probabilities: Array.isArray(trade.probabilities)
    ? (trade.probabilities as number[])
    : [],
  maxFlowAmount: trade.maxFlowAmount ? decimalToString(trade.maxFlowAmount) : undefined,
  transactionId: trade.transactionId,
  signer: trade.signer,
  network: trade.network,
  createdAt: trade.createdAt.toISOString(),
});
