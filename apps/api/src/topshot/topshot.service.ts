import { Injectable, Logger } from "@nestjs/common";
import * as fcl from "@onflow/fcl";

import {
  TopShotIntegrationConfig,
  resolveTopShotIntegrationConfig,
} from "../common/topshot.config";
import { TopShotMomentDetail, TopShotMomentTier } from "./topshot.types";
import { TopShotGraphQLClient } from "./topshot-graphql.client";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

@Injectable()
export class TopShotService {
  private readonly logger = new Logger(TopShotService.name);
  private readonly config: TopShotIntegrationConfig;
  private fclConfigured = false;

  private readonly ownerMomentsCache = new Map<string, CacheEntry<TopShotMomentDetail[]>>();

  constructor(private readonly graphqlClient: TopShotGraphQLClient) {
    this.config = resolveTopShotIntegrationConfig();
    if (this.config.enabled) {
      this.configureFcl();
    } else {
      this.logger.warn("Top Shot integration disabled via configuration");
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async getOwnerMoments(address: string, options?: { limit?: number; bypassCache?: boolean; useGraphQL?: boolean }): Promise<TopShotMomentDetail[]> {
    if (!this.config.enabled) {
      return [];
    }

    const normalized = address.toLowerCase();
    const limit = options?.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;

    if (!options?.bypassCache) {
      const cached = this.ownerMomentsCache.get(normalized);
      if (cached && cached.expiresAt > Date.now()) {
        return limit ? cached.value.slice(0, limit) : cached.value;
      }
    }

    try {
      let moments: TopShotMomentDetail[];

      if (options?.useGraphQL) {
        moments = await this.getOwnerMomentsViaGraphQL(normalized, limit);
      } else {
        moments = await this.getOwnerMomentsViaCadence(normalized, limit);
      }

      this.ownerMomentsCache.set(normalized, {
        value: moments,
        expiresAt: Date.now() + this.config.cache.ownerMomentsTtlMs,
      });

      return moments;
    } catch (error) {
      this.logger.error(`Failed to fetch Top Shot moments for ${normalized}`, error as Error);
      
      if (options?.useGraphQL) {
        this.logger.log("Falling back to Cadence query...");
        return this.getOwnerMomentsViaCadence(normalized, limit);
      }
      
      throw error;
    }
  }

  private async getOwnerMomentsViaGraphQL(address: string, limit?: number): Promise<TopShotMomentDetail[]> {
    const result = await this.graphqlClient.getUserMomentsByFlowAddress(address, { limit });
    
    return result.moments.map((gqlMoment) => ({
      id: gqlMoment.flowId,
      playId: gqlMoment.play.id,
      setId: gqlMoment.set.id,
      serialNumber: gqlMoment.serialNumber,
      playerId: gqlMoment.play.stats.playerId,
      fullName: gqlMoment.play.stats.playerName,
      teamName: gqlMoment.play.stats.teamName,
      teamId: gqlMoment.play.stats.teamId,
      primaryPosition: gqlMoment.play.stats.primaryPosition,
      jerseyNumber: gqlMoment.play.stats.jerseyNumber,
      tier: this.normalizeTier(gqlMoment.tier),
    }));
  }

  private async getOwnerMomentsViaCadence(address: string, limit?: number): Promise<TopShotMomentDetail[]> {
    const script = this.buildMomentDetailsScript();
    const requestedLimit = limit ?? -1;
    
    const response = await this.executeQuery<Array<Record<string, unknown>>>(script, (arg, t) => [
      arg(address, t.Address),
      arg(requestedLimit, t.Int),
    ]);

    return Array.isArray(response)
      ? response.map((entry) => this.mapMomentDetail(entry)).filter((item): item is TopShotMomentDetail => Boolean(item))
      : [];
  }

  async getMomentDetail(address: string, momentId: string): Promise<TopShotMomentDetail | null> {
    const moments = await this.getOwnerMoments(address, { bypassCache: true });
    return moments.find((moment) => moment.id === momentId) ?? null;
  }

  clearCache(): void {
    this.ownerMomentsCache.clear();
  }

  private configureFcl(): void {
    if (this.fclConfigured) {
      return;
    }

    fcl
      .config()
      .put("accessNode.api", this.config.accessNode)
      .put("discovery.wallet", this.config.discoveryWallet)
      .put("flow.network", this.config.network)
      .put("app.detail.title", "Forte Prediction Markets")
      .put("fcl.limit", "9999");

    this.fclConfigured = true;
  }

  private async executeQuery<T>(
    cadence: string,
    argsBuilder: Parameters<typeof fcl.query>[0]["args"]
  ): Promise<T> {
    if (!this.config.enabled) {
      throw new Error("Top Shot integration is disabled");
    }

    this.configureFcl();

    try {
      const result = await fcl.query({
        cadence,
        args: argsBuilder,
      });
      return result as T;
    } catch (error) {
      this.logger.error("Top Shot cadence query failed", error as Error);
      throw error;
    }
  }

  private buildMomentDetailsScript(): string {
    return `
      import TopShot from ${this.config.contracts.topShot}

      pub struct MomentDetail {
          pub let id: UInt64
          pub let playId: UInt32
          pub let setId: UInt32
          pub let serialNumber: UInt32
          pub let playerId: String?
          pub let fullName: String?
          pub let teamName: String?
          pub let teamId: String?
          pub let primaryPosition: String?
          pub let jerseyNumber: String?
          pub let tier: String?

          init(
              id: UInt64,
              playId: UInt32,
              setId: UInt32,
              serialNumber: UInt32,
              playerId: String?,
              fullName: String?,
              teamName: String?,
              teamId: String?,
              primaryPosition: String?,
              jerseyNumber: String?,
              tier: String?
          ) {
              self.id = id
              self.playId = playId
              self.setId = setId
              self.serialNumber = serialNumber
              self.playerId = playerId
              self.fullName = fullName
              self.teamName = teamName
              self.teamId = teamId
              self.primaryPosition = primaryPosition
              self.jerseyNumber = jerseyNumber
              self.tier = tier
          }
      }

      pub fun main(account: Address, limit: Int): [MomentDetail] {
          let target = getAccount(account)
          let capability = target.getCapability<&TopShot.Collection{TopShot.MomentCollectionPublic}>(/public/MomentCollection)
          let collection = capability.borrow()
          if collection == nil {
              return []
          }

          let ids = collection!.getIDs()
          var result: [MomentDetail] = []

          var count = 0
          let sanitizedLimit = limit < 0 ? ids.length : limit

          for id in ids {
              if sanitizedLimit > 0 && count >= sanitizedLimit {
                  break
              }

              if let moment = collection!.borrowMoment(id: id) {
                  let data = moment.data
                  let metadata = TopShot.getPlayMetaData(playID: data.playID) ?? {}

                  let detail = MomentDetail(
                      id: id,
                      playId: data.playID,
                      setId: data.setID,
                      serialNumber: data.serialNumber,
                      playerId: metadata["PlayerID"],
                      fullName: metadata["FullName"],
                      teamName: metadata["TeamAtMoment"],
                      teamId: metadata["TeamAtMomentNBAID"],
                      primaryPosition: metadata["PrimaryPosition"],
                      jerseyNumber: metadata["JerseyNumber"],
                      tier: metadata["Tier"]
                  )

                  result.append(detail)
                  count = count + 1
              }
          }

          return result
      }
    `;
  }

  private mapMomentDetail(entry: Record<string, unknown>): TopShotMomentDetail | null {
    const id = this.ensureString(entry.id);
    if (!id) {
      return null;
    }

    const tierRaw = this.ensureString(entry.tier) ?? "Unknown";
    const tier = this.normalizeTier(tierRaw);

    return {
      id,
      playId: this.ensureString(entry.playId) ?? "0",
      setId: this.ensureString(entry.setId) ?? "0",
      serialNumber: this.ensureNumber(entry.serialNumber) ?? 0,
      playerId: this.ensureString(entry.playerId),
      fullName: this.ensureString(entry.fullName),
      teamName: this.ensureString(entry.teamName),
      teamId: this.ensureString(entry.teamId),
      primaryPosition: this.ensureString(entry.primaryPosition),
      jerseyNumber: this.ensureString(entry.jerseyNumber),
      tier,
    } satisfies TopShotMomentDetail;
  }

  private ensureString(value: unknown): string | undefined {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private ensureNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private normalizeTier(value: string): TopShotMomentTier {
    const normalized = value.trim();
    switch (normalized.toLowerCase()) {
      case "common":
        return "Common";
      case "rare":
        return "Rare";
      case "legendary":
        return "Legendary";
      case "ultimate":
        return "Ultimate";
      case "fandom":
        return "Fandom";
      case "parallel":
        return "Parallel";
      default:
        return "Unknown";
    }
  }
}
