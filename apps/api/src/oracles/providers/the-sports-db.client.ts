import { Logger } from "@nestjs/common";

import { SportsDataConfig } from "../../common/sports-data.config";
import { SportsDataEvent } from "./types";

interface TheSportsDbResponse {
  events?: Array<Record<string, unknown>>;
  event?: Array<Record<string, unknown>>;
}

export class TheSportsDbClient {
  private readonly logger = new Logger(TheSportsDbClient.name);

  constructor(private readonly config: SportsDataConfig) {}

  get isEnabled(): boolean {
    return Boolean(this.config.theSportsDbApiKey);
  }

  async fetchEvent(eventId: string): Promise<SportsDataEvent | null> {
    if (!this.isEnabled) {
      return null;
    }

    const url = `${this.config.theSportsDbBaseUrl}/${this.config.theSportsDbApiKey}/lookupevent.php?id=${encodeURIComponent(
      eventId
    )}`;

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

      const payload = (await response.json()) as TheSportsDbResponse;
      const event = payload.events?.[0] ?? payload.event?.[0];
      if (!event) {
        return null;
      }

      return this.mapEvent(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TheSportsDB request failed: ${message}`);
      return null;
    }
  }

  async fetchUpcomingEvents(leagueId: string, limit = 20): Promise<SportsDataEvent[]> {
    if (!this.isEnabled) {
      return [];
    }

    const url = `${this.config.theSportsDbBaseUrl}/${this.config.theSportsDbApiKey}/eventsnextleague.php?id=${encodeURIComponent(
      leagueId
    )}`;

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

      const payload = (await response.json()) as TheSportsDbResponse;
      const entries = Array.isArray(payload.events) ? payload.events.slice(0, limit) : [];

      const events: SportsDataEvent[] = [];
      for (const entry of entries) {
        const mapped = this.mapEvent(entry);
        if (mapped) {
          events.push(mapped);
        }
      }
      return events;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TheSportsDB upcoming events failed: ${message}`);
      return [];
    }
  }

  private mapEvent(entry: Record<string, unknown>): SportsDataEvent | null {
    const id = this.ensureString(entry.idEvent ?? entry.id);
    if (!id) {
      return null;
    }

    const statusRaw = this.ensureString(entry.strStatus) ?? "";
    const sport = this.ensureString(entry.strSport);
    const league = this.ensureString(entry.strLeague) ?? undefined;
    const season = this.ensureString(entry.strSeason) ?? undefined;
    const round = this.ensureString(entry.intRound) ?? undefined;
    const homeTeam = this.ensureString(entry.strHomeTeam) ?? undefined;
    const awayTeam = this.ensureString(entry.strAwayTeam) ?? undefined;
    const venue = this.ensureString(entry.strVenue) ?? undefined;
    const country = this.ensureString(entry.strCountry) ?? undefined;
    const startsAtRaw =
      this.ensureString(entry.dateEvent) && this.ensureString(entry.strTimestamp)
        ? `${entry.dateEvent}T${entry.strTimestamp}`
        : (this.ensureString(entry.dateEvent) ?? this.ensureString(entry.strTimestamp));

    const startsAt = startsAtRaw ? new Date(startsAtRaw) : undefined;
    const scoreHome = this.ensureNumber(entry.intHomeScore);
    const scoreAway = this.ensureNumber(entry.intAwayScore);

    const status = this.mapStatus(statusRaw, scoreHome, scoreAway);

    return {
      eventId: id,
      status,
      source: "thesportsdb",
      sport,
      league,
      startsAt: startsAt?.toISOString(),
      headline: this.ensureString(entry.strEvent) ?? undefined,
      score:
        typeof scoreHome === "number" && typeof scoreAway === "number"
          ? {
              home: scoreHome,
              away: scoreAway,
              period: this.ensureString(entry.strProgress) ?? undefined,
            }
          : undefined,
      metadata: {
        season,
        round,
        venue,
        country,
        homeTeam,
        awayTeam,
        referee: this.ensureString(entry.strReferee) ?? undefined,
        leagueId: this.ensureString(entry.idLeague) ?? undefined,
        homeTeamId: this.ensureString(entry.idHomeTeam) ?? undefined,
        awayTeamId: this.ensureString(entry.idAwayTeam) ?? undefined,
      },
    } satisfies SportsDataEvent;
  }

  private mapStatus(statusRaw: string, home?: number | null, away?: number | null): SportsDataEvent["status"] {
    const normalized = statusRaw.toLowerCase();
    if (normalized.includes("postponed")) {
      return "scheduled";
    }
    if (normalized.includes("not started") || normalized.includes("scheduled")) {
      return "scheduled";
    }
    if (normalized.includes("in play") || normalized.includes("half")) {
      return "live";
    }
    if (normalized.includes("match finished") || normalized.includes("full time") || normalized.includes("completed")) {
      if (typeof home === "number" && typeof away === "number") {
        return "final";
      }
      return "completed";
    }
    if (normalized.includes("abandoned") || normalized.includes("cancelled")) {
      return "canceled";
    }
    return "unknown";
  }

  private ensureString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
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
}
