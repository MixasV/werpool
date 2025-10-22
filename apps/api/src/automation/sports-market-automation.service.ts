import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { MarketsService } from "../markets/markets.service";
import { SportsOracleService } from "../oracles/sports-oracle.service";
import { SportsEventDto } from "../oracles/dto/sports-event.dto";
import { SportsDataEvent } from "../oracles/providers/types";

interface LeagueConfig {
  slug: string;
  leagueId: string;
  displayName: string;
  sport: "soccer" | "basketball" | "hockey";
  tags: string[];
  maxMarkets?: number;
}

interface EventContext {
  eventId: string;
  league: LeagueConfig | null;
  sport: "soccer" | "basketball" | "hockey" | null;
}

interface PolymarketMarket {
  question?: string;
  slug?: string;
  outcomes?: string;
  volume1wk?: number | string;
  volume1mo?: number | string;
  volume24hr?: number | string;
  volume24hrAmm?: number | string;
  volume24hrClob?: number | string;
  liquidityAmm?: number | string;
  endDate?: string;
}

@Injectable()
export class SportsMarketAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SportsMarketAutomationService.name);
  private readonly enabled = this.resolveEnabledFlag();
  private readonly intervalMs = this.resolveIntervalMs();
  private readonly lookaheadDays = 14;
  private readonly defaultMaxPerLeague = 3;
  private readonly liquidityTotal = 1800;

  private readonly leagues: LeagueConfig[] = [
    {
      slug: "uefa-champions-league",
      leagueId: "4480",
      displayName: "UEFA Champions League",
      sport: "soccer",
      tags: ["uefa", "champions-league"],
      maxMarkets: 4,
    },
    {
      slug: "premier-league",
      leagueId: "4328",
      displayName: "English Premier League",
      sport: "soccer",
      tags: ["premier-league", "england"],
      maxMarkets: 2,
    },
    {
      slug: "nba",
      leagueId: "4387",
      displayName: "NBA",
      sport: "basketball",
      tags: ["nba", "usa"],
      maxMarkets: 3,
    },
    {
      slug: "nhl",
      leagueId: "4380",
      displayName: "NHL",
      sport: "hockey",
      tags: ["nhl", "usa", "canada"],
      maxMarkets: 2,
    },
  ];

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private polymarketCache: { fetchedAt: number; markets: PolymarketMarket[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketsService: MarketsService,
    private readonly sportsOracle: SportsOracleService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log("Sports automation disabled via configuration");
      return;
    }

    await this.safeRunCycle("startup");

    this.timer = setInterval(() => {
      void this.safeRunCycle("interval");
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveEnabledFlag(): boolean {
    return (process.env.SPORTS_MARKET_AUTOMATION_ENABLED ?? "true").toLowerCase() !== "false";
  }

  private resolveIntervalMs(): number {
    const fallback = 30 * 60 * 1000;
    const raw = process.env.SPORTS_MARKET_AUTOMATION_INTERVAL_MS;
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private async safeRunCycle(reason: string): Promise<void> {
    if (this.running) {
      this.logger.warn(`Skipping sports automation cycle (${reason}); previous cycle still running`);
      return;
    }

    this.running = true;
    try {
      await this.runCycle();
    } catch (error) {
      const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(`Sports automation cycle failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async runCycle(): Promise<void> {
    await this.ensureUpcomingMarkets();
    await this.resolveCompletedMarkets();
  }

  private async ensureUpcomingMarkets(): Promise<void> {
    const now = new Date();
    const lookaheadLimit = new Date(now.getTime() + this.lookaheadDays * 24 * 60 * 60 * 1000);
    const polymarketMarkets = await this.getPolymarketMarkets();

    for (const league of this.leagues) {
      const upcoming = await this.sportsOracle.fetchUpcomingEvents(league.leagueId, 20);
      const enriched = upcoming
        .filter((event) => this.isWithinWindow(event.startsAt, now, lookaheadLimit))
        .map((event) => {
          const teams = this.extractTeams(event);
          if (!teams) {
            return null;
          }
          const startsAt = event.startsAt ? new Date(event.startsAt) : null;
          if (!startsAt || Number.isNaN(startsAt.getTime())) {
            return null;
          }
          const score = this.computePolymarketScore(event, teams, polymarketMarkets);
          return { event, teams, startsAt, score };
        })
        .filter((entry): entry is { event: SportsDataEvent; teams: { home: string; away: string }; startsAt: Date; score: number } => entry !== null)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.startsAt.getTime() - b.startsAt.getTime();
        });

      let created = 0;
      const maxMarkets = league.maxMarkets ?? this.defaultMaxPerLeague;

      for (const entry of enriched) {
        if (created >= maxMarkets) {
          break;
        }

        const slug = this.buildMarketSlug(league.slug, entry.event.eventId);
        const existing = await this.prisma.market.findUnique({ where: { slug } });
        if (existing) {
          continue;
        }

        await this.createMarketForEvent({
          league,
          event: entry.event,
          teams: entry.teams,
          startsAt: entry.startsAt,
          now,
          polymarketScore: entry.score,
        });
        created += 1;
      }
    }
  }

  private async createMarketForEvent(params: {
    league: LeagueConfig;
    event: SportsDataEvent;
    teams: { home: string; away: string };
    startsAt: Date;
    now: Date;
    polymarketScore: number;
  }): Promise<void> {
    const { league, event, teams, startsAt, now, polymarketScore } = params;
    const slug = this.buildMarketSlug(league.slug, event.eventId);
    const oracleId = `oracle:sports:${event.eventId}`;

    const schedule = this.buildSchedule(startsAt, now);
    const probabilities = this.resolveProbabilities(league.sport);

    const outcomes = this.buildOutcomes({
      league,
      teams,
      probabilities,
    });

    const description =
      `${league.displayName} market sourced from TheSportsDB & Sportmonks consensus.
Trading locks 10 minutes before tip-off. Settlement relies on verified final scores with a ${this.scheduleDisputeHours()}-hour dispute window.`;

    const tags = [
      "sports",
      "auto",
      `league:${league.slug}`,
      `sport:${league.sport}`,
      `event:${event.eventId}`,
      `home:${this.slugifyTeam(teams.home)}`,
      `away:${this.slugifyTeam(teams.away)}`,
    ];

    await this.marketsService.create({
      slug,
      title: `${league.displayName}: ${teams.home} vs ${teams.away}`,
      description,
      category: "sports",
      tags,
      oracleId,
      state: "draft",
      closeAt: schedule.closeAt.toISOString(),
      schedule: {
        scheduledStartAt: schedule.openAt.toISOString(),
        tradingLockAt: schedule.lockAt.toISOString(),
        freezeWindowStartAt: schedule.freezeStart.toISOString(),
        freezeWindowEndAt: schedule.freezeEnd.toISOString(),
      },
      patrolThreshold: 3,
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: this.liquidityTotal,
        feeBps: 60,
        providerCount: 4,
      },
      outcomes,
      workflow: [
        {
          type: "custom",
          status: "executed",
          description: `Auto-created sports market for ${teams.home} vs ${teams.away}`,
          metadata: {
            league: league.slug,
            eventId: event.eventId,
            startsAt: startsAt.toISOString(),
            sport: league.sport,
            polymarketScore,
          },
        },
        {
          type: "settle",
          status: "pending",
          description: "Resolve using aggregated sports oracle data",
          triggersAt: schedule.freezeEnd.toISOString(),
          metadata: {
            league: league.slug,
            eventId: event.eventId,
            disputeWindowHours: this.scheduleDisputeHours(),
          },
        },
      ],
    });

    this.logger.log(
      `Created sports market ${slug} (${teams.home} vs ${teams.away}, ${league.displayName})`
    );
  }

  private async resolveCompletedMarkets(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.market.findMany({
      where: {
        category: "SPORTS",
        slug: { startsWith: "sports-" },
        state: "CLOSED",
        freezeWindowEndAt: { lte: now },
        settlement: null,
      },
      include: {
        outcomes: true,
      },
    });

    for (const market of candidates) {
      const context = this.extractEventContext(market.tags ?? [], market.slug);
      if (!context) {
        this.logger.warn(`Unable to derive event context for market ${market.slug}`);
        continue;
      }

      const event = await this.sportsOracle.syncEventFromProviders(context.eventId);
      if (!event) {
        this.logger.warn(`Event ${context.eventId} not returned by providers`);
        continue;
      }

      const resolution = this.selectOutcomeForEvent(market.outcomes, event, context);
      if (!resolution) {
        this.logger.warn(`Postponing settlement for ${market.slug}: event data not final yet`);
        continue;
      }

      await this.marketsService.settleMarket(market.id, {
        outcomeId: resolution.index + 1,
        resolvedOutcomeId: resolution.id,
        txHash: `auto:sports:${market.slug}:${Date.now()}`,
        notes: resolution.notes,
      });

      this.logger.log(
        `Resolved market ${market.slug} with outcome "${resolution.label}"`
      );
    }
  }

  private extractEventContext(tags: string[], slug: string): EventContext | null {
    const eventTag = tags.find((tag) => tag.startsWith("event:"));
    if (!eventTag) {
      return null;
    }

    const eventId = eventTag.split(":")[1];
    if (!eventId) {
      return null;
    }

    let league: LeagueConfig | null = null;
    for (const entry of tags) {
      if (!entry.startsWith("league:")) {
        continue;
      }
      const slugValue = entry.split(":")[1];
      league = this.leagues.find((item) => item.slug === slugValue) ?? null;
      break;
    }

    const sport = league?.sport ?? this.detectSportFromSlug(slug);

    return {
      eventId,
      league,
      sport,
    };
  }

  private detectSportFromSlug(slug: string): EventContext["sport"] {
    if (slug.includes("nba")) {
      return "basketball";
    }
    if (slug.includes("nhl")) {
      return "hockey";
    }
    return "soccer";
  }

  private selectOutcomeForEvent(
    outcomes: Array<{ id: string; label: string; metadata: Prisma.JsonValue }>,
    event: SportsEventDto,
    context: EventContext
  ): { id: string; index: number; label: string; notes: string } | null {
    const payload = event.payload ?? {};
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "unknown";
    const score = this.extractScore(payload);

    const mapping = this.mapOutcomes(outcomes);
    if (!mapping.home || !mapping.away || !mapping.draw || !mapping.cancel) {
      return null;
    }

    if (status === "canceled") {
      return {
        id: mapping.cancel.id,
        index: mapping.cancel.index,
        label: mapping.cancel.label,
        notes: "Match cancelled per oracle data",
      };
    }

    if (!score || !Number.isFinite(score.home) || !Number.isFinite(score.away)) {
      return null;
    }

    if (score.home === score.away) {
      return {
        id: mapping.draw.id,
        index: mapping.draw.index,
        label: mapping.draw.label,
        notes: `Scores level ${score.home}-${score.away}`,
      };
    }

    if (context.sport === "basketball" || context.sport === "hockey") {
      if (this.detectOvertime(payload)) {
        return {
          id: mapping.draw.id,
          index: mapping.draw.index,
          label: mapping.draw.label,
          notes: `Game required overtime; final score ${score.home}-${score.away}`,
        };
      }
    }

    const isHomeWinner = score.home > score.away;
    const target = isHomeWinner ? mapping.home : mapping.away;

    return {
      id: target.id,
      index: target.index,
      label: target.label,
      notes: `Final score ${score.home}-${score.away}`,
    };
  }

  private detectOvertime(payload: Record<string, unknown>): boolean {
    const score = this.extractScore(payload);
    const period = typeof score?.period === "string" ? score.period.toLowerCase() : "";
    if (period.includes("ot") || period.includes("so")) {
      return true;
    }

    const metadataSources = this.extractMetadataSources(payload);
    for (const source of metadataSources) {
      const providerMetadata = source.metadata;
      if (providerMetadata && typeof providerMetadata === "object") {
        const periodValue = this.toLowerString((providerMetadata as Record<string, unknown>).period);
        if (periodValue.includes("ot") || periodValue.includes("so")) {
          return true;
        }
        const statusValue = this.toLowerString((providerMetadata as Record<string, unknown>).status);
        if (statusValue.includes("ot") || statusValue.includes("overtime")) {
          return true;
        }
      }
    }

    return false;
  }

  private extractMetadataSources(payload: Record<string, unknown>): Array<{
    provider: string;
    metadata: unknown;
  }> {
    const metadata = payload.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return [];
    }

    const sources = (metadata as Record<string, unknown>).sources;
    if (!Array.isArray(sources)) {
      return [];
    }

    return sources
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const provider = this.toLowerString(record.provider ?? record.source);
        return {
          provider,
          metadata: record.metadata ?? null,
        };
      })
      .filter((entry): entry is { provider: string; metadata: unknown } => Boolean(entry && entry.provider));
  }

  private mapOutcomes(
    outcomes: Array<{ id: string; label: string; metadata: Prisma.JsonValue }>
  ): Record<"home" | "away" | "draw" | "cancel", { id: string; index: number; label: string }> {
    const result: Partial<Record<"home" | "away" | "draw" | "cancel", { id: string; index: number; label: string }>> = {};

    outcomes.forEach((outcome, index) => {
      if (!outcome.metadata || typeof outcome.metadata !== "object" || Array.isArray(outcome.metadata)) {
        return;
      }
      const type = (outcome.metadata as Record<string, unknown>).type;
      if (type === "home") {
        result.home = { id: outcome.id, index, label: outcome.label };
      } else if (type === "away") {
        result.away = { id: outcome.id, index, label: outcome.label };
      } else if (type === "draw") {
        result.draw = { id: outcome.id, index, label: outcome.label };
      } else if (type === "cancel") {
        result.cancel = { id: outcome.id, index, label: outcome.label };
      }
    });

    return result as Record<"home" | "away" | "draw" | "cancel", { id: string; index: number; label: string }>;
  }

  private extractScore(payload: Record<string, unknown>): { home: number; away: number; period?: string } | null {
    const scoreRaw = payload.score;
    if (!scoreRaw || typeof scoreRaw !== "object" || Array.isArray(scoreRaw)) {
      return null;
    }
    const record = scoreRaw as Record<string, unknown>;
    const home = Number(record.home);
    const away = Number(record.away);
    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      return null;
    }
    const period = typeof record.period === "string" ? record.period : undefined;
    return { home, away, period };
  }

  private buildOutcomes(params: {
    league: LeagueConfig;
    teams: { home: string; away: string };
    probabilities: { home: number; away: number; draw: number; cancel: number };
  }): Array<{
    label: string;
    impliedProbability: number;
    liquidity: number;
    metadata: Record<string, unknown>;
  }> {
    const { league, teams, probabilities } = params;
    const drawLabel = league.sport === "soccer" ? "Draw (90 minutes)" : "Game goes to overtime";

    return [
      {
        label: `${teams.home} wins`,
        impliedProbability: probabilities.home,
        liquidity: this.liquidityTotal / 4,
        metadata: {
          type: "home",
          league: league.slug,
          team: teams.home,
        },
      },
      {
        label: `${teams.away} wins`,
        impliedProbability: probabilities.away,
        liquidity: this.liquidityTotal / 4,
        metadata: {
          type: "away",
          league: league.slug,
          team: teams.away,
        },
      },
      {
        label: drawLabel,
        impliedProbability: probabilities.draw,
        liquidity: this.liquidityTotal / 4,
        metadata: {
          type: "draw",
          league: league.slug,
        },
      },
      {
        label: "Match cancelled / void",
        impliedProbability: probabilities.cancel,
        liquidity: this.liquidityTotal / 4,
        metadata: {
          type: "cancel",
          league: league.slug,
        },
      },
    ];
  }

  private async getPolymarketMarkets(): Promise<PolymarketMarket[]> {
    const ttl = 10 * 60 * 1000;
    if (this.polymarketCache && Date.now() - this.polymarketCache.fetchedAt < ttl) {
      return this.polymarketCache.markets;
    }

    try {
      const response = await fetch("https://gamma-api.polymarket.com/markets?closed=false&limit=500", {
        headers: { "User-Agent": "Forte-Automation/1.0" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      const markets = Array.isArray(payload)
        ? (payload as PolymarketMarket[])
        : [];
      this.polymarketCache = { markets, fetchedAt: Date.now() };
      return markets;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Polymarket API request failed: ${message}`);
      this.polymarketCache = { markets: [], fetchedAt: Date.now() };
      return [];
    }
  }

  private computePolymarketScore(
    event: SportsDataEvent,
    teams: { home: string; away: string },
    markets: PolymarketMarket[]
  ): number {
    if (markets.length === 0) {
      return 0;
    }

    const home = this.normalizeTeamForMatch(teams.home);
    const away = this.normalizeTeamForMatch(teams.away);

    let best = 0;
    for (const market of markets) {
      const question = (market.question ?? market.slug ?? "").toLowerCase();
      if (!question) {
        continue;
      }

      if (question.includes(home) && question.includes(away)) {
        const score = this.extractPolymarketVolume(market);
        if (score > best) {
          best = score;
        }
      }
    }

    return best;
  }

  private extractPolymarketVolume(market: PolymarketMarket): number {
    const candidates = [
      this.parsePolymarketNumber(market.volume24hr),
      this.parsePolymarketNumber(market.volume24hrAmm),
      this.parsePolymarketNumber(market.volume24hrClob),
      this.parsePolymarketNumber(market.volume1wk),
      this.parsePolymarketNumber(market.volume1mo),
      this.parsePolymarketNumber(market.liquidityAmm),
    ];
    const max = Math.max(...candidates.filter((value) => Number.isFinite(value)));
    return Number.isFinite(max) && max > 0 ? Number(max) : 0;
  }

  private parsePolymarketNumber(value: number | string | undefined): number {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private resolveProbabilities(
    sport: "soccer" | "basketball" | "hockey"
  ): { home: number; away: number; draw: number; cancel: number } {
    switch (sport) {
      case "basketball":
        return { home: 0.52, away: 0.41, draw: 0.05, cancel: 0.02 };
      case "hockey":
        return { home: 0.48, away: 0.4, draw: 0.1, cancel: 0.02 };
      default:
        return { home: 0.44, away: 0.33, draw: 0.18, cancel: 0.05 };
    }
  }

  private buildSchedule(startsAt: Date, now: Date): {
    openAt: Date;
    lockAt: Date;
    closeAt: Date;
    freezeStart: Date;
    freezeEnd: Date;
  } {
    const twoDaysMs = 48 * 60 * 60 * 1000;
    const openDesired = new Date(startsAt.getTime() - twoDaysMs);
    const openAt = openDesired <= now ? new Date(now.getTime() + 5 * 60 * 1000) : openDesired;
    const lockAt = new Date(startsAt.getTime() - 10 * 60 * 1000);
    const closeAt = new Date(startsAt.getTime() - 60 * 1000);
    const freezeStart = new Date(startsAt);
    const freezeEnd = new Date(freezeStart.getTime() + this.scheduleDisputeHours() * 60 * 60 * 1000);

    return {
      openAt,
      lockAt,
      closeAt,
      freezeStart,
      freezeEnd,
    };
  }

  private scheduleDisputeHours(): number {
    return 6;
  }

  private extractTeams(event: SportsDataEvent): { home: string; away: string } | null {
    const metadata = event.metadata ?? {};
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const home = this.normalizeTeam((metadata as Record<string, unknown>).homeTeam);
      const away = this.normalizeTeam((metadata as Record<string, unknown>).awayTeam);
      if (home && away && home !== "Unknown" && away !== "Unknown") {
        return { home, away };
      }
    }

    const headline = event.headline ?? null;
    if (headline) {
      const parts = headline.split(/vs\.?|@|v\.?/i).map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const [rawHome, rawAway] = parts;
        const home = this.normalizeTeam(rawHome);
        const away = this.normalizeTeam(rawAway);
        if (home !== "Unknown" && away !== "Unknown") {
          return { home, away };
        }
      }
    }

    return null;
  }

  private normalizeTeam(value: unknown): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return "Unknown";
  }

  private normalizeTeamForMatch(value: string): string {
    return value
      .toLowerCase()
      .replace(/football club|fc|cf|club deportivo|club de futbol|hockey club/gi, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private slugifyTeam(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private buildMarketSlug(leagueSlug: string, eventId: string): string {
    return `sports-${leagueSlug}-${eventId}`;
  }

  private isWithinWindow(startsAt: string | undefined, now: Date, limit: Date): boolean {
    if (!startsAt) {
      return false;
    }
    const date = new Date(startsAt);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return date >= now && date <= limit;
  }

  private compareDateStrings(a?: string, b?: string): number {
    const timeA = a ? Date.parse(a) : NaN;
    const timeB = b ? Date.parse(b) : NaN;
    if (Number.isNaN(timeA) && Number.isNaN(timeB)) {
      return 0;
    }
    if (Number.isNaN(timeA)) {
      return 1;
    }
    if (Number.isNaN(timeB)) {
      return -1;
    }
    return timeA - timeB;
  }

  private toLowerString(value: unknown): string {
    return typeof value === "string" ? value.toLowerCase() : "";
  }
}
