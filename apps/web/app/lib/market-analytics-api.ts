import { API_BASE_URL, DEFAULT_HEADERS, parseJson } from './api-client';

export interface MarketAnalyticsSnapshot {
  id: string;
  marketId: string;
  outcomeId: string | null;
  outcomeIndex: number;
  outcomeLabel: string;
  interval: 'hour' | 'day';
  bucketStart: string;
  bucketEnd: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  averagePrice: number;
  volumeShares: number;
  volumeFlow: number;
  netFlow: number;
  tradeCount: number;
  updatedAt: string;
}

export interface FetchAnalyticsOptions {
  interval?: 'hour' | 'day';
  outcomeIndex?: number;
  from?: string;
  to?: string;
  limit?: number;
}

export const fetchMarketAnalytics = async (
  idOrSlug: string,
  options?: FetchAnalyticsOptions
): Promise<MarketAnalyticsSnapshot[]> => {
  const params = new URLSearchParams();

  if (options?.interval) {
    params.append('interval', options.interval);
  }
  if (options?.outcomeIndex !== undefined) {
    params.append('outcomeIndex', options.outcomeIndex.toString());
  }
  if (options?.from) {
    params.append('from', options.from);
  }
  if (options?.to) {
    params.append('to', options.to);
  }
  if (options?.limit) {
    params.append('limit', options.limit.toString());
  }

  const encodedId = encodeURIComponent(idOrSlug);
  const queryString = params.toString();
  const url = `${API_BASE_URL}/markets/${encodedId}/analytics${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch analytics: ${response.statusText}`);
  }

  return parseJson<MarketAnalyticsSnapshot[]>(response);
};
