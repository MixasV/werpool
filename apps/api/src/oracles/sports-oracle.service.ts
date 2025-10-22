import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { OracleSnapshot } from "@prisma/client";

import { resolveSportsDataConfig } from "../common/sports-data.config";
import { TheSportsDbClient } from "./providers/the-sports-db.client";
import { SportmonksClient } from "./providers/sportmonks.client";
import {
  SportsDataEvent,
  SportsDataEventStatus,
  SportsDataPlayerStat,
  SportsDataProvider,
  SportsDataScore,
} from "./providers/types";

import { PrismaService } from "../prisma/prisma.service";
import { PublishSportsEventRequestDto } from "./dto/publish-sports.dto";
import { SportsEventDto } from "./dto/sports-event.dto";
import { signOraclePayload } from "./signing.util";
import { serializeJson } from "../common/prisma-json.util";

type PublishParams = PublishSportsEventRequestDto & {
  publishedBy?: string | null;
};

@Injectable()
export class SportsOracleService {
  private readonly logger = new Logger(SportsOracleService.name);
  private readonly signingKey: string;
  private readonly sportsDbClient: TheSportsDbClient;
  private readonly sportmonksClient: SportmonksClient;
  private readonly providers: SportsDataProvider[];
  private readonly statusPriority: SportsDataEventStatus[] = [
    "final",
    "completed",
    "live",
    "scheduled",
    "canceled",
    "unknown",
  ];

  constructor(private readonly prisma: PrismaService) {
    this.signingKey = this.resolveSigningKey();
    const sportsConfig = resolveSportsDataConfig();
    this.sportsDbClient = new TheSportsDbClient(sportsConfig);
    this.sportmonksClient = new SportmonksClient(sportsConfig);
    this.providers = [this.sportsDbClient, this.sportmonksClient];
  }

  async publishEvent(params: PublishParams): Promise<SportsEventDto> {
    const eventId = this.normalizeEventId(params.eventId);
    const status = this.normalizeStatus(params.status);
    const nowIso = new Date().toISOString();

    const metadata = await this.buildMetadata(params);

    const payload = serializeJson({
      type: "sports.event",
      eventId,
      source: params.source,
      status,
      league: params.league ?? null,
      sport: params.sport ?? null,
      startsAt: params.startsAt ?? null,
      headline: params.headline ?? null,
      score: params.score
        ? {
            home: Number(params.score.home ?? 0),
            away: Number(params.score.away ?? 0),
            period: params.score.period ?? null,
          }
        : null,
      metadata,
      updatedAt: nowIso,
    });

    const signature = signOraclePayload(payload, this.signingKey);

    const snapshot = await this.prisma.oracleSnapshot.create({
      data: {
        type: "SPORTS",
        source: params.source,
        eventId,
        payload,
        signature,
        publishedBy: params.publishedBy ?? null,
      },
    });

    return this.toDto(snapshot);
  }

  async getLatestEvent(eventId: string): Promise<SportsEventDto | null> {
    const normalized = this.normalizeEventId(eventId);
    const snapshot = await this.prisma.oracleSnapshot.findFirst({
      where: {
        type: "SPORTS",
        eventId: normalized,
      },
      orderBy: { createdAt: "desc" },
    });

    return snapshot ? this.toDto(snapshot) : null;
  }

  async listEvents(eventId: string, limit = 20): Promise<SportsEventDto[]> {
    const normalized = this.normalizeEventId(eventId);
    const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20;
    const snapshots = await this.prisma.oracleSnapshot.findMany({
      where: {
        type: "SPORTS",
        eventId: normalized,
      },
      orderBy: { createdAt: "desc" },
      take: sanitizedLimit,
    });

    return snapshots.map((snapshot) => this.toDto(snapshot));
  }

  async listBySource(source: string, limit = 50): Promise<SportsEventDto[]> {
    const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
    const snapshots = await this.prisma.oracleSnapshot.findMany({
      where: {
        type: "SPORTS",
        source,
      },
      orderBy: { createdAt: "desc" },
      take: sanitizedLimit,
    });

    return snapshots.map((snapshot) => this.toDto(snapshot));
  }

  async listAll(limit = 50): Promise<SportsEventDto[]> {
    const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
    const snapshots = await this.prisma.oracleSnapshot.findMany({
      where: { type: "SPORTS" },
      orderBy: { createdAt: "desc" },
      take: sanitizedLimit,
    });

    return snapshots.map((snapshot) => this.toDto(snapshot));
  }

