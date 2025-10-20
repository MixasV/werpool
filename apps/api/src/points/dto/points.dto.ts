import { PointEventSource } from "@prisma/client";

export interface PointsSummaryDto {
  address: string;
  total: number;
  updatedAt: string;
}

export interface PointLedgerEntryDto {
  id: string;
  address: string;
  source: PointEventSource;
  amount: number;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface LeaderboardEntryDto {
  address: string;
  total: number;
  rank: number;
}
