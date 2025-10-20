import { promises as fs } from "fs";
import * as path from "path";

import type {
  AiSportsMarketAccessRequirements,
  AiSportsOracleConfig,
} from "../../types/aisports.types";

export interface PersistedMarketSnapshot {
  id: string;
  title: string;
  description: string;
  category: string;
  type: string;
  resolutionTime: string;
  createdAt: string;
  isActive: boolean;
  isResolved: boolean;
  outcome?: string | number | null;
  oracleConfig: AiSportsOracleConfig;
  currentData: {
    value: number;
    participants?: number;
    timeRemaining: string;
    lastUpdate: string;
  };
  accessRequirements: AiSportsMarketAccessRequirements;
  poolState: {
    liquidityParameter: number;
    bVector: number[];
    outcomeSupply: number[];
    totalLiquidity: number;
  };
  tradeVolume: number;
  tradeCount: number;
  yesPrice: number;
  noPrice: number;
  lastTradeAt?: string | null;
}

export interface PersistedTradeSnapshot {
  id: string;
  marketId: string;
  outcome: "YES" | "NO";
  shares: number;
  flowAmount: number;
  isBuy: boolean;
  price: number;
  signer: string | null;
  createdAt: string;
  probabilities: number[];
}

export interface PersistedMetaSnapshot {
  version: number;
  updatedAt: string;
  markets: PersistedMarketSnapshot[];
  trades: Record<string, PersistedTradeSnapshot[]>;
}

const SNAPSHOT_VERSION = 1;

export class MetaMarketStore {
  private readonly mode: "memory" | "file";
  private readonly filePath: string | null;
  private inMemorySnapshot: PersistedMetaSnapshot | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(rawLocation: string | undefined | null) {
    const normalized = rawLocation?.trim();
    if (!normalized || normalized === "memory") {
      this.mode = "memory";
      this.filePath = null;
    } else {
      this.mode = "file";
      this.filePath = path.isAbsolute(normalized)
        ? normalized
        : path.resolve(process.cwd(), normalized);
    }
  }

  async load(): Promise<PersistedMetaSnapshot | null> {
    if (this.mode === "memory") {
      return this.inMemorySnapshot;
    }

    if (!this.filePath) {
      return null;
    }

    try {
      const data = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(data) as PersistedMetaSnapshot;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      if (typeof parsed.version !== "number") {
        return null;
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async save(snapshot: PersistedMetaSnapshot): Promise<void> {
    const payload: PersistedMetaSnapshot = {
      ...snapshot,
      version: SNAPSHOT_VERSION,
      updatedAt: new Date().toISOString(),
    };

    if (this.mode === "memory") {
      this.inMemorySnapshot = payload;
      return;
    }

    if (!this.filePath) {
      return;
    }

    const directory = path.dirname(this.filePath);

    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(this.filePath!, JSON.stringify(payload, null, 2), "utf8");
    });

    await this.writeChain;
  }
}
