import { Injectable, Logger } from "@nestjs/common";

import { AiSportsFlowService } from "../../flow/aisports-flow.service";
import { AiSportsNft, MetaPredictionMarket } from "../../types/aisports.types";

interface LeaderboardEntry {
  address: string;
  score: number;
  rank: number;
}

@Injectable()
export class AiSportsOracleService {
  private readonly logger = new Logger(AiSportsOracleService.name);

  constructor(private readonly flowService: AiSportsFlowService) {}

  async resolve(markets: MetaPredictionMarket[]): Promise<MetaPredictionMarket[]> {
    if (!this.flowService.isEnabled()) {
      return [];
    }

    const leaderboard = await this.loadLeaderboard();
    const results: MetaPredictionMarket[] = [];

    for (const market of markets) {
      if (!this.shouldResolve(market)) {
        continue;
      }

      try {
        const outcome = await this.resolveMarket(market, leaderboard);
        const next: MetaPredictionMarket = {
          ...market,
          isResolved: true,
          outcome,
          currentData: {
            ...market.currentData,
            lastUpdate: new Date(),
          },
        };

        results.push(next);
      } catch (error) {
        this.logger.warn(`Failed to resolve ${market.id}: ${(error as Error).message}`);
      }
    }

    return results;
  }

  private shouldResolve(market: MetaPredictionMarket): boolean {
    if (!market.isActive || market.isResolved) {
      return false;
    }
    return Date.now() >= market.resolutionTime.getTime();
  }

  private async resolveMarket(
    market: MetaPredictionMarket,
    leaderboard: LeaderboardEntry[]
  ): Promise<string | number> {
    switch (market.oracleConfig.resolutionFunction) {
      case "resolveAverageScoreMarket":
        return this.resolveAverageScoreMarket(market);
      case "resolveUserPerformanceMarket":
        return this.resolveUserPerformanceMarket(market, leaderboard);
      case "resolveNftPerformanceMarket":
        return this.resolveNftPerformanceMarket(leaderboard);
      case "resolveCommunityMarket":
        return this.resolveCommunityMarket(market);
      default:
        throw new Error(`unknown resolution function ${market.oracleConfig.resolutionFunction}`);
    }
  }

  private async resolveAverageScoreMarket(market: MetaPredictionMarket): Promise<string> {
    const stats = await this.flowService.getTournamentStats({ bypassCache: true });
    const threshold = market.oracleConfig.targetValue ?? 0;
    return stats.averageScore > threshold ? "YES" : "NO";
  }

  private async resolveUserPerformanceMarket(
    market: MetaPredictionMarket,
    leaderboard: LeaderboardEntry[]
  ): Promise<string> {
    const percent = market.oracleConfig.targetValue ?? 10;
    const topCount = Math.max(1, Math.floor((leaderboard.length * percent) / 100));
    const targetAddress = this.extractAddressFromMarket(market);

    if (!targetAddress) {
      return "NO";
    }

    const inTop = leaderboard
      .slice(0, topCount)
      .some((entry) => entry.address.toLowerCase() === targetAddress.toLowerCase());

    return inTop ? "YES" : "NO";
  }

  private async resolveNftPerformanceMarket(leaderboard: LeaderboardEntry[]): Promise<string> {
    const outcomes = await Promise.all(
      leaderboard.map(async (entry) => ({
        entry,
        data: await this.flowService.getUserData(entry.address),
      }))
    );

    const grouped = outcomes.reduce(
      (acc, item) => {
        const hasRare = this.hasRareNft(item.data.nfts);
        const bucket = hasRare ? acc.rare : acc.common;
        bucket.total += item.entry.score;
        bucket.count += 1;
        return acc;
      },
      {
        rare: { total: 0, count: 0 },
        common: { total: 0, count: 0 },
      }
    );

    const rareAverage = grouped.rare.count > 0 ? grouped.rare.total / grouped.rare.count : 0;
    const commonAverage = grouped.common.count > 0 ? grouped.common.total / grouped.common.count : 0;

    return rareAverage > commonAverage ? "YES" : "NO";
  }

  private async resolveCommunityMarket(market: MetaPredictionMarket): Promise<string> {
    const stats = await this.flowService.getTournamentStats({ bypassCache: true });
    const threshold = market.oracleConfig.targetValue ?? 0;
    const source = market.oracleConfig.dataSource ?? "";

    const value = source.includes("participants")
      ? stats.totalParticipants
      : source.includes("prize")
      ? stats.currentPrizePool
      : stats.averageScore;

    return value > threshold ? "YES" : "NO";
  }

  private hasRareNft(nfts: readonly AiSportsNft[]): boolean {
    return nfts.some((nft) => nft.rarity === "Epic" || nft.rarity === "Legendary");
  }

  private extractAddressFromMarket(market: MetaPredictionMarket): string | null {
    const match = market.description.match(/0x[0-9a-fA-F]{8,16}/);
    if (match) {
      return match[0];
    }
    return null;
  }

  private async loadLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      // Placeholder: until native leaderboard endpoint is wired we derive from tournament stats
      const stats = await this.flowService.getTournamentStats();
      if (stats.totalParticipants === 0) {
        return [];
      }

      const synthetic: LeaderboardEntry[] = [];
      const sampleSize = Math.min(100, stats.totalParticipants);
      for (let index = 0; index < sampleSize; index += 1) {
        synthetic.push({
          address: `0xsynthetic${index.toString().padStart(2, "0")}`,
          score: stats.averageScore + Math.random() * 10,
          rank: index + 1,
        });
      }
      return synthetic;
    } catch (error) {
      this.logger.warn(`Failed to load leaderboard: ${(error as Error).message}`);
      return [];
    }
  }
}
