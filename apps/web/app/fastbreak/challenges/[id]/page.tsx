'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  fetchFastBreakChallenge, 
  acceptFastBreakChallenge, 
  cancelFastBreakChallenge 
} from '../../../lib/fastbreak-api';
import * as fcl from '@onflow/fcl';

export default function FastBreakChallengePage() {
  const params = useParams();
  const router = useRouter();
  const [challenge, setChallenge] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    loadChallenge();
    checkCurrentUser();
  }, [params.id]);

  useEffect(() => {
    if (challenge && challenge.type === 'private') {
      const link = `${window.location.origin}/fastbreak/challenges/${challenge.id}?invite=true`;
      setInviteLink(link);
    }
  }, [challenge]);

  const loadChallenge = async () => {
    try {
      const data = await fetchFastBreakChallenge(params.id as string);
      setChallenge(data);
    } catch (err) {
      setError('Failed to load challenge');
    } finally {
      setLoading(false);
    }
  };

  const checkCurrentUser = async () => {
    const user = await fcl.currentUser.snapshot();
    setCurrentUser(user.loggedIn ? user : null);
  };

  const handleAccept = async () => {
    if (!currentUser) {
      alert('Please connect wallet first');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await acceptFastBreakChallenge(challenge.id);
      router.refresh();
      loadChallenge();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept challenge');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!currentUser) {
      alert('Please connect wallet first');
      return;
    }

    if (!confirm('Are you sure you want to cancel this challenge?')) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await cancelFastBreakChallenge(challenge.id);
      router.push('/fastbreak/challenges');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel challenge');
    } finally {
      setActionLoading(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Invite link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading challenge...</div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-400">Challenge not found</div>
      </div>
    );
  }

  const isCreator = currentUser?.addr === challenge.creator;
  const isOpponent = currentUser?.addr === challenge.opponent;
  const canAccept = challenge.state === 'PENDING' && !isCreator && !challenge.opponent;
  const canCancel = challenge.state === 'PENDING' && isCreator;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{challenge.question}</h1>
            <div className="flex gap-2">
              <span className={`px-3 py-1 rounded-full text-sm ${
                challenge.state === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                challenge.state === 'MATCHED' ? 'bg-green-500/20 text-green-400' :
                challenge.state === 'ACTIVE' ? 'bg-blue-500/20 text-blue-400' :
                challenge.state === 'SETTLED' ? 'bg-purple-500/20 text-purple-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {challenge.state}
              </span>
              <span className="px-3 py-1 rounded-full text-sm bg-purple-500/20 text-purple-400">
                {challenge.type === 'private' ? 'Private' : 'Public'}
              </span>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-accent mb-1">
              {challenge.creatorStake * 2} FLOW
            </div>
            <div className="text-sm text-gray-400">Prize Pool</div>
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-surface/50 rounded-lg p-6">
          <div className="text-sm text-gray-400 mb-2">Creator</div>
          <div className="text-xl font-semibold mb-2">
            {challenge.creatorUsername || 'Anonymous'}
          </div>
          <div className="text-accent font-semibold mb-2">{challenge.creatorStake} FLOW</div>
          <div className="text-xs text-gray-500 break-all">{challenge.creator}</div>
          {challenge.creatorRank && (
            <div className="mt-3 text-sm">
              Final Rank: <span className="font-bold text-accent">#{challenge.creatorRank}</span>
            </div>
          )}
        </div>

        <div className="bg-surface/50 rounded-lg p-6">
          <div className="text-sm text-gray-400 mb-2">Opponent</div>
          {challenge.opponent ? (
            <>
              <div className="text-xl font-semibold mb-2">
                {challenge.opponentUsername || 'Anonymous'}
              </div>
              <div className="text-accent font-semibold mb-2">{challenge.opponentStake} FLOW</div>
              <div className="text-xs text-gray-500 break-all">{challenge.opponent}</div>
              {challenge.opponentRank && (
                <div className="mt-3 text-sm">
                  Final Rank: <span className="font-bold text-accent">#{challenge.opponentRank}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-2xl mb-2">🔍</div>
              <div className="text-gray-400">Waiting for opponent...</div>
            </div>
          )}
        </div>
      </div>

      {/* Challenge Details */}
      <div className="bg-surface/50 rounded-lg p-6 mb-8">
        <h3 className="font-semibold mb-4">Challenge Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Duration</div>
            <div className="font-semibold">{challenge.duration} week{challenge.duration > 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="text-gray-400">Closes At</div>
            <div className="font-semibold">{new Date(challenge.closeAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-400">Created</div>
            <div className="font-semibold">{new Date(challenge.createdAt).toLocaleDateString()}</div>
          </div>
          {challenge.matchedAt && (
            <div>
              <div className="text-gray-400">Matched</div>
              <div className="font-semibold">{new Date(challenge.matchedAt).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Winner (if settled) */}
      {challenge.state === 'SETTLED' && challenge.winnerAddress && (
        <div className="bg-accent/10 border border-accent rounded-lg p-6 mb-8 text-center">
          <div className="text-2xl mb-2">🏆</div>
          <div className="text-xl font-bold mb-2">
            {challenge.winnerAddress === challenge.creator
              ? challenge.creatorUsername || 'Creator'
              : challenge.opponentUsername || 'Opponent'
            } Wins!
          </div>
          <div className="text-accent text-2xl font-bold">{challenge.creatorStake * 2} FLOW</div>
        </div>
      )}

      {/* Private Invite Link */}
      {challenge.type === 'private' && challenge.state === 'PENDING' && isCreator && (
        <div className="bg-purple-500/10 border border-purple-500 rounded-lg p-6 mb-8">
          <div className="font-semibold mb-3">📨 Invite Your Opponent</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteLink}
              readOnly
              className="flex-1 px-4 py-2 bg-surface rounded border border-gray-700 text-sm"
            />
            <button
              onClick={copyInviteLink}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded font-semibold transition-colors"
            >
              Copy Link
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Send this link to {challenge.opponentUsername || 'your opponent'} to join
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        {canAccept && (
          <button
            onClick={handleAccept}
            disabled={actionLoading}
            className="flex-1 px-6 py-4 bg-accent hover:bg-accent/80 rounded-lg font-semibold text-lg transition-colors disabled:opacity-50"
          >
            {actionLoading ? 'Accepting...' : `Accept Challenge (${challenge.creatorStake} FLOW)`}
          </button>
        )}

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={actionLoading}
            className="flex-1 px-6 py-4 bg-red-500 hover:bg-red-600 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {actionLoading ? 'Canceling...' : 'Cancel Challenge'}
          </button>
        )}

        {!canAccept && !canCancel && (
          <button
            onClick={() => router.push('/fastbreak/challenges')}
            className="flex-1 px-6 py-4 bg-surface hover:bg-gray-700 rounded-lg font-semibold transition-colors"
          >
            Back to Challenges
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
