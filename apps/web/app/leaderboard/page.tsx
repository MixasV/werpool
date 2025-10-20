import { cookies } from "next/headers";

import {
  fetchLeaderboard,
  fetchLeaderboardSnapshots,
  type LeaderboardEntry,
  type LeaderboardSnapshot,
} from "../lib/points-api";
import { fetchMyProfile } from "../lib/users-api";
import { LeaderboardClient } from "./leaderboard-client";

export const dynamic = "force-dynamic";

const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";

const getSessionToken = () => {
  const store = cookies();
  return store.get(sessionCookieName)?.value ?? null;
};

const safeFetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  try {
    return await fetchLeaderboard(50, { allowApiTokenFallback: true });
  } catch {
    return [];
  }
};

const safeFetchSnapshots = async (): Promise<LeaderboardSnapshot[]> => {
  try {
    return await fetchLeaderboardSnapshots({ limit: 6, auth: { allowApiTokenFallback: true } });
  } catch {
    return [];
  }
};

const safeFetchProfile = async () => {
  try {
    return await fetchMyProfile({ token: getSessionToken(), allowApiTokenFallback: false });
  } catch {
    return null;
  }
};

export default async function LeaderboardPage() {
  const [entries, snapshots, profile] = await Promise.all([
    safeFetchLeaderboard(),
    safeFetchSnapshots(),
    safeFetchProfile(),
  ]);

  return (
    <div className="leaderboard-page">
      <header className="leaderboard-header">
        <div>
          <h1>Werpool leaderboard</h1>
          <p>
            Track top forecasters and community builders in real time. Historic snapshots show
            how conviction and activity evolve across the network.
          </p>
        </div>
        {profile && (
          <div className="leaderboard-self">
            <span className="leaderboard-self__label">Your points</span>
            <span className="leaderboard-self__value">
              {profile.marketingOptIn ? "★ " : ""}
              {entries.find((entry) => entry.address === profile.address)?.total?.toLocaleString("en-US") ?? "—"}
            </span>
            <span className="leaderboard-self__address">{profile.address}</span>
          </div>
        )}
      </header>

      <LeaderboardClient
        entries={entries}
        snapshots={snapshots}
        highlightedAddress={profile?.address ?? null}
      />
    </div>
  );
}
