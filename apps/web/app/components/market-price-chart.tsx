'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface PriceDataPoint {
  timestamp: number;
  outcomeIndex: number;
  price: number;
  probability: number;
}

export interface MarketPriceChartProps {
  data: PriceDataPoint[];
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

export function MarketPriceChart({ data, outcomes, timeframe, className }: MarketPriceChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Group data points by timestamp
    const groupedByTime = data.reduce((acc, point) => {
      const timeKey = point.timestamp;
      if (!acc[timeKey]) {
        acc[timeKey] = { timestamp: timeKey };
      }
      acc[timeKey][`outcome${point.outcomeIndex}`] = point.price;
      return acc;
    }, {} as Record<number, any>);

    // Convert to array and sort by timestamp
    return Object.values(groupedByTime).sort((a, b) => a.timestamp - b.timestamp);
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

  const formatPrice = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`market-chart-empty ${className || ''}`}>
        <p>No price data available</p>
        <span className="chart-empty-icon">📊</span>
      </div>
    );
  }

  return (
    <div className={`market-price-chart ${className || ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
            domain={[0, 1]}
            tickFormatter={formatPrice}
            stroke="rgba(255, 255, 255, 0.5)"
            style={{ fontSize: '0.75rem' }}
          />
          <Tooltip
            formatter={(value: number) => formatPrice(value)}
            labelFormatter={formatTimestamp}
            contentStyle={{
              backgroundColor: '#151b28',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
            }}
          />
          <Legend />
          {outcomes.map((outcome) => (
            <Line
              key={outcome.index}
              type="monotone"
              dataKey={`outcome${outcome.index}`}
              name={outcome.label}
              stroke={OUTCOME_COLORS[outcome.index % OUTCOME_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
