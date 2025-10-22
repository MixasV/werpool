import Link from 'next/link';
import { fetchMFLTournaments } from '@/app/lib/mfl-api';

export default async function MFLTournamentsPage() {
  const tournaments = await fetchMFLTournaments();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">MFL Tournament Predictions</h1>
        <p className="text-gray-400">
          Bet on which club will win MFL tournaments
        </p>
      </div>

      {tournaments.length === 0 ? (
        <div className="bg-surface/50 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No active tournaments at the moment</p>
          <p className="text-sm text-gray-500">
            Tournaments will appear here when available on MFL
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/mfl/tournaments/${tournament.id}`}
              className="block bg-surface/50 rounded-lg p-6 hover:bg-surface/70 transition-colors"
            >
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">{tournament.name}</h3>
                <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                  tournament.status === 'UPCOMING' ? 'bg-blue-500/20 text-blue-400' :
                  tournament.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {tournament.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex justify-between">
                  <span>Start:</span>
                  <span>{new Date(tournament.startDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>End:</span>
                  <span>{new Date(tournament.endDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Participants:</span>
                  <span>{tournament.participants?.length || 0} clubs</span>
                </div>
              </div>

              {tournament.marketId && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <span className="text-accent text-sm">Prediction Market Available →</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