  async fetchUpcomingEvents(leagueId: string, limit = 20): Promise<SportsDataEvent[]> {
    const events: SportsDataEvent[] = [];

    if (this.sportsDbClient.isEnabled) {
      try {
        const upcoming = await this.sportsDbClient.fetchUpcomingEvents(leagueId, limit);
        events.push(...upcoming);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`TheSportsDB upcoming events error: ${message}`);
      }
    }

    return this.deduplicateEvents(events).slice(0, limit);
  }

  async syncEventFromProviders(eventId: string, options: { publishedBy?: string | null } = {}): Promise<SportsEventDto | null> {
    const normalizedId = this.normalizeEventId(eventId);
    const providerEvents: SportsDataEvent[] = [];

    for (const provider of this.providers) {
      if (!provider.isEnabled) {
        continue;
      }
      const result = await provider.fetchEvent(normalizedId);
      if (result) {
        providerEvents.push(result);
      }
    }

    if (providerEvents.length === 0) {
      this.logger.warn(`No sports data providers returned event ${normalizedId}`);
      return null;
    }

    const aggregated = this.aggregateProviderEvents(providerEvents);

    const normalizedStatus = this.normalizeStatusForPublish(aggregated.status);

    const publishParams: PublishParams = {
      eventId: normalizedId,
      status: normalizedStatus,
      source: aggregated.source,
      sport: aggregated.sport,
      league: aggregated.league,
      startsAt: aggregated.startsAt,
      headline: aggregated.headline,
      score: aggregated.score
        ? {
            home: aggregated.score.home,
            away: aggregated.score.away,
            period: aggregated.score.period,
          }
        : undefined,
      metadata: aggregated.metadata,
      publishedBy: options.publishedBy ?? null,
    } satisfies PublishParams;

    return this.publishEvent(publishParams);
  }

  private toDto(snapshot: OracleSnapshot): SportsEventDto {
    const payload = this.parsePayload(snapshot.payload);
    const eventId = (payload.eventId as string | undefined) ?? snapshot.eventId ?? "";
    const status = typeof payload.status === "string" ? payload.status : "unknown";

    const payloadRecord: Record<string, unknown> = {
      ...payload,
      eventId,
      status,
    };

    return {
      eventId,
      status,
      signature: snapshot.signature,
      publishedAt: snapshot.createdAt.toISOString(),
      publishedBy: snapshot.publishedBy ?? null,
      payload: payloadRecord,
    } satisfies SportsEventDto;
  }

  private parsePayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {};
    }
    return payload as Record<string, unknown>;
  }

  private deduplicateEvents(events: SportsDataEvent[]): SportsDataEvent[] {
    const seen = new Map<string, SportsDataEvent>();
    for (const event of events) {
      const key = this.normalizeEventId(event.eventId ?? "");
      if (!key || seen.has(key)) {
        continue;
      }
      seen.set(key, event);
    }
    return Array.from(seen.values());
  }

  private aggregateProviderEvents(events: SportsDataEvent[]) {
    const sorted = [...events].sort((a, b) => this.statusPriorityIndex(a.status) - this.statusPriorityIndex(b.status));
    const primary = sorted[0];
    const consensusScore = this.resolveConsensusScore(events.map((entry) => entry.score).filter(Boolean) as SportsDataScore[]);
    const metadataSources = events.map((entry) => ({
      provider: entry.source,
      status: entry.status,
      startsAt: entry.startsAt,
      score: entry.score ?? null,
      metadata: entry.metadata ?? null,
    }));

    const metadata: Record<string, unknown> = {
      sources: metadataSources,
    };

    if (events.some((entry) => entry.status !== primary.status)) {
      metadata.statusDisagreement = true;
    }
    if (events.some((entry) => !this.scoresEqual(entry.score, primary.score))) {
      metadata.scoreDisagreement = true;
    }

    const players = this.mergePlayerStats(events);
    if (players.length > 0) {
      metadata.players = players;
    }

    return {
      eventId: primary.eventId,
      status: primary.status,
      sport: primary.sport ?? events.find((entry) => entry.sport)?.sport,
      league: primary.league ?? events.find((entry) => entry.league)?.league,
      startsAt: primary.startsAt ?? events.find((entry) => entry.startsAt)?.startsAt,
      headline: primary.headline ?? events.find((entry) => entry.headline)?.headline,
      score: consensusScore ?? primary.score,
      source: "aggregated:sports-data",
      metadata,
      players,
    } satisfies SportsDataEvent;
  }

  private mergePlayerStats(events: SportsDataEvent[]): SportsDataPlayerStat[] {
    const merged = new Map<string, SportsDataPlayerStat>();

    for (const event of events) {
      if (!Array.isArray(event.players)) {
        continue;
      }
      for (const player of event.players) {
        if (!player || typeof player.playerId !== "string") {
          continue;
        }
        const key = player.playerId;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { ...player });
          continue;
        }

        merged.set(key, {
          ...existing,
          playerName: existing.playerName ?? player.playerName,
          teamId: existing.teamId ?? player.teamId,
          teamName: existing.teamName ?? player.teamName,
          position: existing.position ?? player.position,
          jerseyNumber: existing.jerseyNumber ?? player.jerseyNumber,
          minutes: this.resolveStatValue(existing.minutes, player.minutes),
          points: this.resolveStatValue(existing.points, player.points),
          rebounds: this.resolveStatValue(existing.rebounds, player.rebounds),
          assists: this.resolveStatValue(existing.assists, player.assists),
          steals: this.resolveStatValue(existing.steals, player.steals),
          blocks: this.resolveStatValue(existing.blocks, player.blocks),
          plusMinus: this.resolveStatValue(existing.plusMinus, player.plusMinus),
          turnovers: this.resolveStatValue(existing.turnovers, player.turnovers),
          fouls: this.resolveStatValue(existing.fouls, player.fouls),
          metadata: {
            ...(existing.metadata ?? {}),
            ...(player.metadata ?? {}),
          },
        });
      }
    }

    return Array.from(merged.values());
  }

  private resolveStatValue(a?: number, b?: number): number | undefined {
    if (typeof b === "number" && Number.isFinite(b)) {
      return b;
    }
    if (typeof a === "number" && Number.isFinite(a)) {
      return a;
    }
    return undefined;
  }

  private resolveConsensusScore(scores: SportsDataScore[]): SportsDataScore | undefined {
    if (scores.length === 0) {
      return undefined;
    }

    const normalized = scores.map((score) => ({
      home: score.home,
      away: score.away,
      period: score.period,
    }));

    const first = normalized[0];
    const allEqual = normalized.every((score) => score.home === first.home && score.away === first.away);

    if (allEqual) {
      return first;
    }

    const finalized = normalized.find((score) => typeof score.home === "number" && typeof score.away === "number");
    return finalized ?? undefined;
  }

  private scoresEqual(a?: SportsDataScore, b?: SportsDataScore): boolean {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.home === b.home && a.away === b.away;
  }

  private statusPriorityIndex(status: SportsDataEventStatus): number {
    const index = this.statusPriority.indexOf(status);
    return index >= 0 ? index : this.statusPriority.length;
  }

  private normalizeStatusForPublish(status: SportsDataEventStatus): "scheduled" | "live" | "final" | "canceled" {
    if (status === "completed") {
      return "final";
    }
    if (status === "unknown") {
      return "scheduled";
    }
    return status as "scheduled" | "live" | "final" | "canceled";
  }

  private normalizeEventId(value: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ServiceUnavailableException("eventId is required");
    }
    return value.trim();
  }

  private normalizeStatus(value: string): string {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case "scheduled":
      case "live":
        return normalized;
      case "final":
      case "completed":
        return "final";
      case "canceled":
        return normalized;
      default:
        this.logger.warn(`Unknown event status ${value}; storing as 'unknown'`);
        return "unknown";
    }
  }

  private async buildMetadata(
    params: PublishParams
  ): Promise<Record<string, unknown>> {
    const metadata: Record<string, unknown> = {
      ...(params.metadata ?? {}),
    };

    if (typeof metadata.playId === "string" && this.isTopShotSource(params.source)) {
      const topShot = await this.fetchTopShotMetadata(metadata.playId as string);
      if (topShot) {
        metadata.topShot = topShot;
      }
    }

    return metadata;
  }

  private isTopShotSource(source: string): boolean {
    const normalized = source.trim().toLowerCase();
    return normalized === "topshot" || normalized === "nba-topshot";
  }

  private async fetchTopShotMetadata(playId: string): Promise<Record<string, unknown> | null> {
    try {
    // In production we could issue a GraphQL query to NBA TopShot.
    // For offline mode we return predefined data based on playId.
      return {
        playId,
        title: `TopShot Highlight #${playId}`,
        player: {
          name: "Flow Superstar",
          jerseyNumber: 33,
          team: "Flow Fusions",
        },
        momentUrl: `https://nbatopshot.com/moment/${playId}`,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch TopShot data for ${playId}: ${(error as Error).message}`
      );
      return null;
    }
  }

  private resolveSigningKey(): string {
    const key = process.env.ORACLE_SIGNING_KEY?.trim();
    if (!key) {
      throw new Error(
        "ORACLE_SIGNING_KEY environment variable is required for oracle signing"
      );
    }
    return key;
  }
}
