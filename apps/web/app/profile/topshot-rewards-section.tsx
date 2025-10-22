'use client';

import { useState, useEffect } from 'react';
import type { TopShotReward } from '../lib/topshot-api';
import { getUserTopShotRewards } from '../lib/topshot-api';

interface TopShotRewardsSectionProps {
  userAddress: string;
}

export function TopShotRewardsSection({ userAddress }: TopShotRewardsSectionProps) {
  const [rewards, setRewards] = useState<TopShotReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRewards() {
      try {
        const data = await getUserTopShotRewards(userAddress);
        setRewards(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadRewards();
  }, [userAddress]);

  if (loading) {
    return (
      <div className="topshot-rewards-section">
        <h2>NBA Top Shot Rewards</h2>
        <p className="loading">Loading rewards...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="topshot-rewards-section">
        <h2>NBA Top Shot Rewards</h2>
        <p className="error">Failed to load rewards: {error}</p>
      </div>
    );
  }

  const totalRewards = rewards.reduce((sum, r) => sum + r.points, 0);
  const last7Days = rewards.filter(
    (r) => new Date(r.awardedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const last7DaysTotal = last7Days.reduce((sum, r) => sum + r.points, 0);

  return (
    <div className="topshot-rewards-section">
      <div className="section-header">
        <h2>🏀 NBA Top Shot Rewards</h2>
        <p className="section-description">
          Earn bonus points by locking your NBA Top Shot moments to events. Rewards are based on player performance.
        </p>
      </div>

      <div className="rewards-stats">
        <div className="stat-card">
          <span className="stat-label">Total Earned</span>
          <span className="stat-value">{totalRewards.toFixed(2)} pts</span>
          <span className="stat-hint">{rewards.length} rewards</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Last 7 Days</span>
          <span className="stat-value">{last7DaysTotal.toFixed(2)} pts</span>
          <span className="stat-hint">{last7Days.length} rewards</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Daily Cap</span>
          <span className="stat-value">300 pts</span>
          <span className="stat-hint">Per day maximum</span>
        </div>
      </div>

      {rewards.length === 0 ? (
        <div className="empty-state">
          <p>No rewards yet. Lock your Top Shot moments to events to start earning!</p>
        </div>
      ) : (
        <div className="rewards-list">
          <h3>Recent Rewards</h3>
          <div className="rewards-table">
            {rewards.slice(0, 10).map((reward) => (
              <div key={reward.id} className="reward-row">
                <div className="reward-info">
                  <span className="player-name">
                    {reward.metadata?.playerName || 'Unknown Player'}
                  </span>
                  <span className="reward-details">
                    {reward.metadata?.rarity || 'Unknown'} · 
                    Score: {reward.metadata?.score?.toFixed(1) || 'N/A'} · 
                    {reward.metadata?.multiplier ? `${reward.metadata.multiplier}x` : '1.0x'}
                  </span>
                </div>
                <div className="reward-value">
                  <span className="points">+{reward.points.toFixed(2)} pts</span>
                  <span className="date">{new Date(reward.awardedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .topshot-rewards-section {
          margin: 2rem 0;
          padding: 2rem;
          background: #f9fafb;
          border-radius: 12px;
        }

        .section-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .section-description {
          color: #6b7280;
          margin: 0;
        }

        .rewards-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin: 1.5rem 0;
        }

        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .stat-hint {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
          color: #6b7280;
        }

        .rewards-list {
          margin-top: 2rem;
        }

        .rewards-list h3 {
          margin: 0 0 1rem 0;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .rewards-table {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .reward-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .reward-row:last-child {
          border-bottom: none;
        }

        .reward-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .player-name {
          font-weight: 600;
          color: #111827;
        }

        .reward-details {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .reward-value {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .points {
          font-weight: 700;
          color: #059669;
          font-size: 1.125rem;
        }

        .date {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .loading,
        .error {
          text-align: center;
          padding: 2rem;
          color: #6b7280;
        }

        .error {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
