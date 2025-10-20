import { MarketTransactionLog } from "@prisma/client";

const toRecord = (payload: MarketTransactionLog["payload"]): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
};

export interface MarketTransactionDto {
  id: string;
  marketId: string;
  type: string;
  status: string;
  transactionId: string;
  signer: string;
  network: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export const toMarketTransactionDto = (
  entry: MarketTransactionLog
): MarketTransactionDto => ({
  id: entry.id,
  marketId: entry.marketId,
  type: entry.type,
  status: entry.status,
  transactionId: entry.transactionId,
  signer: entry.signer,
  network: entry.network,
  payload: toRecord(entry.payload),
  createdAt: entry.createdAt.toISOString(),
});
