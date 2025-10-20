export interface CryptoSourceQuoteDto {
  source: string;
  priceUsd: number;
  observedAt: string;
}

export interface CryptoQuoteDto {
  assetSymbol: string;
  priceUsd: number;
  signature: string;
  publishedAt: string;
  publishedBy: string | null;
  sources: CryptoSourceQuoteDto[];
}
