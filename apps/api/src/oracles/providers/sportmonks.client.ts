import { Logger } from "@nestjs/common";

import { SportsDataConfig } from "../../common/sports-data.config";
import { SportsDataEvent, SportsDataProvider } from "./types";

interface SportmonksFixtureResponse {
  data?: Record<string, unknown> | null;
}

export class SportmonksClient implements SportsDataProvider {
  private readonly logger = new Logger(SportmonksClient.name);

  constructor(private readonly config: SportsDataConfig) {}

  get isEnabled(): boolean {
    return Boolean(this.config.sportmonksApiToken);
  }

  async fetchEvent(eventId: string): Promise<SportsDataEvent | null> {
    if (!this.isEnabled) {
      return null;
    }

    const url = `${this.config.sportmonksBaseUrl}/fixtures/${encodeURIComponent(eventId)}?api_token=${encodeURIComponent(
      this.config.sportmonksApiToken as string
    )}&include=scores,participants,league,season,venue,statistics,statistics.player,statistics.type,statistics.team&timezone=UTC`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.requestTimeoutMs
      );
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as SportmonksFixtureResponse;
      if (!payload.data) {
        return null;
      }

      return this.mapFixture(payload.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sportmonks request failed: ${message}`);
      return null;
    }
  }

  private mapFixture(entry: Record<string, unknown>): SportsDataEvent | null {
    const id = this.ensureString(entry.id);
    if (!id) {
      return null;
    }

    const statusRaw = this.ensureString(entry.status) ?? "";
    const league = this.safeNested(entry, ["league", "data", "name"]);
    const sport = this.safeNested(entry, ["sport", "data", "name"]);
    const season = this.safeNested(entry, ["season", "data", "name"]);
    const venue = this.safeNested(entry, ["venue", "data", "name"]);
    const startsAtRaw = this.ensureString(entry.starting_at) ?? this.ensureString(entry.starting_at_timestamp);
    const startsAt = startsAtRaw ? new Date(startsAtRaw) : undefined;

    const scores = Array.isArray(entry.scores) ? (entry.scores as Array<Record<string, unknown>>) : [];
    const scoreHome = this.extractScore(scores, "home");
    const scoreAway = this.extractScore(scores, "away");

    const participants = Array.isArray(entry.participants)
      ? (entry.participants as Array<Record<string, unknown>>)
      : [];
    const homeTeam = participants.find((team) => this.ensureString(team.meta)?.toLowerCase() === "home");
    const awayTeam = participants.find((team) => this.ensureString(team.meta)?.toLowerCase() === "away");

    const playerStats = this.extractPlayerStats(entry);

    return {
      eventId: id,
      source: "sportmonks",
      status: this.mapStatus(statusRaw, scoreHome?.score, scoreAway?.score),
      sport: sport ?? undefined,
      league: league ?? undefined,
      startsAt: startsAt?.toISOString(),
      headline: this.ensureString(entry.name) ?? undefined,
      score:
        typeof scoreHome?.score === "number" && typeof scoreAway?.score === "number"
          ? {
              home: scoreHome.score,
              away: scoreAway.score,
              period: scoreHome.description ?? scoreAway?.description ?? undefined,
            }
          : undefined,
      metadata: {
        season,
        venue,
        leagueId: this.ensureString(entry.league_id) ?? undefined,
        seasonId: this.ensureString(entry.season_id) ?? undefined,
        round: this.ensureString(entry.round) ?? undefined,
        referee: this.ensureString(entry.referee_id) ?? undefined,
        homeTeam: this.ensureString(homeTeam?.name) ?? undefined,
        homeTeamId: this.ensureString(homeTeam?.id) ?? undefined,
        awayTeam: this.ensureString(awayTeam?.name) ?? undefined,
        awayTeamId: this.ensureString(awayTeam?.id) ?? undefined,
      },
      players: playerStats,
    } satisfies SportsDataEvent;
  }

  private extractScore(
    scores: Array<Record<string, unknown>>,
    type: string
  ): { score: number; description?: string } | null {
    const entry = scores.find((score) => this.ensureString(score.description)?.toLowerCase() === type);
    if (!entry) {
      return null;
    }
    const score = this.ensureNumber(entry.score);
    if (score === undefined) {
      return null;
    }
    return {
      score,
      description: this.ensureString(entry.scoreboard) ?? this.ensureString(entry.participant),
    };
  }

  private mapStatus(statusRaw: string, home?: number | undefined, away?: number | undefined): SportsDataEvent["status"] {
    const normalized = statusRaw.toLowerCase();
    if (normalized === "not started" || normalized === "postponed" || normalized === "canceled") {
      return normalized === "canceled" ? "canceled" : "scheduled";
    }
    if (normalized === "live" || normalized === "inplay" || normalized.includes("live")) {
      return "live";
    }
    if (normalized === "ft" || normalized.includes("ended") || normalized.includes("finished")) {
      if (typeof home === "number" && typeof away === "number") {
        return "final";
      }
      return "completed";
    }
    return "unknown";
  }

  private ensureString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
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

  private safeNested(entry: Record<string, unknown>, path: string[]): string | undefined {
    let current: unknown = entry;
    for (const key of path) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return this.ensureString(current);
  }

  private extractPlayerStats(entry: Record<string, unknown>) {
    const statisticsRaw = (entry.statistics as Record<string, unknown> | undefined)?.data;
    if (!Array.isArray(statisticsRaw)) {
      return [];
    }

    const result = [] as import("./types").SportsDataPlayerStat[];

    for (const statEntry of statisticsRaw) {
      if (!statEntry || typeof statEntry !== "object") {
        continue;
      }

      const playerData = (statEntry as Record<string, unknown>).player as Record<string, unknown> | undefined;
      const teamData = (statEntry as Record<string, unknown>).team as Record<string, unknown> | undefined;
      const details = (statEntry as Record<string, unknown>).details as Record<string, unknown> | undefined;

      const playerId = this.ensureString(playerData?.id) ?? this.ensureString((statEntry as Record<string, unknown>).player_id);
      if (!playerId) {
        continue;
      }

      const parsed = this.parseStatistics(details ?? statEntry);

      result.push({
        playerId,
        playerName: this.ensureString(playerData?.full_name) ?? this.ensureString(playerData?.name),
        jerseyNumber: this.ensureString(playerData?.jersey_number) ?? this.ensureString(playerData?.shirt_number),
        position: this.ensureString(playerData?.position) ?? this.ensureString(playerData?.position_id),
        teamId: this.ensureString(teamData?.id) ?? this.ensureString((statEntry as Record<string, unknown>).team_id),
        teamName: this.ensureString(teamData?.name),
        minutes: parsed.minutes,
        points: parsed.points,
        rebounds: parsed.rebounds,
        assists: parsed.assists,
        steals: parsed.steals,
        blocks: parsed.blocks,
        plusMinus: parsed.plusMinus,
        turnovers: parsed.turnovers,
        fouls: parsed.fouls,
        metadata: parsed.metadata,
      });
    }

    return result;
  }

  private parseStatistics(details: Record<string, unknown>) {
    const metadata: Record<string, unknown> = {
      raw: details,
    };

    const minutesRaw = this.ensureString(details.minutes) ?? this.ensureString(details.min) ?? this.ensureString(details.played);
    const minutes = minutesRaw ? this.parseMinutes(minutesRaw) : undefined;

    const getNumber = (key: string): number | undefined => {
      const value = details[key];
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };

    const plusMinus = getNumber("plus_minus") ?? getNumber("plusMinus");

    return {
      minutes,
      points: getNumber("points") ?? getNumber("pts"),
      rebounds: getNumber("rebounds") ?? getNumber("reb") ?? getNumber("defensive_rebounds") ?? getNumber("offensive_rebounds"),
      assists: getNumber("assists") ?? getNumber("ast"),
      steals: getNumber("steals") ?? getNumber("stl"),
      blocks: getNumber("blocks") ?? getNumber("blk"),
      turnovers: getNumber("turnovers") ?? getNumber("to"),
      fouls: getNumber("personal_fouls") ?? getNumber("pf"),
      plusMinus,
      metadata,
    };
  }

  private parseMinutes(value: string): number | undefined {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : undefined;
    }

    if (trimmed.includes(":")) {
      const [minutes, seconds] = trimmed.split(":");
      const minVal = Number(minutes);
      const secVal = Number(seconds);
      if (Number.isFinite(minVal) && Number.isFinite(secVal)) {
        return minVal + secVal / 60;
      }
    }

    return undefined;
  }
}
