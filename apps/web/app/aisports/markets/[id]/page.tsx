"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Market {
  id: string;
  title: string;
  description: string;
  yesPrice: number;
  noPrice: number;
  tradeVolume: number;
  tradeCount: number;
  isResolved: boolean;
  outcome?: string;
  currentData: {
    value: number;
    timeRemaining: string;
  };
}

interface Trade {
  id: string;
  outcome: string;
  shares: number;
  flowAmount: number;
  price: number;
  createdAt: string;
  txId?: string;
  txStatus?: string;
}

function TradePanel({ market, onTradeSuccess }: { market: Market; onTradeSuccess: () => void }) {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [shares, setShares] = useState(10);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      if (shares <= 0) return;
      
      setLoading(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/meta/${market.id}/quote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome, shares }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          setQuote(data);
        }
      } catch (err) {
        console.error('Failed to fetch quote:', err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchQuote, 300);
    return () => clearTimeout(timer);
  }, [market.id, outcome, shares]);

  const handleTrade = async () => {
    setExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/meta/${market.id}/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome, shares, signer: '0xdemo' }),
        }
      );

      if (!res.ok) {
        throw new Error('Trade execution failed');
      }

      const result = await res.json();
      setSuccess(`Trade executed! TX: ${result.txResult?.txId?.slice(0, 10)}...`);
      onTradeSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Place Trade</h3>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
          Outcome
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOutcome('YES')}
            className={`p-3 rounded-lg font-semibold transition-colors ${
              outcome === 'YES'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            YES
          </button>
          <button
            onClick={() => setOutcome('NO')}
            className={`p-3 rounded-lg font-semibold transition-colors ${
              outcome === 'NO'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            NO
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
          Shares
        </label>
        <input
          type="number"
          value={shares}
          onChange={(e) => setShares(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          min="1"
        />
      </div>

      {quote && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Cost:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {quote.flowAmount.toFixed(4)} FLOW
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Price:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {quote.price.toFixed(4)} FLOW/share
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">New YES prob:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {(quote.probabilities[0] * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-300">
          {success}
        </div>
      )}

      <button
        onClick={handleTrade}
        disabled={loading || executing || !quote || market.isResolved}
        className="w-full p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
      >
        {executing ? 'Executing...' : market.isResolved ? 'Market Resolved' : 'Execute Trade'}
      </button>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
        🎮 Demo mode: Transactions are simulated
      </p>
    </div>
  );
}

function TradeHistory({ marketId }: { marketId: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    fetchTrades();
  }, [marketId]);

  const fetchTrades = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/meta/${marketId}/trades`
      );
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
      }
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Recent Trades</h3>
      
      {trades.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No trades yet</p>
      ) : (
        <div className="space-y-3">
          {trades.slice(0, 10).map((trade) => (
            <div key={trade.id} className="flex items-center justify-between text-sm p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${
                  trade.outcome === 'YES' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.outcome}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {trade.shares} shares @ {trade.price.toFixed(4)}
                </span>
              </div>
              {trade.txId && (
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {trade.txId.slice(0, 8)}...
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketDetailPage() {
  const params = useParams();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarket();
  }, [params.id]);

  const fetchMarket = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/meta/${params.id}`
      );
      if (res.ok) {
        const data = await res.json();
        setMarket(data);
      }
    } catch (err) {
      console.error('Failed to fetch market:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Market not found</p>
          <Link href="/aisports" className="text-blue-600 hover:underline">
            Back to Markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <Link href="/aisports" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Markets
        </Link>
        
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">
          {market.title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {market.description}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">YES Price</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {(market.yesPrice * 100).toFixed(1)}¢
              </div>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">NO Price</div>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                {(market.noPrice * 100).toFixed(1)}¢
              </div>
            </div>
          </div>

          <TradeHistory marketId={market.id} />
        </div>

        <div>
          <TradePanel market={market} onTradeSuccess={fetchMarket} />
        </div>
      </div>
    </div>
  );
}
