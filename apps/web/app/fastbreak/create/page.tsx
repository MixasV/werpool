'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFastBreakChallenge } from '../../lib/fastbreak-api';
import * as fcl from '@onflow/fcl';

export default function CreateFastBreakChallenge() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    type: 'public' as 'public' | 'private',
    bettingType: 'head-to-head' as 'head-to-head' | 'spectator',
    opponentUsername: '',
    stakeAmount: 10,
    question: '',
    duration: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = await fcl.currentUser.snapshot();
      
      if (!user.loggedIn) {
        throw new Error('Please connect wallet first');
      }

      if (!formData.question.trim()) {
        throw new Error('Question is required');
      }

      if (formData.stakeAmount <= 0) {
        throw new Error('Stake must be positive');
      }

      const challenge = await createFastBreakChallenge({
        ...formData,
        creator: user.addr,
      });

      router.push(`/fastbreak/challenges/${challenge.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create challenge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-4xl font-bold mb-8">Create FastBreak Challenge</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Challenge Type */}
        <div>
          <label className="block text-sm font-semibold mb-2">Challenge Type</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'public' })}
              className={`p-4 rounded-lg border-2 transition-colors ${
                formData.type === 'public'
                  ? 'border-accent bg-accent/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="font-semibold mb-1">Public</div>
              <div className="text-sm text-gray-400">Anyone can join</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'private' })}
              className={`p-4 rounded-lg border-2 transition-colors ${
                formData.type === 'private'
                  ? 'border-accent bg-accent/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="font-semibold mb-1">Private</div>
              <div className="text-sm text-gray-400">Invite specific user</div>
            </button>
          </div>
        </div>

        {/* Opponent (Private only) */}
        {formData.type === 'private' && (
          <div>
            <label className="block text-sm font-semibold mb-2">
              Opponent Username (TopShot)
            </label>
            <input
              type="text"
              value={formData.opponentUsername}
              onChange={(e) => setFormData({ ...formData, opponentUsername: e.target.value })}
              placeholder="Enter TopShot username"
              className="w-full px-4 py-3 bg-surface rounded-lg border border-gray-700 focus:border-accent focus:outline-none"
            />
            <p className="text-sm text-gray-400 mt-1">
              You&apos;ll get an invite link to send them
            </p>
          </div>
        )}

        {/* Question */}
        <div>
          <label className="block text-sm font-semibold mb-2">Challenge Question</label>
          <textarea
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            placeholder="e.g., Who will rank higher in FastBreak this week?"
            rows={3}
            maxLength={500}
            className="w-full px-4 py-3 bg-surface rounded-lg border border-gray-700 focus:border-accent focus:outline-none resize-none"
          />
          <div className="text-sm text-gray-400 mt-1 flex justify-between">
            <span>Describe your FastBreak challenge</span>
            <span>{formData.question.length}/500</span>
          </div>
        </div>

        {/* Stake Amount */}
        <div>
          <label className="block text-sm font-semibold mb-2">Stake Amount (FLOW)</label>
          <input
            type="number"
            value={formData.stakeAmount}
            onChange={(e) => setFormData({ ...formData, stakeAmount: parseFloat(e.target.value) })}
            min="0.1"
            step="0.1"
            className="w-full px-4 py-3 bg-surface rounded-lg border border-gray-700 focus:border-accent focus:outline-none"
          />
          <p className="text-sm text-gray-400 mt-1">
            Prize Pool: <span className="text-accent font-semibold">{formData.stakeAmount * 2} FLOW</span> (winner takes all)
          </p>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-semibold mb-2">Duration</label>
          <select
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
            className="w-full px-4 py-3 bg-surface rounded-lg border border-gray-700 focus:border-accent focus:outline-none"
          >
            <option value={1}>1 Week</option>
            <option value={2}>2 Weeks</option>
            <option value={4}>1 Month (4 weeks)</option>
          </select>
          <p className="text-sm text-gray-400 mt-1">
            Challenge ends at close of week (Sunday 11:59 PM)
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-6 py-3 bg-surface hover:bg-gray-700 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-accent hover:bg-accent/80 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Challenge'}
          </button>
        </div>
      </form>
    </div>
  );
}
