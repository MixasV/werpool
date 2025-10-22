import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { OracleSnapshot } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  CryptoQuoteDto,
  CryptoSourceQuoteDto,
} from "./dto/crypto-quote.dto";
import { PublishCryptoQuoteRequestDto } from "./dto/publish-crypto.dto";
import { signOraclePayload } from "./signing.util";
import { serializeJson } from "../common/prisma-json.util";

type PublishParams = PublishCryptoQuoteRequestDto & {
  publishedBy?: string | null;
};

interface SourceQuote {
  source: string;
  priceUsd: number;
  observedAt: string;
}

@Injectable()
export class CryptoOracleService {
  private readonly logger = new Logger(CryptoOracleService.name);
  private readonly signingKey: string;
  private readonly defaultSources: Array<"coingecko" | "binance"> = [
    "coingecko",
    "binance",
  ];

  constructor(private readonly prisma: PrismaService) {
    this.signingKey = this.resolveSigningKey();
  }

  async publishQuote(params: PublishParams): Promise<CryptoQuoteDto> {
    const assetSymbol = this.normalizeSymbol(params.assetSymbol);
    const requestedSources =
      Array.isArray(params.sources) && params.sources.length > 0
        ? params.sources
        : this.defaultSources;

    const validSources = requestedSources.filter(
      (s): s is "coingecko" | "binance" => s === "coingecko" || s === "binance"
    );

    const collected = await this.collectSourceQuotes(assetSymbol, validSources);

    if (params.priceOverride !== undefined && Number.isFinite(params.priceOverride)) {
      collected.unshift({
        source: "manual",
        priceUsd: Number(params.priceOverride),
        observedAt: new Date().toISOString(),
      });
    }

    if (collected.length === 0) {
      const fallback = this.getFallbackPrice(assetSymbol);
      if (fallback !== null) {
        collected.push({
          source: "fallback",
          priceUsd: fallback,
          observedAt: new Date().toISOString(),
        });
      }
    }

    if (collected.length === 0) {
      throw new ServiceUnavailableException(
        `No quotes available for ${assetSymbol}; check sources or provide priceOverride`
      );
    }

    const aggregatedPrice = this.computeAveragePrice(collected);

    return this.persistSnapshot({
      assetSymbol,
      priceUsd: aggregatedPrice,
      observedAt: new Date(),
      sources: collected,
      sourceTag: "aggregated",
      publishedBy: params.publishedBy ?? null,
    });
  }

  async getLatestQuote(assetSymbol: string): Promise<CryptoQuoteDto | null> {
    const normalized = this.normalizeSymbol(assetSymbol);
    const snapshot = await this.prisma.oracleSnapshot.findFirst({
      where: {
        type: "CRYPTO",
        assetSymbol: normalized,
      },
      orderBy: { createdAt: "desc" },
    });

    return snapshot ? this.toDto(snapshot) : null;
  }

  async listQuotes(assetSymbol: string, limit = 25): Promise<CryptoQuoteDto[]> {
    const normalized = this.normalizeSymbol(assetSymbol);
    const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 25;
    const snapshots = await this.prisma.oracleSnapshot.findMany({
      where: {
        type: "CRYPTO",
        assetSymbol: normalized,
      },
      orderBy: { createdAt: "desc" },
      take: sanitizedLimit,
    });

    return snapshots.map((snapshot) => this.toDto(snapshot));
  }

  async getAggregatedPrice(
    assetSymbol: string,
    options: {
      sources?: Array<"coingecko" | "binance">;
      allowFallback?: boolean;
    } = {}
  ): Promise<{ priceUsd: number; sources: SourceQuote[] }> {
    const normalized = this.normalizeSymbol(assetSymbol);
    const requestedSources =
      options.sources && options.sources.length > 0 ? options.sources : this.defaultSources;

    const collected = await this.collectSourceQuotes(normalized, requestedSources);

    if (collected.length === 0) {
      if (options.allowFallback) {
        const fallback = this.getFallbackPrice(normalized);
        if (fallback !== null) {
          const observedAt = new Date().toISOString();
          return {
            priceUsd: fallback,
            sources: [
              {
                source: "fallback",
                priceUsd: fallback,
                observedAt,
              },
            ],
          };
        }
      }
      throw new ServiceUnavailableException(`No price data for ${normalized}`);
    }

    return {
      priceUsd: this.computeAveragePrice(collected),
      sources: collected,
    };
  }

  async publishComputedQuote(params: {
    assetSymbol: string;
    priceUsd: number;
    observedAt?: Date;
    sourceTag?: string;
    metadata?: Record<string, unknown>;
    publishedBy?: string | null;
  }): Promise<CryptoQuoteDto> {
    const assetSymbol = this.normalizeSymbol(params.assetSymbol);
    const observedAt = params.observedAt ?? new Date();
    const price = Number(params.priceUsd);
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException("priceUsd must be a positive number");
    }

    const sources: SourceQuote[] = [
      {
        source: params.sourceTag ?? "automation",
        priceUsd: price,
        observedAt: observedAt.toISOString(),
      },
    ];

