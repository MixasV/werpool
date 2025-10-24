import { Injectable, Logger } from "@nestjs/common";
import * as fcl from "@onflow/fcl";

import {
  AiSportsIntegrationConfig,
  resolveAiSportsIntegrationConfig,
} from "../common/aisports-config.util";
import {
  AiSportsNft,
  AiSportsNftRarity,
  AiSportsTournamentStats,
  AiSportsUserData,
  AiSportsAccessLevel,
} from "../types/aisports.types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_FAILSAFE_VALUE = 0;

@Injectable()
export class AiSportsFlowService {
  private readonly logger = new Logger(AiSportsFlowService.name);
  private readonly config: AiSportsIntegrationConfig;
  private fclConfigured = false;

  private readonly fantasyScoreCache = new Map<string, CacheEntry<number>>();
  private readonly juiceBalanceCache = new Map<string, CacheEntry<number>>();
  private readonly nftCache = new Map<string, CacheEntry<AiSportsNft[]>>();
  private tournamentStatsCache: CacheEntry<AiSportsTournamentStats> | null = null;

  constructor() {
    this.config = resolveAiSportsIntegrationConfig();
    if (this.config.enabled) {
      this.configureFcl();
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async ping(): Promise<boolean> {
    if (!this.config.enabled) {
      return true;
    }

    try {
      await this.getTournamentStats({ bypassCache: true });
      return true;
    } catch (error) {
      this.logger.warn(`aiSports ping failed: ${(error as Error).message}`);
      return false;
    }
  }

  async getUserFantasyScore(address: string): Promise<number> {
    if (!this.config.enabled) {
      return DEFAULT_FAILSAFE_VALUE;
    }

    return this.getOrLoad(
      this.fantasyScoreCache,
      address,
      this.config.cache.userDataTtlMs,
      async () => {
        const response = await this.executeQuery<string | number>(
          `
            import aiSportsMinter from ${this.config.contracts.minter}

            access(all) fun main(userAddress: Address): UFix64 {
              return aiSportsMinter.getUserTotalScore(userAddress)
            }
          `,
          [address]
        );
        const numeric = typeof response === "string" ? Number.parseFloat(response) : Number(response);
        if (!Number.isFinite(numeric)) {
          return DEFAULT_FAILSAFE_VALUE;
        }
        return numeric;
      }
    );
  }

  async getJuiceBalance(address: string): Promise<number> {
    if (!this.config.enabled) {
      return DEFAULT_FAILSAFE_VALUE;
    }

    return this.getOrLoad(
      this.juiceBalanceCache,
      address,
      this.config.cache.userDataTtlMs,
      async () => {
        const response = await this.executeQuery<string | number | null>(
          `
            import aiSportsJuice from ${this.config.contracts.juice}
            import FungibleToken from 0x9a0766d93b6608b7

            access(all) fun main(userAddress: Address): UFix64? {
              let account = getAccount(userAddress)
              let capability = account.getCapability<&{FungibleToken.Balance}>(/public/aiSportsJuiceBalance)
              let balanceRef = capability.borrow()
              return balanceRef?.balance
            }
          `,
          [address]
        );

        if (response == null) {
          return DEFAULT_FAILSAFE_VALUE;
        }

        const numeric = typeof response === "string" ? Number.parseFloat(response) : Number(response);
        if (!Number.isFinite(numeric)) {
          return DEFAULT_FAILSAFE_VALUE;
        }
        return numeric;
      }
    );
  }

  async getUserNfts(address: string): Promise<AiSportsNft[]> {
    if (!this.config.enabled) {
      return [];
    }

    return this.getOrLoad(
      this.nftCache,
      address,
      this.config.cache.nftTtlMs,
      async () => {
        const response = await this.executeQuery<Array<Record<string, unknown>>>(
          `
            import aiSportsMinter from ${this.config.contracts.minter}
            import NonFungibleToken from 0x1d7e57aa55817448

            access(all) struct NFTInfo {
              access(all) let id: UInt64
              access(all) let rarity: String
              access(all) let nftType: String
              access(all) let metadata: {String: AnyStruct}
            }

            access(all) fun main(userAddress: Address): [NFTInfo] {
              let account = getAccount(userAddress)
              let capability = account.getCapability<&{NonFungibleToken.CollectionPublic}>(/public/aiSportsNFTCollection)
              let collection = capability.borrow()
              if collection == nil {
                return []
              }

              let ids = collection!.getIDs()
              var result: [NFTInfo] = []
              for id in ids {
                let rarity = aiSportsMinter.getNFTRarity(id: id)
                let nftType = aiSportsMinter.getNFTType(id: id)
                let metadata = aiSportsMinter.getNFTMetadata(id: id)
                result.append(NFTInfo(id: id, rarity: rarity, nftType: nftType, metadata: metadata))
              }
              return result
            }
          `,
          [address]
        );

        if (!Array.isArray(response)) {
          return [];
        }

        return response.map((item) => {
          const record = item as Record<string, unknown>;
          const rarity = String(record.rarity ?? "Common") as AiSportsNftRarity;
          const inferredType =
            record.type ?? record["r#type"] ?? record.nftType ?? record.category ?? "Unknown";

          return {
            id: String(record.id ?? ""),
            rarity,
            type: String(inferredType),
            metadata: (record.metadata as Record<string, unknown>) ?? {},
          };
        });
      }
    );
  }

  async getTournamentStats(options?: { bypassCache?: boolean }): Promise<AiSportsTournamentStats> {
    if (!this.config.enabled) {
      return {
        totalParticipants: 0,
        currentPrizePool: 0,
        averageScore: 0,
        activeContests: 0,
        timestamp: new Date(),
      };
    }

    const now = Date.now();
    if (!options?.bypassCache && this.tournamentStatsCache && this.tournamentStatsCache.expiresAt > now) {
      return this.tournamentStatsCache.value;
    }

    const response = await this.executeQuery<Record<string, unknown>>(
      `
        import aiSportsEscrow from ${this.config.contracts.escrow}

        access(all) struct TournamentStats {
          access(all) let totalParticipants: UInt64
          access(all) let currentPrizePool: UFix64
          access(all) let averageScore: UFix64
          access(all) let activeContests: UInt64
        }

        access(all) fun main(): TournamentStats {
          return TournamentStats(
            totalParticipants: aiSportsEscrow.getTotalParticipants(),
            currentPrizePool: aiSportsEscrow.getCurrentPrizePool(),
            averageScore: aiSportsEscrow.getAverageScore(),
            activeContests: aiSportsEscrow.getActiveContestsCount()
          )
        }
      `,
      []
    );

    const stats: AiSportsTournamentStats = {
      totalParticipants: Number.parseInt(String(response.totalParticipants ?? 0), 10) || 0,
      currentPrizePool: Number.parseFloat(String(response.currentPrizePool ?? 0)) || 0,
      averageScore: Number.parseFloat(String(response.averageScore ?? 0)) || 0,
      activeContests: Number.parseInt(String(response.activeContests ?? 0), 10) || 0,
      timestamp: new Date(),
    };

    this.tournamentStatsCache = {
      value: stats,
      expiresAt: now + this.config.cache.tournamentStatsTtlMs,
    };

    return stats;
  }

  async getUserData(address: string): Promise<AiSportsUserData> {
    if (!this.config.enabled) {
      return {
        address,
        fantasyScore: 0,
        juiceBalance: 0,
        nfts: [],
        lastActivity: new Date(),
        accessLevel: "none",
      };
    }

    const [fantasyScore, juiceBalance, nfts] = await Promise.all([
      this.getUserFantasyScore(address),
      this.getJuiceBalance(address),
      this.getUserNfts(address),
    ]);

    return {
      address,
      fantasyScore,
      juiceBalance,
      nfts,
      lastActivity: new Date(),
      accessLevel: this.calculateAccessLevel(fantasyScore, juiceBalance, nfts),
    };
  }

  clearCaches(): void {
    this.fantasyScoreCache.clear();
    this.juiceBalanceCache.clear();
    this.nftCache.clear();
    this.tournamentStatsCache = null;
  }

  private calculateAccessLevel(
    fantasyScore: number,
    juiceBalance: number,
    nfts: AiSportsNft[]
  ): AiSportsAccessLevel {
    if (!Array.isArray(nfts)) {
      nfts = [];
    }
    const hasLegendary = nfts.some((nft) => nft.rarity === "Legendary");
    const hasEpic = nfts.some((nft) => nft.rarity === "Epic");

    if (hasLegendary || (fantasyScore > 70 && juiceBalance > 200)) {
      return "premium";
    }

    if (hasEpic || fantasyScore > 40 || juiceBalance > 100) {
      return "advanced";
    }

    if (fantasyScore > 10 || juiceBalance > 10 || nfts.length > 0) {
      return "basic";
    }

    return "none";
  }

  private async getOrLoad<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number,
    loader: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now) {
      return entry.value;
    }

    try {
      const value = await loader();
      cache.set(key, {
        value,
        expiresAt: now + ttlMs,
      });
      return value;
    } catch (error) {
      this.logger.warn(`aiSports query failed for ${key}: ${(error as Error).message}`);
      if (entry) {
        return entry.value;
      }
      // Return default failsafe value instead of throwing for testnet compatibility
      return DEFAULT_FAILSAFE_VALUE as T;
    }
  }

  private configureFcl(): void {
    if (this.fclConfigured) {
      return;
    }

    fcl
      .config()
      .put("accessNode.api", this.config.accessNode)
      .put("discovery.wallet", this.config.discoveryWallet)
      .put("fcl.limit", "9999");

    this.fclConfigured = true;
  }

  private async executeQuery<T>(cadence: string, args: string[]): Promise<T> {
    this.configureFcl();

    try {
      const result = await fcl.query({
        cadence,
        args: (arg, t) => args.map((value) => arg(value, t.Address)),
      });
      return result as T;
    } catch (error) {
      this.logger.error(`aiSports query failed`, error as Error);
      throw error;
    }
  }
}
