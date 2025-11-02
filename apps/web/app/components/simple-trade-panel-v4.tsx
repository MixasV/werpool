'use client';

import { useState, useEffect } from 'react';

interface SimpleTradePanelV4Props {
  marketId: number;
  outcomes: Array<{
    index: number;
    label: string;
    impliedProbability: number;
  }>;
  userAddress?: string;
  onTradeComplete?: () => void;
}

interface Prices {
  buyPrice: number;
  sellPrice: number;
  spread: number;
  currentProbability: number;
}

export function SimpleTradePanelV4({ 
  marketId, 
  outcomes, 
  userAddress,
  onTradeComplete 
}: SimpleTradePanelV4Props) {
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [amount, setAmount] = useState('');
  const [isBuying, setIsBuying] = useState(true);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (outcomes.length > 0) {
      fetchPrices();
    }
  }, [selectedOutcome, marketId]);

  const fetchPrices = async () => {
    try {
      const response = await fetch(`/api/v4/polymarket/prices/${marketId}/${selectedOutcome}`);
      if (!response.ok) {
        setPrices({
          buyPrice: outcomes[selectedOutcome]?.impliedProbability || 0.5,
          sellPrice: outcomes[selectedOutcome]?.impliedProbability || 0.5,
          spread: 0.05,
          currentProbability: outcomes[selectedOutcome]?.impliedProbability || 0.5,
        });
        return;
      }
      const data = await response.json();
      setPrices(data);
    } catch (err) {
      console.error('Failed to fetch prices:', err);
      setPrices({
        buyPrice: outcomes[selectedOutcome]?.impliedProbability || 0.5,
        sellPrice: outcomes[selectedOutcome]?.impliedProbability || 0.5,
        spread: 0.05,
        currentProbability: outcomes[selectedOutcome]?.impliedProbability || 0.5,
      });
    }
  };

  const handleTrade = async () => {
    if (!userAddress) {
      setError('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const endpoint = isBuying ? '/api/v4/polymarket/buy-outcome' : '/api/v4/polymarket/sell-outcome';
      const payload = isBuying
        ? {
            marketId,
            userAddress,
            outcomeIndex: selectedOutcome,
            collateralAmount: parseFloat(amount),
            maxSlippage: 0.05,
          }
        : {
            marketId,
            userAddress,
            outcomeIndex: selectedOutcome,
            sharesAmount: parseFloat(amount),
            maxSlippage: 0.05,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Trade failed');
      }

      const result = await response.json();
      setSuccess(`Trade successful! TX: ${result.txId?.substring(0, 8)}...`);
      setAmount('');
      
      setTimeout(() => {
        fetchPrices();
        onTradeComplete?.();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  if (!prices) {
    return <div className="p-4 text-gray-400">Loading prices...</div>;
  }

  const selectedOutcomeData = outcomes[selectedOutcome];
  const estimatedCost = isBuying 
    ? parseFloat(amount || '0') * prices.buyPrice
    : parseFloat(amount || '0') * prices.sellPrice;

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Trade V4 Market</h3>

      {/* Outcome Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Select Outcome</label>
        <div className="flex gap-2">
          {outcomes.map((outcome, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedOutcome(idx)}
              className={`flex-1 px-4 py-2 rounded ${
                selectedOutcome === idx
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {outcome.label}
              <span className="block text-xs opacity-75">
                {(outcome.impliedProbability * 100).toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Buy/Sell Toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Action</label>
        <div className="flex gap-2">
          <button
            onClick={() => setIsBuying(true)}
            className={`flex-1 px-4 py-2 rounded ${
              isBuying ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setIsBuying(false)}
            className={`flex-1 px-4 py-2 rounded ${
              !isBuying ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            Sell
          </button>
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Amount ({isBuying ? 'FLOW' : 'Shares'})
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Price Info */}
      <div className="bg-gray-700 rounded p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Current Price:</span>
          <span className="text-white">{prices.currentProbability.toFixed(3)} FLOW</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">{isBuying ? 'Buy' : 'Sell'} Price:</span>
          <span className="text-white">
            {(isBuying ? prices.buyPrice : prices.sellPrice).toFixed(3)} FLOW
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Spread:</span>
          <span className="text-white">{(prices.spread * 100).toFixed(2)}%</span>
        </div>
        {amount && (
          <div className="flex justify-between border-t border-gray-600 pt-1 mt-2">
            <span className="text-gray-400 font-medium">Estimated Cost:</span>
            <span className="text-white font-medium">{estimatedCost.toFixed(3)} FLOW</span>
          </div>
        )}
      </div>

      {/* Execute Button */}
      <button
        onClick={handleTrade}
        disabled={loading || !userAddress || !amount}
        className={`w-full py-3 rounded font-medium ${
          loading || !userAddress || !amount
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : isBuying
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
      >
        {loading ? 'Processing...' : !userAddress ? 'Connect Wallet' : `${isBuying ? 'Buy' : 'Sell'} ${selectedOutcomeData?.label}`}
      </button>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-2 rounded">
          {success}
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-400 text-center">
        Polymarket V4 • Order Book Trading • 1:1 Settlement
      </div>
    </div>
  );
}
