import { Injectable, Logger } from "@nestjs/common";

/**
 * NBA Top Shot GraphQL API Client
 * 
 * Official API: https://public-api.nbatopshot.com/graphql
 * Documentation: https://developers.nbatopshot.com/docs/GraphQL/
 * 
 * No API keys required, but User-Agent header is recommended for rate limiting visibility.
 */

export interface TopShotMoment {
  id: string;
  flowId: string;
  play: {
    id: string;
    stats: {
      playerName: string;
      playerId: string;
      primaryPosition?: string;
      jerseyNumber?: string;
      teamName?: string;
      teamId?: string;
    };
    flowRetired: boolean;
  };
  set: {
    id: string;
    flowName: string;
  };
  serialNumber: number;
  tier: string;
  price?: {
    value: string;
    currency: string;
  };
}

export interface SearchMintedMomentsInput {
  filters?: {
    byPlayers?: string[];
    byTeams?: string[];
    bySets?: string[];
    byPlays?: string[];
    bySerial?: {
      min?: number;
      max?: number;
    };
    byOwnerFlowAddress?: string[];
  };
  sortBy?: "CREATED_AT_ASC" | "CREATED_AT_DESC" | "SERIAL_NUMBER_ASC" | "SERIAL_NUMBER_DESC";
  pagination?: {
    cursor?: string;
    limit?: number;
  };
}

export interface SearchMintedMomentsResponse {
  data: {
    searchMintedMoments: {
      data: {
        mintedMoments: TopShotMoment[];
      };
      pagination: {
        cursor: string | null;
        hasNextPage: boolean;
      };
    };
  };
}

export interface GetUserMomentsResponse {
  data: {
    getUserMomentsByFlowAddress: {
      moments: TopShotMoment[];
      pagination: {
        cursor: string | null;
        hasNextPage: boolean;
      };
    };
  };
}

@Injectable()
export class TopShotGraphQLClient {
  private readonly logger = new Logger(TopShotGraphQLClient.name);
  private readonly endpoint = "https://public-api.nbatopshot.com/graphql";
  private readonly userAgent = "Werpool-PredictionMarkets/1.0 (https://werpool.mixas.pro)";

  /**
   * Search for minted moments with flexible filters
   */
  async searchMintedMoments(input: SearchMintedMomentsInput): Promise<TopShotMoment[]> {
    const query = `
      query SearchMintedMoments($input: SearchMintedMomentsInput!) {
        searchMintedMoments(input: $input) {
          data {
            mintedMoments {
              id
              flowId
              play {
                id
                stats {
                  playerName
                  playerId
                  primaryPosition
                  jerseyNumber
                  teamName
                  teamId
                }
                flowRetired
              }
              set {
                id
                flowName
              }
              serialNumber
              tier
              price {
                value
                currency
              }
            }
          }
          pagination {
            cursor
            hasNextPage
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<SearchMintedMomentsResponse>(query, { input });
      return response.data.searchMintedMoments.data.mintedMoments || [];
    } catch (error) {
      this.logger.error(`Failed to search minted moments: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get all moments owned by a specific Flow address
   */
  async getUserMomentsByFlowAddress(
    flowAddress: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ moments: TopShotMoment[]; hasMore: boolean; cursor: string | null }> {
    const query = `
      query GetUserMoments($input: GetUserMomentsInput!) {
        getUserMomentsByFlowAddress(input: $input) {
          moments {
            id
            flowId
            play {
              id
              stats {
                playerName
                playerId
                primaryPosition
                jerseyNumber
                teamName
                teamId
              }
              flowRetired
            }
            set {
              id
              flowName
            }
            serialNumber
            tier
            price {
              value
              currency
            }
          }
          pagination {
            cursor
            hasNextPage
          }
        }
      }
    `;

    const input = {
      flowAddress: this.normalizeFlowAddress(flowAddress),
      pagination: {
        limit: options?.limit ?? 100,
        cursor: options?.cursor,
      },
    };

    try {
      const response = await this.executeQuery<GetUserMomentsResponse>(query, { input });
      const result = response.data.getUserMomentsByFlowAddress;
      
      return {
        moments: result.moments || [],
        hasMore: result.pagination.hasNextPage,
        cursor: result.pagination.cursor,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get moments for ${flowAddress}: ${(error as Error).message}`
      );
      return { moments: [], hasMore: false, cursor: null };
    }
  }

  /**
   * Get moments for specific players owned by a user
   */
  async getUserMomentsByPlayer(
    flowAddress: string,
    playerIds: string[]
  ): Promise<TopShotMoment[]> {
    if (playerIds.length === 0) {
      return [];
    }

    const input: SearchMintedMomentsInput = {
      filters: {
        byOwnerFlowAddress: [this.normalizeFlowAddress(flowAddress)],
        byPlayers: playerIds,
      },
      pagination: {
        limit: 100,
      },
    };

    return this.searchMintedMoments(input);
  }

  /**
   * Get a single minted moment by its ID
   */
  async getMintedMoment(momentId: string): Promise<TopShotMoment | null> {
    const query = `
      query GetMintedMoment($momentId: ID!) {
        getMintedMoment(momentId: $momentId) {
          id
          flowId
          play {
            id
            stats {
              playerName
              playerId
              primaryPosition
              jerseyNumber
              teamName
              teamId
            }
            flowRetired
          }
          set {
            id
            flowName
          }
          serialNumber
          tier
          price {
            value
            currency
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<{
        data: { getMintedMoment: TopShotMoment | null };
      }>(query, { momentId });
      
      return response.data.getMintedMoment;
    } catch (error) {
      this.logger.error(`Failed to get moment ${momentId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Execute a GraphQL query against NBA Top Shot API
   */
  private async executeQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": this.userAgent,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as T & { errors?: Array<{ message: string }> };

    if ("errors" in json && json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`);
    }

    return json;
  }

  /**
   * Normalize Flow address to standard format (with 0x prefix)
   */
  private normalizeFlowAddress(address: string): string {
    const trimmed = address.trim();
    return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  }
}