    return this.persistSnapshot({
      assetSymbol,
      priceUsd: price,
      observedAt,
      sources,
      sourceTag: params.sourceTag ?? "automation",
      metadata: params.metadata,
      publishedBy: params.publishedBy ?? null,
    });
  }

  private async fetchSourcePrice(
    source: "coingecko" | "binance" | "manual",
    assetSymbol: string
  ): Promise<SourceQuote | null> {
    switch (source) {
      case "coingecko": {
        const price = await this.fetchCoinGeckoPrice(assetSymbol);
        return price
          ? { source: "coingecko", priceUsd: price, observedAt: new Date().toISOString() }
          : null;
      }
      case "binance": {
        const price = await this.fetchBinancePrice(assetSymbol);
        return price
          ? { source: "binance", priceUsd: price, observedAt: new Date().toISOString() }
          : null;
      }
      default:
        return null;
    }
  }

  private async fetchCoinGeckoPrice(assetSymbol: string): Promise<number | null> {
    const coinId = this.resolveCoinGeckoId(assetSymbol);
    if (!coinId) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Record<string, { usd?: number }>;
      const value = payload[coinId]?.usd;
      return typeof value === "number" ? value : null;
    } catch (error) {
        this.logger.warn(
          `CoinGecko returned an error for ${assetSymbol}: ${(error as Error).message}`
        );
      return null;
    }
  }

  private async fetchBinancePrice(assetSymbol: string): Promise<number | null> {
    const symbol = `${assetSymbol.toUpperCase()}USDT`;
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { price?: string };
      const price = payload.price ? Number(payload.price) : null;
      return price && Number.isFinite(price) ? price : null;
    } catch (error) {
        this.logger.warn(
          `Binance returned an error for ${assetSymbol}: ${(error as Error).message}`
        );
      return null;
    }
  }

  private async collectSourceQuotes(
    assetSymbol: string,
    requestedSources: Array<"coingecko" | "binance">
  ): Promise<SourceQuote[]> {
    const collected: SourceQuote[] = [];

    for (const source of requestedSources) {
      try {
        const quote = await this.fetchSourcePrice(source, assetSymbol);
        if (quote) {
          collected.push(quote);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch quote for ${assetSymbol} from ${source}: ${(error as Error).message}`
        );
      }
    }

    return collected;
  }

  private computeAveragePrice(collected: SourceQuote[]): number {
    if (collected.length === 0) {
      throw new BadRequestException("Cannot compute average price from an empty set of quotes");
    }
    const sum = collected.reduce((acc, current) => acc + current.priceUsd, 0);
    return sum / collected.length;
  }

  private async persistSnapshot(params: {
    assetSymbol: string;
    priceUsd: number;
    observedAt: Date;
    sources: SourceQuote[];
    sourceTag: string;
    metadata?: Record<string, unknown>;
    publishedBy?: string | null;
  }): Promise<CryptoQuoteDto> {
    const payload = serializeJson({
      type: "crypto.quote",
      assetSymbol: params.assetSymbol,
      priceUsd: params.priceUsd,
      timestamp: params.observedAt.toISOString(),
      sources: params.sources,
      metadata: params.metadata ?? undefined,
    });

    const signature = signOraclePayload(payload, this.signingKey);

    const snapshot = await this.prisma.oracleSnapshot.create({
      data: {
        type: "CRYPTO",
        source: params.sourceTag,
        assetSymbol: params.assetSymbol,
        payload,
        signature,
        publishedBy: params.publishedBy ?? null,
      },
    });

    return this.toDto(snapshot);
  }

  private resolveCoinGeckoId(assetSymbol: string): string | null {
    const symbol = assetSymbol.toUpperCase();
    switch (symbol) {
      case "FLOW":
        return "flow";
      case "BTC":
        return "bitcoin";
      case "ETH":
        return "ethereum";
      case "USDC":
        return "usd-coin";
      default:
        return null;
    }
  }

  private getFallbackPrice(assetSymbol: string): number | null {
    const symbol = assetSymbol.toUpperCase();
    switch (symbol) {
      case "FLOW":
        return 0.45;
      case "BTC":
        return 65000;
      case "ETH":
        return 3400;
      case "USDC":
        return 1;
      default:
        return null;
    }
  }

  private toDto(snapshot: OracleSnapshot): CryptoQuoteDto {
    const payload = this.parsePayload(snapshot.payload);
    const assetSymbol = (payload.assetSymbol as string | undefined) ?? snapshot.assetSymbol ?? "";
    const priceUsd = Number(payload.priceUsd ?? 0);
    const sourcesRaw = Array.isArray(payload.sources) ? payload.sources : [];
    const sources: CryptoSourceQuoteDto[] = sourcesRaw
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const price = Number(record.priceUsd);
        if (!Number.isFinite(price)) {
          return null;
        }
        const source = typeof record.source === "string" ? record.source : "unknown";
        const observedAt =
          typeof record.observedAt === "string" ? record.observedAt : snapshot.createdAt.toISOString();
        return {
          source,
          priceUsd: price,
          observedAt,
        } satisfies CryptoSourceQuoteDto;
      })
      .filter((entry): entry is CryptoSourceQuoteDto => entry !== null);

    return {
      assetSymbol,
      priceUsd,
      signature: snapshot.signature,
      publishedAt: snapshot.createdAt.toISOString(),
      publishedBy: snapshot.publishedBy ?? null,
      sources,
    } satisfies CryptoQuoteDto;
  }

  private parsePayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {};
    }
    return payload as Record<string, unknown>;
  }

  private normalizeSymbol(value: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ServiceUnavailableException("assetSymbol is required");
    }
    return value.trim().toUpperCase();
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
