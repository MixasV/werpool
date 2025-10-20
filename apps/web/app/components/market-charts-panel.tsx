'use client';

import { useState, useEffect, useMemo } from 'react';
import { MarketPriceChart, type PriceDataPoint } from './market-price-chart';
import { MarketVolumeChart, type VolumeDataPoint } from './market-volume-chart';
import { MarketProbabilityChart, type ProbabilityDataPoint } from './market-probability-chart';

export interface MarketChartsPanelProps {
  marketId: string;
  outcomes: Array<{ label: string; index: number }>;
  analyticsData?: any[]; // From MarketAnalyticsSnapshot
  className?: string;
}

type ChartType = 'price' | 'probability' | 'volume';
type Timeframe = '1h' | '24h' | '7d' | '30d' | 'all';

export function MarketChartsPanel({
  marketId,
  outcomes,
  analyticsData = [],
  className,
}: MarketChartsPanelProps) {
  const [activeChart, setActiveChart] = useState<ChartType>('price');
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');

  // Transform analytics data for charts
  const { priceData, volumeData, probabilityData } = useMemo(() => {
    if (!analyticsData || analyticsData.length === 0) {
      return { priceData: [], volumeData: [], probabilityData: [] };
    }

    const now = Date.now();
    const timeframeMs: Record<Timeframe, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': Infinity,
    };

    const cutoff = now - timeframeMs[timeframe];

    const filteredData = analyticsData.filter((snapshot) => {
      const timestamp = new Date(snapshot.snapshotAt).getTime();
      return timestamp >= cutoff;
    });

    // Price data
    const priceDataPoints: PriceDataPoint[] = [];
    filteredData.forEach((snapshot) => {
      const timestamp = new Date(snapshot.snapshotAt).getTime();
      const probabilities = snapshot.probabilities || [];
      
      probabilities.forEach((prob: number, index: number) => {
        priceDataPoints.push({
          timestamp,
          outcomeIndex: index,
          price: prob,
          probability: prob,
        });
      });
    });

    // Volume data (aggregated by hour or day depending on timeframe)
    const volumeMap = new Map<number, { volume: number; trades: number }>();
    const bucketSize = timeframe === '1h' || timeframe === '24h' 
      ? 60 * 60 * 1000 // 1 hour
      : 24 * 60 * 60 * 1000; // 1 day

    filteredData.forEach((snapshot) => {
      const timestamp = new Date(snapshot.snapshotAt).getTime();
      const bucket = Math.floor(timestamp / bucketSize) * bucketSize;
      
      const volume = parseFloat(snapshot.totalVolume || '0');
      const existing = volumeMap.get(bucket) || { volume: 0, trades: 0 };
      
      volumeMap.set(bucket, {
        volume: Math.max(existing.volume, volume), // Take max as snapshots are cumulative
        trades: existing.trades + 1,
      });
    });

    const volumeDataPoints: VolumeDataPoint[] = Array.from(volumeMap.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        volume: data.volume,
        trades: data.trades,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Calculate delta volumes
    for (let i = volumeDataPoints.length - 1; i > 0; i--) {
      volumeDataPoints[i].volume -= volumeDataPoints[i - 1].volume;
    }

    // Probability data
    const probabilityDataPoints: ProbabilityDataPoint[] = filteredData.map((snapshot) => ({
      timestamp: new Date(snapshot.snapshotAt).getTime(),
      probabilities: snapshot.probabilities || [],
    }));

    return {
      priceData: priceDataPoints,
      volumeData: volumeDataPoints,
      probabilityData: probabilityDataPoints,
    };
  }, [analyticsData, timeframe]);

  return (
    <div className={`market-charts-panel ${className || ''}`}>
      <div className="charts-header">
        <div className="chart-type-selector">
          <button
            type="button"
            className={`chart-type-button ${activeChart === 'price' ? 'active' : ''}`}
            onClick={() => setActiveChart('price')}
          >
            Price
          </button>
          <button
            type="button"
            className={`chart-type-button ${activeChart === 'probability' ? 'active' : ''}`}
            onClick={() => setActiveChart('probability')}
          >
            Probability
          </button>
          <button
            type="button"
            className={`chart-type-button ${activeChart === 'volume' ? 'active' : ''}`}
            onClick={() => setActiveChart('volume')}
          >
            Volume
          </button>
        </div>

        <div className="timeframe-selector">
          {(['1h', '24h', '7d', '30d', 'all'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              className={`timeframe-button ${timeframe === tf ? 'active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-container">
        {activeChart === 'price' && (
          <MarketPriceChart
            data={priceData}
            outcomes={outcomes}
            timeframe={timeframe}
          />
        )}
        {activeChart === 'probability' && (
          <MarketProbabilityChart
            data={probabilityData}
            outcomes={outcomes}
            timeframe={timeframe}
          />
        )}
        {activeChart === 'volume' && (
          <MarketVolumeChart
            data={volumeData}
            timeframe={timeframe}
          />
        )}
      </div>
    </div>
  );
}
