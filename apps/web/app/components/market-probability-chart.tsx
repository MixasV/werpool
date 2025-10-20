'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface ProbabilityDataPoint {
  timestamp: number;
  probabilities: number[];
}

export interface MarketProbabilityChartProps {
  data: ProbabilityDataPoint[];
  outcomes: Array<{ label: string; index: number }>;
  timeframe: '1h' | '24h' | '7d' | '30d' | 'all';
  className?: string;
}

const OUTCOME_COLORS = [
  '#10b981', // green for YES/outcome 0
  '#ef4444', // red for NO/outcome 1
  '#3b82f6', // blue for outcome 2
  '#f59e0b', // amber for outcome 3
  '#8b5cf6', // purple for outcome 4
];

export function MarketProbabilityChart({
  data,
  outcomes,
  timeframe,
  className,
}: MarketProbabilityChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Transform data to have outcome probabilities as separate keys
    return data
      .map((point) => {
        const transformedPoint: any = { timestamp: point.timestamp };
        point.probabilities.forEach((prob, index) => {
          transformedPoint[`outcome${index}`] = prob;
        });
        return transformedPoint;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);

    switch (timeframe) {
      case '1h':
      case '24h':
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      case '7d':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case '30d':
      case 'all':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleString();
    }
  };

  const formatProbability = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`market-chart-empty ${className || ''}`}>
        <p>No probability data available</p>
        <span className="chart-empty-icon">📊</span>
      </div>
    );
  }

  return (
    <div className={`market-probability-chart ${className || ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          stackOffset="expand"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestamp}
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '0.75rem' }}
          />
          <YAxis
            tickFormatter={formatProbability}
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '0.75rem' }}
          />
          <Tooltip
            formatter={(value: number) => formatProbability(value)}
            labelFormatter={formatTimestamp}
            contentStyle={{
              backgroundColor: '#151b28',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
            }}
          />
          {outcomes.map((outcome) => (
            <Area
              key={outcome.index}
              type="monotone"
              dataKey={`outcome${outcome.index}`}
              name={outcome.label}
              stackId="1"
              stroke={OUTCOME_COLORS[outcome.index % OUTCOME_COLORS.length]}
              fill={OUTCOME_COLORS[outcome.index % OUTCOME_COLORS.length]}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
