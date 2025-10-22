import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "aiSports Markets | Forte Prediction Markets",
  description: "Trade on aiSports fantasy basketball markets with NFT boosts",
};

async function getAiSportsMarkets() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/meta`, {
      cache: 'no-store',
    });
    
    if (!res.ok) {
      return [];
    }
    
    return res.json();
  } catch (error) {
    console.error('Failed to fetch aiSports markets:', error);
    return [];
  }
}

function DemoModeBanner() {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🎮</span>
        <div>
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
            Demo Mode Active
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Transactions are simulated using mock blockchain operations. All data is real from aiSports Flow contracts,
            but trades are executed in a safe sandbox environment. Production deployment will use real Flow transactions.
          </p>
        </div>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: any }) {
  const timeRemaining = market.currentData?.timeRemaining || 'Unknown';
  const isResolved = market.isResolved;
  
  return (
    <Link href={`/aisports/markets/${market.id}`}>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow bg-white dark:bg-gray-800">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-white">
              {market.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {market.description}
            </p>
          </div>
          {isResolved && (
            <span className="ml-3 px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
              Resolved
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">YES Price</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {(market.yesPrice * 100).toFixed(1)}¢
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">NO Price</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {(market.noPrice * 100).toFixed(1)}¢
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600 dark:text-gray-400">
            <span className="font-medium">{market.tradeVolume.toFixed(2)} FLOW</span> volume
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            {isResolved ? 'Closed' : `${timeRemaining} remaining`}
          </div>
        </div>

        {market.category && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 rounded">
              {market.category.replace('aiSports_', '')}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function AiSportsPage() {
  const markets = await getAiSportsMarkets();

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
          aiSports Prediction Markets
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Trade on fantasy basketball outcomes. Own rare NFTs? Get reward multipliers up to 2x.
        </p>
      </div>

      <DemoModeBanner />

      {markets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No markets available yet. Check back soon!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {markets.map((market: any) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
