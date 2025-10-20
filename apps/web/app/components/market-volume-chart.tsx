'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';

export interface VolumeDataPoint {
  timestamp: number;
  volume: number;
  trades: number;
}

export interface MarketVolumeChartProps {
  data: VolumeDataPoint[];
  timeframe: '1h' | '24h' | '7d' | '30d' | 'all';
  className?: string;
}

export function MarketVolumeChart({ data, timeframe, className }: MarketVolumeChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    return data
      .map((point) => ({
        ...point,
        cumulativeVolume: 0, // Will be calculated below
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((point, index, array) => ({
        ...point,
        cumulativeVolume:
          index === 0 ? point.volume : array[index - 1].cumulativeVolume + point.volume,
      }));
  }, [data]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);

    switch (timeframe) {
      case '1h':
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      case '24h':
        return date.toLocaleTimeString('en-US', { hour: '2-digit' });
      case '7d':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case '30d':
      case 'all':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleString();
    }
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(2);
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`market-chart-empty ${className || ''}`}>
        <p>No volume data available</p>
        <span className="chart-empty-icon">📊</span>
      </div>
    );
  }

  return (
    <div className={`market-volume-chart ${className || ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestamp}
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '0.75rem' }}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatVolume}
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '0.75rem' }}
            label={{ value: 'Volume (FLOW)', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatVolume}
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '0.75rem' }}
            label={{ value: 'Cumulative', angle: 90, position: 'insideRight' }}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'volume') {
                return [`${formatVolume(value)} FLOW`, 'Volume'];
              }
              if (name === 'cumulativeVolume') {
                return [`${formatVolume(value)} FLOW`, 'Cumulative'];
              }
              return [value, name];
            }}
            labelFormatter={formatTimestamp}
            contentStyle={{
              backgroundColor: '#151b28',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="volume"
            name="Volume"
            fill="#3b82f6"
            opacity={0.8}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulativeVolume"
            name="Cumulative Volume"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
