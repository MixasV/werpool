import { Injectable, Logger } from '@nestjs/common';

/**
 * FastBreak GraphQL Client - Official NBA TopShot API Integration
 * 
 * HONEST LIMITATIONS:
 * - API only returns TOP LEADER of each FastBreak group (5 players per group)
 * - NO endpoint for full leaderboard with all participants
 * - We can only track leaders automatically, not all players
 * 
 * SOLUTION:
 * - Track top leaders from all groups automatically (hourly sync)
 * - Real-time verification when user creates challenge
 * - For non-leaders: require manual verification or use approximate ranking
 */
@Injectable()
export class FastBreakGraphQLClient {
  private readonly logger = new Logger(FastBreakGraphQLClient.name);
  private readonly apiUrl = 'https://public-api.nbatopshot.com/graphql';

  constructor() {}

  /**
   * Search active FastBreak runs
   * Returns runs with status FAST_BREAK_RUN_RUNNING
   */
  async searchActiveFastBreakRuns() {
    const query = `
      query SearchActiveFastBreakRuns {
        searchFastBreakRuns(input: { 
          filters: { 
            byStatus: [FAST_BREAK_RUN_RUNNING] 
          } 
        }) {
          fastBreakRuns {
            id
            runName
            status
            runStartDate
            runEndDate
            fastBreaks {
              id
              numPlayers
              status
              gameDate
              submissionDeadline
              leader {
                rank
                points
                dapperId
                submissionId
                user {
                  username
                  flowAddress
                  dapperID
                }
                winStatus
              }
            }
          }
        }
      }
    `;

    return this.executeQuery<SearchFastBreakRunsResponse>(query);
  }

  /**
   * Search all FastBreak runs (including finished)
   * Useful for historical data
   */
  async searchAllFastBreakRuns() {
    const query = `
      query SearchAllFastBreakRuns {
        searchFastBreakRuns(input: { 
          filters: { 
            byStatus: [
              FAST_BREAK_RUN_RUNNING,
              FAST_BREAK_RUN_FINISHED,
              FAST_BREAK_RUN_PROCESSED
            ] 
          } 
        }) {
          fastBreakRuns {
            id
            runName
            status
            runStartDate
            runEndDate
            fastBreaks {
              id
              numPlayers
              status
              gameDate
              leader {
                rank
                points
                user {
                  username
                  flowAddress
                  dapperID
                }
              }
            }
          }
        }
      }
    `;

    return this.executeQuery<SearchFastBreakRunsResponse>(query);
  }

  /**
   * Get specific FastBreak by ID
   */
  async getFastBreakById(id: string) {
    const query = `
      query GetFastBreakById($id: String!) {
        getFastBreakById(input: { id: $id }) {
          data {
            id
            runId
            numPlayers
            status
            gameDate
            submissionDeadline
            gamesStartAt
            leader {
              rank
              points
              user {
                username
                flowAddress
                dapperID
              }
            }
          }
        }
      }
    `;

    return this.executeQuery<GetFastBreakByIdResponse>(query, { id });
  }

  /**
   * Find user's FastBreak group by Flow address
   * 
   * LIMITATION: Only finds if user is TOP LEADER of their group
   * Returns null if user is not #1 in their group
   */
  async findUserFastBreakGroup(flowAddress: string) {
    const runs = await this.searchActiveFastBreakRuns();
    
    for (const run of runs.data.searchFastBreakRuns.fastBreakRuns) {
      for (const fastBreak of run.fastBreaks) {
        if (fastBreak.leader?.user?.flowAddress === flowAddress) {
          return {
            runId: run.id,
            runName: run.runName,
            fastBreakId: fastBreak.id,
            rank: fastBreak.leader.rank,
            points: fastBreak.leader.points,
            status: fastBreak.status,
            gameDate: fastBreak.gameDate,
          };
        }
      }
    }

    return null;
  }

  /**
   * Execute GraphQL query
   */
  private async executeQuery<T>(query: string, variables?: Record<string, any>): Promise<T> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Werpool/1.0',
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.errors) {
        this.logger.error('GraphQL errors:', result.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result as T;
    } catch (error) {
      this.logger.error('Failed to execute GraphQL query', error);
      throw error;
    }
  }
}

// Types based on TopShot GraphQL schema

interface SearchFastBreakRunsResponse {
  data: {
    searchFastBreakRuns: {
      fastBreakRuns: FastBreakRun[];
    };
  };
}

interface GetFastBreakByIdResponse {
  data: {
    getFastBreakById: {
      data: FastBreak;
    };
  };
}

interface FastBreakRun {
  id: string;
  runName: string;
  status: FastBreakRunStatus;
  runStartDate: string;
  runEndDate: string;
  fastBreaks: FastBreak[];
}

interface FastBreak {
  id: string;
  numPlayers: number;
  status: FastBreakStatus;
  gameDate: string;
  submissionDeadline?: string;
  gamesStartAt?: string;
  leader: FastBreakLeader | null;
}

interface FastBreakLeader {
  rank: number;
  points: number;
  dapperId?: string;
  submissionId?: string;
  user: {
    username: string;
    flowAddress: string;
    dapperID: string;
  };
  winStatus?: FastBreakWinStatus;
}

enum FastBreakRunStatus {
  FAST_BREAK_RUN_NOT_STARTED = 'FAST_BREAK_RUN_NOT_STARTED',
  FAST_BREAK_RUN_RUNNING = 'FAST_BREAK_RUN_RUNNING',
  FAST_BREAK_RUN_FINISHED = 'FAST_BREAK_RUN_FINISHED',
  FAST_BREAK_RUN_PROCESSED = 'FAST_BREAK_RUN_PROCESSED',
}

enum FastBreakStatus {
  FAST_BREAK_OPEN = 'FAST_BREAK_OPEN',
  FAST_BREAK_CLOSED = 'FAST_BREAK_CLOSED',
  FAST_BREAK_SCORED = 'FAST_BREAK_SCORED',
  FAST_BREAK_SETTLED = 'FAST_BREAK_SETTLED',
}

enum FastBreakWinStatus {
  WIN = 'WIN',
  LOSS = 'LOSS',
  TIE = 'TIE',
}

export {
  FastBreakRun,
  FastBreak,
  FastBreakLeader,
  FastBreakRunStatus,
  FastBreakStatus,
  FastBreakWinStatus,
};
