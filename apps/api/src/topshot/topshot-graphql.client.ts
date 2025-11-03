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
    id?: string;
    stats: {
      playerName: string;
      playerID: string; // Note: API uses playerID (uppercase D)
      primaryPosition?: string;
      jerseyNumber?: string;
      homeTeamName?: string;
      awayTeamName?: string;
      homeTeamID?: string;
      awayTeamID?: string;
    };
    flowRetired?: boolean;
  };
  set: {
    id?: string;
    flowName: string;
  };
  flowSerialNumber: string; // Note: API uses flowSerialNumber
  tier: string;
  price?: {
    value: string;
    currency: string;
  };
}

export interface UserPublicInfo {
  username: string;
  dapperID: string;
  flowAddress: string;
}

export interface UserProfile {
  publicInfo: UserPublicInfo;
  momentCount: number;
}



@Injectable()
export class TopShotGraphQLClient {
  private readonly logger = new Logger(TopShotGraphQLClient.name);
  private readonly endpoint = "https://public-api.nbatopshot.com/graphql";
  private readonly userAgent = "Werpool-PredictionMarkets/1.0 (https://werpool.mixas.pro)";

  /**
   * Get moments by Flow address directly (simplest method)
   * @param flowAddress - Flow address with or without 0x prefix
   * @param options - Pagination and limit options
   * @returns Array of moments owned by the address
   */
  async getUserMomentsByFlowAddress(
    flowAddress: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ moments: TopShotMoment[]; hasMore: boolean; cursor: string | null }> {
    // Remove 0x prefix if present (API requires address without 0x)
    const cleanAddress = flowAddress.toLowerCase().replace(/^0x/, '');
    
    const query = `
      query SearchUserMoments($input: SearchMintedMomentsInput!) {
        searchMintedMoments(input: $input) {
          data {
            searchSummary {
              count {
                count
              }
              pagination {
                leftCursor
                rightCursor
              }
              data {
                size
                data {
                  ... on MintedMoment {
                    id
                    flowId
                    play {
                      stats {
                        playerName
                        playerID
                      }
                    }
                    set {
                      flowName
                    }
                    flowSerialNumber
                    tier
                  }
                }
              }
            }
          }
        }
      }
    `;

    const input = {
      filters: {
        byOwnerFlowAddress: [cleanAddress],
      },
      searchInput: {
        pagination: {
          cursor: options?.cursor ?? "",
          direction: "RIGHT",
          limit: options?.limit ?? 100,
        },
      },
    };

    try {
      const response = await this.executeQuery<{
        data: {
          searchMintedMoments: {
            data: {
              searchSummary: {
                count: { count: number };
                pagination: { leftCursor?: string; rightCursor?: string };
                data: {
                  size: number;
                  data: TopShotMoment[];
                };
              };
            };
          };
        };
      }>(query, { input });

      const summary = response.data.searchMintedMoments.data.searchSummary;
      const moments = summary.data.data || [];
      const hasMore = moments.length >= (options?.limit ?? 100);
      const cursor = summary.pagination.rightCursor || null;

      return { moments, hasMore, cursor };
    } catch (error) {
      this.logger.error(
        `Failed to search moments for flow address ${cleanAddress}: ${(error as Error).message}`
      );
      return { moments: [], hasMore: false, cursor: null };
    }
  }

  /**
   * Get user profile by username (returns dapperID and momentCount)
   * @param username - TopShot username (e.g., "RemixED" or "0x73d7e1f432f530fd")
   * @returns User profile with dapperID or null if user not found
   */
  async getUserProfileByUsername(username: string): Promise<UserProfile | null> {
    const query = `
      query GetUserProfile($input: getUserProfileByUsernameInput!) {
        getUserProfileByUsername(input: $input) {
          publicInfo {
            username
            dapperID
            flowAddress
          }
          momentCount
        }
      }
    `;

    try {
      const response = await this.executeQuery<{
        data: { getUserProfileByUsername: UserProfile };
      }>(query, { input: { username } });
      
      return response.data.getUserProfileByUsername;
    } catch (error) {
      this.logger.error(`Failed to get profile for @${username}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Search moments by owner's Dapper ID
   * @param dapperID - Dapper user ID (e.g., "google-oauth2|118377731158804273783")
   * @param options - Pagination and limit options
   * @returns Array of moments owned by the user
   */
  async searchMomentsByDapperID(
    dapperID: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ moments: TopShotMoment[]; hasMore: boolean; cursor: string | null }> {
    const query = `
      query SearchUserMoments($input: SearchMintedMomentsInput!) {
        searchMintedMoments(input: $input) {
          data {
            searchSummary {
              count {
                count
              }
              pagination {
                leftCursor
                rightCursor
              }
              data {
                size
                data {
                  id
                  flowId
                  play {
                    stats {
                      playerName
                      playerID
                    }
                  }
                  set {
                    flowName
                  }
                  flowSerialNumber
                  tier
                }
              }
            }
          }
        }
      }
    `;

    const input = {
      filters: {
        byOwnerDapperID: [dapperID],
      },
      searchInput: {
        pagination: {
          cursor: options?.cursor ?? "",
          direction: "RIGHT",
          limit: options?.limit ?? 100,
        },
      },
    };

    try {
      const response = await this.executeQuery<{
        data: {
          searchMintedMoments: {
            data: {
              searchSummary: {
                count: { count: number };
                pagination: { leftCursor?: string; rightCursor?: string };
                data: {
                  size: number;
                  data: TopShotMoment[];
                };
              };
            };
          };
        };
      }>(query, { input });

      const summary = response.data.searchMintedMoments.data.searchSummary;
      const moments = summary.data.data || [];
      const hasMore = moments.length >= (options?.limit ?? 100);
      const cursor = summary.pagination.rightCursor || null;

      return { moments, hasMore, cursor };
    } catch (error) {
      this.logger.error(
        `Failed to search moments for dapperID ${dapperID}: ${(error as Error).message}`
      );
      return { moments: [], hasMore: false, cursor: null };
    }
  }

  /**
   * Get all moments owned by a user via their username
   * This combines getUserProfileByUsername + searchMomentsByDapperID
   * @param username - TopShot username
   * @param options - Pagination and limit options
   * @returns Array of moments with metadata
   */
  async getUserMomentsByUsername(
    username: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{
    moments: TopShotMoment[];
    profile: UserProfile | null;
    hasMore: boolean;
    cursor: string | null;
  }> {
    // Step 1: Get user profile (username → dapperID)
    const profile = await this.getUserProfileByUsername(username);
    
    if (!profile) {
      this.logger.warn(`User @${username} not found`);
      return { moments: [], profile: null, hasMore: false, cursor: null };
    }

    // Step 2: Search moments by dapperID
    const { moments, hasMore, cursor } = await this.searchMomentsByDapperID(
      profile.publicInfo.dapperID,
      options
    );

    return { moments, profile, hasMore, cursor };
  }



  /**
   * Get a single minted moment by its ID
   * @param momentId - The ID of the moment to retrieve
   * @returns Moment data or null if not found
   */
  async getMintedMoment(momentId: string): Promise<TopShotMoment | null> {
    const query = `
      query GetMintedMoment($momentId: ID!) {
        getMintedMoment(momentId: $momentId) {
          id
          flowId
          play {
            stats {
              playerName
              playerID
            }
          }
          set {
            flowName
          }
          flowSerialNumber
          tier
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


}
