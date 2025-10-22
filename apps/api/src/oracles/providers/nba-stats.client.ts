import { Injectable, Logger } from "@nestjs/common";
import { BalldontlieAPI } from "@balldontlie/sdk";

/**
 * NBA Stats Client using BallDontLie API
 * 
 * Official API: https://balldontlie.io/
 * Documentation: https://github.com/balldontlie-api/typescript
 * 
 * Free tier: 25 requests/minute
 * Requires: NBA_BALL_API environment variable
 */

export interface NBAPlayerStats {
  playerId: number;
  playerName: string;
  teamName: string;
  teamAbbreviation: string;
  gameId: number;
  gameDate: string;
  minutes: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  plusMinus: number | null;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
}

export interface NBAGame {
  id: number;
  date: string;
  season: number;
  status: string;
  homeTeam: {
    id: number;
    name: string;
    abbreviation: string;
  };
  awayTeam: {
    id: number;
    name: string;
    abbreviation: string;
  };
  homeScore: number;
  awayScore: number;
}

export interface NBAPlayer {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  jerseyNumber: string | null;
  team: {
    id: number;
    name: string;
    abbreviation: string;
  };
}

@Injectable()
export class NBAStatsClient {
  private readonly logger = new Logger(NBAStatsClient.name);
  private readonly api: BalldontlieAPI;
  private readonly enabled: boolean;

  constructor() {
    const apiKey = process.env.NBA_BALL_API;
    
    if (!apiKey || apiKey === "your-api-key-here") {
      this.logger.warn("NBA_BALL_API not configured. NBA stats features will be disabled.");
      this.enabled = false;
      this.api = null as unknown as BalldontlieAPI;
    } else {
      this.api = new BalldontlieAPI({ apiKey });
      this.enabled = true;
      this.logger.log("NBA Stats Client initialized with BallDontLie API");
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Search for NBA players by name
   */
  async searchPlayers(name: string): Promise<NBAPlayer[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.api.nba.getPlayers({ search: name });
      
      return response.data.map((player) => ({
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        position: player.position || "Unknown",
        jerseyNumber: player.jersey_number || null,
        team: {
          id: player.team.id,
          name: player.team.full_name,
          abbreviation: player.team.abbreviation,
        },
      }));
    } catch (error) {
      this.logger.error(`Failed to search players for "${name}": ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get player by ID
   */
  async getPlayer(playerId: number): Promise<NBAPlayer | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.api.nba.getPlayers({ player_ids: [playerId] });
      
      if (response.data.length === 0) {
        return null;
      }

      const player = response.data[0];
      return {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        position: player.position || "Unknown",
        jerseyNumber: player.jersey_number || null,
        team: {
          id: player.team.id,
          name: player.team.full_name,
          abbreviation: player.team.abbreviation,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get player ${playerId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get games for a specific date
   */
  async getGamesByDate(date: string): Promise<NBAGame[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.api.nba.getGames({ dates: [date] });
      
      return response.data.map((game) => ({
        id: game.id,
        date: game.date,
        season: game.season,
        status: game.status,
        homeTeam: {
          id: game.home_team.id,
          name: game.home_team.full_name,
          abbreviation: game.home_team.abbreviation,
        },
        awayTeam: {
          id: game.visitor_team.id,
          name: game.visitor_team.full_name,
          abbreviation: game.visitor_team.abbreviation,
        },
        homeScore: game.home_team_score,
        awayScore: game.visitor_team_score,
      }));
    } catch (error) {
      this.logger.error(`Failed to get games for ${date}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get player stats for a specific game
   */
  async getPlayerStatsForGame(playerId: number, gameId: number): Promise<NBAPlayerStats | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.api.nba.getStats({
        player_ids: [playerId],
        game_ids: [gameId],
      });

      if (response.data.length === 0) {
        return null;
      }

      const stat = response.data[0];
      return this.mapPlayerStats(stat);
    } catch (error) {
      this.logger.error(
        `Failed to get stats for player ${playerId} in game ${gameId}: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Get all player stats for a specific date range
   */
  async getPlayerStatsByDateRange(
    playerId: number,
    startDate: string,
    endDate: string
  ): Promise<NBAPlayerStats[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.api.nba.getStats({
        player_ids: [playerId],
        start_date: startDate,
        end_date: endDate,
      });

      return response.data.map((stat) => this.mapPlayerStats(stat));
    } catch (error) {
      this.logger.error(
        `Failed to get stats for player ${playerId} from ${startDate} to ${endDate}: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Get stats for all players in a specific game
   */
  async getGameStats(gameId: number): Promise<NBAPlayerStats[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.api.nba.getStats({ game_ids: [gameId] });
      
      return response.data.map((stat) => this.mapPlayerStats(stat));
    } catch (error) {
      this.logger.error(`Failed to get stats for game ${gameId}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get stats for specific date (all games on that day)
   */
  async getStatsByDate(date: string): Promise<NBAPlayerStats[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.api.nba.getStats({ dates: [date] });
      
      return response.data.map((stat) => this.mapPlayerStats(stat));
    } catch (error) {
      this.logger.error(`Failed to get stats for date ${date}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Map BallDontLie API response to our NBAPlayerStats interface
   */
  private mapPlayerStats(stat: unknown): NBAPlayerStats {
    const s = stat as Record<string, unknown>;
    const player = s.player as Record<string, unknown>;
    const team = s.team as Record<string, unknown>;
    const game = s.game as Record<string, unknown>;
    
    return {
      playerId: Number(player.id),
      playerName: `${player.first_name} ${player.last_name}`,
      teamName: String(team.full_name),
      teamAbbreviation: String(team.abbreviation),
      gameId: Number(game.id),
      gameDate: String(game.date),
      minutes: s.min ? String(s.min) : null,
      points: Number(s.pts) || 0,
      rebounds: (Number(s.reb) || 0) + (Number(s.oreb) || 0) + (Number(s.dreb) || 0),
      assists: Number(s.ast) || 0,
      steals: Number(s.stl) || 0,
      blocks: Number(s.blk) || 0,
      turnovers: Number(s.turnover) || 0,
      plusMinus: s.plus_minus !== null && s.plus_minus !== undefined ? Number(s.plus_minus) : null,
      fieldGoalsMade: Number(s.fgm) || 0,
      fieldGoalsAttempted: Number(s.fga) || 0,
      threePointsMade: Number(s.fg3m) || 0,
      threePointsAttempted: Number(s.fg3a) || 0,
      freeThrowsMade: Number(s.ftm) || 0,
      freeThrowsAttempted: Number(s.fta) || 0,
    };
  }

  /**
   * Calculate performance score for reward system
   * Formula: (PTS × 1.0) + (REB × 0.7) + (AST × 0.7) + (STL × 1.2) + (BLK × 1.2) + (+/- × 0.2)
   */
  calculatePerformanceScore(stats: NBAPlayerStats): number {
    const score =
      stats.points * 1.0 +
      stats.rebounds * 0.7 +
      stats.assists * 0.7 +
      stats.steals * 1.2 +
      stats.blocks * 1.2 +
      (stats.plusMinus || 0) * 0.2;

    return Math.max(0, score);
  }
}
