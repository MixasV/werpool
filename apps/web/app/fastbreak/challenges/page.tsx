import Link from 'next/link';
import { fetchFastBreakChallenges } from '../../lib/fastbreak-api';

export default async function FastBreakChallengesPage() {
  const challenges = await fetchFastBreakChallenges();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-2">FastBreak Peer Challenges</h1>
          <p className="text-gray-400">
            Challenge friends or anyone to FastBreak competitions
          </p>
        </div>
        <Link
          href="/fastbreak/create-challenge"
          className="px-6 py-3 bg-accent hover:bg-accent/80 rounded-lg font-semibold transition-colors"
        >
          Create Challenge
        </Link>
      </div>

      {challenges.length === 0 ? (
        <div className="bg-surface/50 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No active challenges</p>
          <Link
            href="/fastbreak/create-challenge"
            className="inline-block px-6 py-3 bg-accent hover:bg-accent/80 rounded-lg font-semibold transition-colors"
          >
            Create First Challenge
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {challenges.map((challenge) => (
            <Link
              key={challenge.id}
              href={`/fastbreak/challenges/${challenge.id}`}
              className="block bg-surface/50 rounded-lg p-6 hover:bg-surface/70 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold mb-2">{challenge.question}</h3>
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      challenge.state === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                      challenge.state === 'MATCHED' ? 'bg-green-500/20 text-green-400' :
                      challenge.state === 'SETTLED' ? 'bg-blue-500/20 text-blue-400' :
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
                  <div className="text-2xl font-bold text-accent">
                    {(challenge.creatorStake || challenge.stake || 0) * 2} FLOW
                  </div>
                  <div className="text-sm text-gray-400">Prize Pool</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 mb-1">Creator</div>
                  <div className="font-semibold">
                    {challenge.creatorUsername || challenge.creator?.address?.slice(0, 8) || 'Unknown'}
                  </div>
                  <div className="text-accent">{challenge.creatorStake || challenge.stake || 0} FLOW</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Opponent</div>
                  {challenge.opponent ? (
                    <>
                      <div className="font-semibold">
                        {challenge.opponentUsername || challenge.opponent?.address?.slice(0, 8) || 'Unknown'}
                      </div>
                      <div className="text-accent">{challenge.opponentStake || challenge.stake || 0} FLOW</div>
                    </>
                  ) : (
                    <div className="text-gray-500">Waiting...</div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between text-sm text-gray-400">
                <span>Closes: {challenge.closeAt ? new Date(challenge.closeAt).toLocaleDateString() : 'TBD'}</span>
                <span>{challenge.duration || 1} week{(challenge.duration || 1) > 1 ? 's' : ''}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
