import {
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
  private readonly signingKey = process.env.ORACLE_SIGNING_KEY ?? "dev-secret";
  private readonly defaultSources: Array<"coingecko" | "binance"> = [
    "coingecko",
    "binance",
  ];

  constructor(private readonly prisma: PrismaService) {}

  async publishQuote(params: PublishParams): Promise<CryptoQuoteDto> {
    const assetSymbol = this.normalizeSymbol(params.assetSymbol);
    const requestedSources = Array.isArray(params.sources) && params.sources.length > 0
      ? params.sources
      : this.defaultSources;

    const collected: SourceQuote[] = [];
    for (const source of requestedSources) {
      try {
        const quote = await this.fetchSourcePrice(source, assetSymbol);
        if (quote) {
          collected.push(quote);
        }
      } catch (error) {
        this.logger.warn(
          `Не удалось получить котировку ${assetSymbol} из ${source}: ${(error as Error).message}`
        );
      }
    }

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
        `Нет доступных котировок для ${assetSymbol}; проверьте источники или укажите priceOverride`
      );
    }

    const aggregatedPrice =
      collected.reduce((sum, entry) => sum + entry.priceUsd, 0) / collected.length;

    const timestamp = new Date().toISOString();
    const payload = {
      type: "crypto.quote",
      assetSymbol,
      priceUsd: aggregatedPrice,
      timestamp,
      sources: collected,
    };

    const signature = signOraclePayload(payload, this.signingKey);

    const snapshot = await this.prisma.oracleSnapshot.create({
      data: {
        type: "CRYPTO",
        source: "aggregated",
        assetSymbol,
        payload,
        signature,
        publishedBy: params.publishedBy ?? null,
      },
    });

    return this.toDto(snapshot);
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
        `CoinGecko вернул ошибку для ${assetSymbol}: ${(error as Error).message}`
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
        `Binance вернул ошибку для ${assetSymbol}: ${(error as Error).message}`
      );
      return null;
    }
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
      throw new ServiceUnavailableException("assetSymbol обязателен");
    }
    return value.trim().toUpperCase();
  }
}
