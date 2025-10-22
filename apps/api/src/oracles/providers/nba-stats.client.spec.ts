import { NBAStatsClient } from "./nba-stats.client";

describe("NBAStatsClient", () => {
  let client: NBAStatsClient;
  const originalEnv = process.env.NBA_BALL_API;

  beforeEach(() => {
    process.env.NBA_BALL_API = "test-api-key";
    client = new NBAStatsClient();
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.NBA_BALL_API = originalEnv;
    } else {
      delete process.env.NBA_BALL_API;
    }
  });

  describe("isEnabled", () => {
    it("should return true when API key is configured", () => {
      expect(client.isEnabled()).toBe(true);
    });

    it("should return false when API key is not configured", () => {
      delete process.env.NBA_BALL_API;
      const disabledClient = new NBAStatsClient();
      expect(disabledClient.isEnabled()).toBe(false);
    });

    it("should return false when API key is placeholder", () => {
      process.env.NBA_BALL_API = "your-api-key-here";
      const placeholderClient = new NBAStatsClient();
      expect(placeholderClient.isEnabled()).toBe(false);
    });
  });

  describe("calculatePerformanceScore", () => {
    it("should calculate performance score correctly", () => {
      const stats = {
        playerId: 2544,
        playerName: "LeBron James",
        teamName: "Los Angeles Lakers",
        teamAbbreviation: "LAL",
        gameId: 12345,
        gameDate: "2024-11-13",
        minutes: "35:30",
        points: 30,
        rebounds: 10,
        assists: 8,
        steals: 2,
        blocks: 1,
        turnovers: 3,
        plusMinus: 12,
        fieldGoalsMade: 12,
        fieldGoalsAttempted: 22,
        threePointsMade: 3,
        threePointsAttempted: 8,
        freeThrowsMade: 3,
        freeThrowsAttempted: 4,
      };

      const score = client.calculatePerformanceScore(stats);
      
      // Score formula: (PTS × 1.0) + (REB × 0.7) + (AST × 0.7) + (STL × 1.2) + (BLK × 1.2) + (+/- × 0.2)
      // Expected: 30 + 7 + 5.6 + 2.4 + 1.2 + 2.4 = 48.6
      expect(score).toBeCloseTo(48.6, 1);
    });

    it("should handle zero stats", () => {
      const stats = {
        playerId: 123,
        playerName: "Test Player",
        teamName: "Test Team",
        teamAbbreviation: "TST",
        gameId: 1,
        gameDate: "2024-11-13",
        minutes: "10:00",
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        plusMinus: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        threePointsMade: 0,
        threePointsAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
      };

      const score = client.calculatePerformanceScore(stats);
      expect(score).toBe(0);
    });

    it("should handle negative plus/minus", () => {
      const stats = {
        playerId: 123,
        playerName: "Test Player",
        teamName: "Test Team",
        teamAbbreviation: "TST",
        gameId: 1,
        gameDate: "2024-11-13",
        minutes: "25:00",
        points: 15,
        rebounds: 5,
        assists: 3,
        steals: 1,
        blocks: 0,
        turnovers: 2,
        plusMinus: -10,
        fieldGoalsMade: 6,
        fieldGoalsAttempted: 14,
        threePointsMade: 1,
        threePointsAttempted: 5,
        freeThrowsMade: 2,
        freeThrowsAttempted: 2,
      };

      const score = client.calculatePerformanceScore(stats);
      
      // Score formula: (PTS × 1.0) + (REB × 0.7) + (AST × 0.7) + (STL × 1.2) + (BLK × 1.2) + (+/- × 0.2)
      // Expected: 15 + 3.5 + 2.1 + 1.2 + 0 + (-2) = 19.8
      expect(score).toBeCloseTo(19.8, 1);
    });

    it("should not return negative scores", () => {
      const stats = {
        playerId: 123,
        playerName: "Test Player",
        teamName: "Test Team",
        teamAbbreviation: "TST",
        gameId: 1,
        gameDate: "2024-11-13",
        minutes: "5:00",
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 5,
        plusMinus: -30,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 5,
        threePointsMade: 0,
        threePointsAttempted: 3,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
      };

      const score = client.calculatePerformanceScore(stats);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBe(0);
    });
  });

  describe("disabled client", () => {
    beforeEach(() => {
      delete process.env.NBA_BALL_API;
      client = new NBAStatsClient();
    });

    it("should return empty array for searchPlayers when disabled", async () => {
      const result = await client.searchPlayers("LeBron");
      expect(result).toEqual([]);
    });

    it("should return null for getPlayer when disabled", async () => {
      const result = await client.getPlayer(2544);
      expect(result).toBeNull();
    });

    it("should return empty array for getGamesByDate when disabled", async () => {
      const result = await client.getGamesByDate("2024-11-13");
      expect(result).toEqual([]);
    });

    it("should return null for getPlayerStatsForGame when disabled", async () => {
      const result = await client.getPlayerStatsForGame(2544, 12345);
      expect(result).toBeNull();
    });

    it("should return empty array for getStatsByDate when disabled", async () => {
      const result = await client.getStatsByDate("2024-11-13");
      expect(result).toEqual([]);
    });
  });
});
