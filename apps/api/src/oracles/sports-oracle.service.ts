import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { OracleSnapshot } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PublishSportsEventRequestDto } from "./dto/publish-sports.dto";
import { SportsEventDto } from "./dto/sports-event.dto";
import { signOraclePayload } from "./signing.util";

type PublishParams = PublishSportsEventRequestDto & {
  publishedBy?: string | null;
};

@Injectable()
export class SportsOracleService {
  private readonly logger = new Logger(SportsOracleService.name);
  private readonly signingKey = process.env.ORACLE_SIGNING_KEY ?? "dev-secret";

  constructor(private readonly prisma: PrismaService) {}

  async publishEvent(params: PublishParams): Promise<SportsEventDto> {
    const eventId = this.normalizeEventId(params.eventId);
    const status = this.normalizeStatus(params.status);
    const nowIso = new Date().toISOString();

    const metadata = await this.buildMetadata(params);

    const payload = {
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
    } as const;

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

  private normalizeEventId(value: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ServiceUnavailableException("eventId обязателен");
    }
    return value.trim();
  }

  private normalizeStatus(value: string): string {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case "scheduled":
      case "live":
      case "final":
      case "canceled":
        return normalized;
      default:
        this.logger.warn(`Неизвестный статус события ${value}, сохраняем как 'unknown'`);
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
      // В рабочем окружении здесь можно выполнить GraphQL запрос к NBA TopShot.
      // Для оффлайн-режима возвращаем предопределённые данные, основанные на playId.
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
        `Не удалось получить данные TopShot для ${playId}: ${(error as Error).message}`
      );
      return null;
    }
  }
}
