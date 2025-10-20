export interface PublishCryptoQuoteRequestDto {
  assetSymbol: string;
  sources?: Array<"coingecko" | "binance" | "manual">;
  priceOverride?: number;
}

export interface PublishCryptoQuoteResponseDto {
  assetSymbol: string;
  priceUsd: number;
  signature: string;
  publishedAt: string;
  publishedBy: string | null;
  sources: Array<{ source: string; priceUsd: number; observedAt: string }>;
}
