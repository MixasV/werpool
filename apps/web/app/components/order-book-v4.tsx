'use client';

import { useState, useEffect } from 'react';

interface Order {
  id: number;
  price: number;
  size: number;
  maker: string;
}

interface OrderBookV4Props {
  marketId: number;
  outcomeIndex: number;
  outcomeName: string;
}

export function OrderBookV4({ marketId, outcomeIndex, outcomeName }: OrderBookV4Props) {
  const [buyOrders, setBuyOrders] = useState<Order[]>([]);
  const [sellOrders, setSellOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, [marketId, outcomeIndex]);

  const fetchOrderBook = async () => {
    try {
      const response = await fetch(`/api/v4/polymarket/orderbook/${marketId}/${outcomeIndex}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch order book');
      }

      const data = await response.json();
      setBuyOrders(data.buy || []);
      setSellOrders(data.sell || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch order book:', err);
      setError(err.message);
      setBuyOrders([]);
      setSellOrders([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Order Book - {outcomeName}</h3>
        <div className="text-gray-400 text-center py-8">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Order Book - {outcomeName}</h3>
        <div className="text-red-400 text-center py-8">{error}</div>
      </div>
    );
  }

  const hasBuyOrders = buyOrders.length > 0;
  const hasSellOrders = sellOrders.length > 0;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-bold text-white mb-4">Order Book - {outcomeName}</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Buy Orders (Bids) */}
        <div>
          <h4 className="text-sm font-medium text-green-400 mb-2">Buy Orders (Bids)</h4>
          <div className="bg-gray-900 rounded overflow-hidden">
            <div className="grid grid-cols-2 gap-2 px-3 py-2 bg-gray-700 text-xs text-gray-400 font-medium">
              <div>Price</div>
              <div className="text-right">Size</div>
            </div>
            <div className="divide-y divide-gray-700">
              {hasBuyOrders ? (
                buyOrders.slice(0, 10).map((order, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm hover:bg-gray-800">
                    <div className="text-green-400 font-medium">{order.price.toFixed(3)}</div>
                    <div className="text-gray-300 text-right">{order.size.toFixed(2)}</div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">No buy orders</div>
              )}
            </div>
          </div>
        </div>

        {/* Sell Orders (Asks) */}
        <div>
          <h4 className="text-sm font-medium text-red-400 mb-2">Sell Orders (Asks)</h4>
          <div className="bg-gray-900 rounded overflow-hidden">
            <div className="grid grid-cols-2 gap-2 px-3 py-2 bg-gray-700 text-xs text-gray-400 font-medium">
              <div>Price</div>
              <div className="text-right">Size</div>
            </div>
            <div className="divide-y divide-gray-700">
              {hasSellOrders ? (
                sellOrders.slice(0, 10).map((order, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm hover:bg-gray-800">
                    <div className="text-red-400 font-medium">{order.price.toFixed(3)}</div>
                    <div className="text-gray-300 text-right">{order.size.toFixed(2)}</div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">No sell orders</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-400 flex justify-between">
        <div>Total Buy Orders: {buyOrders.length}</div>
        <div>Total Sell Orders: {sellOrders.length}</div>
        <div className="text-gray-500">Auto-refresh: 5s</div>
      </div>
    </div>
  );
}
