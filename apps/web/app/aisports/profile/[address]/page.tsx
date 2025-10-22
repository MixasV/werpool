"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface BoostInfo {
  address: string;
  nftCount: number;
  multiplier: number;
  boost: number;
  bestNFT: {
    id: string;
    rarity: string;
    type: string;
  } | null;
}

interface UserSnapshot {
  address: string;
  fantasyScore: number;
  juiceBalance: number;
  nfts: Array<{
    id: string;
    rarity: string;
    type: string;
  }>;
  totalTradeVolume: number;
  totalTrades: number;
}

function getRarityColor(rarity: string) {
  switch (rarity) {
    case 'Legendary': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/20';
    case 'Epic': return 'text-purple-500 bg-purple-100 dark:bg-purple-900/20';
    case 'Rare': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
    case 'Uncommon': return 'text-green-500 bg-green-100 dark:bg-green-900/20';
    default: return 'text-gray-500 bg-gray-100 dark:bg-gray-700';
  }
}

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;
  const [boostInfo, setBoostInfo] = useState<BoostInfo | null>(null);
  const [userSnapshot, setUserSnapshot] = useState<UserSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [address]);

  const fetchProfile = async () => {
    try {
      const [boostRes, snapshotRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/boost/${address}`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/oracles/aisports/profile/${address}`),
      ]);

      if (boostRes.ok) {
        setBoostInfo(await boostRes.json());
      }
      if (snapshotRes.ok) {
        setUserSnapshot(await snapshotRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading profile...</div>
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
          aiSports Profile
        </h1>
        <p className="text-sm font-mono text-gray-600 dark:text-gray-400">
          {address}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Fantasy Score</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {userSnapshot?.fantasyScore.toFixed(1) || '0.0'}
          </div>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">JUICE Balance</div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {userSnapshot?.juiceBalance.toFixed(2) || '0.00'}
          </div>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">NFT Count</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {boostInfo?.nftCount || 0}
          </div>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Reward Boost</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {boostInfo?.multiplier.toFixed(1)}x
          </div>
        </div>
      </div>

      {boostInfo?.bestNFT && (
        <div className="mb-8 border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
          <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            Best NFT (Active Boost)
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold">
              NFT
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-white mb-1">
                {boostInfo.bestNFT.type} #{boostInfo.bestNFT.id}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded font-semibold ${getRarityColor(boostInfo.bestNFT.rarity)}`}>
                  {boostInfo.bestNFT.rarity}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  +{(boostInfo.boost * 100).toFixed(0)}% rewards
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {userSnapshot && userSnapshot.nfts.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            NFT Collection ({userSnapshot.nfts.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {userSnapshot.nfts.map((nft) => (
              <div
                key={nft.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="w-full aspect-square bg-gradient-to-br from-purple-400 to-blue-400 rounded-lg mb-3 flex items-center justify-center text-white text-xl font-bold">
                  NFT
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  {nft.type}
                </div>
                <div className={`text-xs px-2 py-1 rounded inline-block ${getRarityColor(nft.rarity)}`}>
                  {nft.rarity}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!userSnapshot || userSnapshot.nfts.length === 0) && (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400 mb-2">No NFTs found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Own aiSports NFTs to get reward multipliers
          </p>
        </div>
      )}
    </div>
  );
}
