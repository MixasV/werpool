"use client";

import { useMemo, useState } from "react";

import type { LeaderboardEntry, LeaderboardSnapshot } from "../lib/points-api";

interface LeaderboardClientProps {
  entries: LeaderboardEntry[];
  snapshots: LeaderboardSnapshot[];
  highlightedAddress: string | null;
}

const formatAddress = (address: string): string => {
  if (!address.startsWith("0x")) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const tierForRank = (rank: number, total: number): "legend" | "champion" | "contender" | "newcomer" => {
  if (rank === 1) return "legend";
  if (rank <= Math.max(3, Math.round(total * 0.1))) return "champion";
  if (rank <= Math.max(10, Math.round(total * 0.3))) return "contender";
  return "newcomer";
};

const tierLabels: Record<ReturnType<typeof tierForRank>, string> = {
  legend: "Legend",
  champion: "Challenger",
  contender: "Contender",
  newcomer: "Newcomer",
};

const tierClassName: Record<ReturnType<typeof tierForRank>, string> = {
  legend: "tier tier--gold",
  champion: "tier tier--purple",
  contender: "tier tier--blue",
  newcomer: "tier tier--gray",
};

export const LeaderboardClient = ({ entries, snapshots, highlightedAddress }: LeaderboardClientProps) => {
  const [selectedSnapshot, setSelectedSnapshot] = useState<LeaderboardSnapshot | null>(null);

  const activeEntries = selectedSnapshot?.entries ?? entries;

  const topThree = useMemo(() => activeEntries.slice(0, 3), [activeEntries]);
  const rest = useMemo(() => activeEntries.slice(3), [activeEntries]);

  const totalParticipants = activeEntries.length;

  return (
    <div className="leaderboard-layout">
      <section className="leaderboard-current" aria-labelledby="current-leaderboard">
        <div className="leaderboard-current__header">
          <h2 id="current-leaderboard">
            {selectedSnapshot
              ? `Snapshot from ${new Date(selectedSnapshot.capturedAt).toLocaleString("en-US")}`
              : "Live standings"}
          </h2>
          <span className="leaderboard-current__participants">
            Participants: {totalParticipants.toLocaleString("en-US")}
          </span>
        </div>
        <div className="leaderboard-podium">
          {topThree.map((entry) => {
            const tier = tierForRank(entry.rank, totalParticipants);
            return (
              <article
                key={entry.address}
                className={`leaderboard-podium__card ${tierClassName[tier]}`}
                data-highlight={highlightedAddress === entry.address}
              >
                <span className="leaderboard-podium__rank">#{entry.rank}</span>
                <span className="leaderboard-podium__address">{formatAddress(entry.address)}</span>
                <span className="leaderboard-podium__points">{entry.total.toLocaleString("en-US")}</span>
                <span className="leaderboard-podium__tier">{tierLabels[tier]}</span>
              </article>
            );
          })}
        </div>
        <div className="leaderboard-table-wrapper">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Address</th>
                <th>Points</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {rest.length === 0 ? (
                <tr>
                  <td colSpan={4} className="leaderboard-empty">
                    Be the first to claim a spot on the board.
                  </td>
                </tr>
              ) : (
                rest.map((entry) => {
                  const tier = tierForRank(entry.rank, totalParticipants);
                  return (
                    <tr key={entry.address} data-highlight={highlightedAddress === entry.address}>
                      <td>#{entry.rank}</td>
                      <td>{formatAddress(entry.address)}</td>
                      <td>{entry.total.toLocaleString("en-US")}</td>
                      <td><span className={tierClassName[tier]}>{tierLabels[tier]}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="leaderboard-history" aria-labelledby="history">
        <div className="leaderboard-history__header">
          <h2 id="history">Snapshot history</h2>
          <p>Select a snapshot to compare with the live standings.</p>
        </div>
        <ul className="leaderboard-history__list">
          <li>
            <button
              type="button"
              className="leaderboard-history__item"
              data-active={!selectedSnapshot}
              onClick={() => setSelectedSnapshot(null)}
            >
              <span>Live now</span>
              <span className="leaderboard-history__hint">Real-time feed</span>
            </button>
          </li>
          {snapshots.map((snapshot) => (
            <li key={snapshot.capturedAt}>
              <button
                type="button"
                className="leaderboard-history__item"
                data-active={selectedSnapshot?.capturedAt === snapshot.capturedAt}
                onClick={() => setSelectedSnapshot(snapshot)}
              >
                <span>{new Date(snapshot.capturedAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="leaderboard-history__hint">Top {snapshot.entries.length}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="leaderboard-summary">
          <h3>Badge guide</h3>
          <ul>
            <li><span className="tier tier--gold">Legend</span> — hold the #1 position.</li>
            <li><span className="tier tier--purple">Challenger</span> — stay in the top 10%.
            </li>
            <li><span className="tier tier--blue">Contender</span> — trade actively and complete quests.</li>
            <li><span className="tier tier--gray">Newcomer</span> — join markets and start stacking points.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
};
