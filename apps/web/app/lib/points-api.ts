import { API_BASE_URL, parseJson, withAuthHeaders, type AuthOptions } from "./api-client";

export type PointEventSource = "TRADE" | "LIQUIDITY" | "CLAIM" | "PATROL" | "BONUS" | "ADMIN";

export interface PointsSummary {
  address: string;
  total: number;
  updatedAt: string;
}

export interface PointLedgerEntry {
  id: string;
  address: string;
  source: PointEventSource;
  amount: number;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface LedgerResponse {
  entries: PointLedgerEntry[];
  nextCursor?: string;
}

export interface LeaderboardEntry {
  address: string;
  total: number;
  rank: number;
}

export interface LeaderboardSnapshot {
  capturedAt: string;
  entries: LeaderboardEntry[];
}

interface ListOptions {
  limit?: number;
  cursor?: string;
}

export const fetchMyPointsSummary = async (options?: AuthOptions): Promise<PointsSummary> => {
  const response = await fetch(`${API_BASE_URL}/points/me`, withAuthHeaders(undefined, options));
  return parseJson<PointsSummary>(response);
};

export const fetchMyPointsLedger = async (
  options: ListOptions & { auth?: AuthOptions } = {}
): Promise<LedgerResponse> => {
  const query = new URLSearchParams();
  if (options.limit) {
    query.set("limit", options.limit.toString());
  }
  if (options.cursor) {
    query.set("cursor", options.cursor);
  }

  const response = await fetch(
    `${API_BASE_URL}/points/me/ledger${query.size > 0 ? `?${query.toString()}` : ""}`,
    withAuthHeaders(undefined, options.auth)
  );
  return parseJson<LedgerResponse>(response);
};

export const fetchLeaderboard = async (
  limit = 20,
  options?: AuthOptions
): Promise<LeaderboardEntry[]> => {
  const query = new URLSearchParams();
  query.set("limit", Math.min(Math.max(limit, 1), 100).toString());

  const response = await fetch(
    `${API_BASE_URL}/points/leaderboard?${query.toString()}`,
    withAuthHeaders(undefined, options)
  );
  return parseJson<LeaderboardEntry[]>(response);
};

export const fetchPointsSummaryForAddress = async (
  address: string,
  options?: AuthOptions
): Promise<PointsSummary> => {
  const response = await fetch(
    `${API_BASE_URL}/points/${encodeURIComponent(address)}`,
    withAuthHeaders(undefined, options)
  );
  return parseJson<PointsSummary>(response);
};

export const fetchLedgerForAddress = async (
  address: string,
  options: ListOptions & { auth?: AuthOptions } = {}
): Promise<LedgerResponse> => {
  const query = new URLSearchParams();
  if (options.limit) {
    query.set("limit", options.limit.toString());
  }
  if (options.cursor) {
    query.set("cursor", options.cursor);
  }

  const response = await fetch(
    `${API_BASE_URL}/points/${encodeURIComponent(address)}/ledger${
      query.size > 0 ? `?${query.toString()}` : ""
    }`,
    withAuthHeaders(undefined, options.auth)
  );
  return parseJson<LedgerResponse>(response);
};

interface AwardPointsPayload {
  address: string;
  amount: number;
  source: PointEventSource;
  reference?: string;
  notes?: string;
}

interface SnapshotQueryOptions {
  limit?: number;
  after?: string;
  before?: string;
  auth?: AuthOptions;
}

interface CaptureSnapshotPayload {
  limit?: number;
  capturedAt?: string;
}

export const awardPoints = async (
  payload: AwardPointsPayload,
  options?: AuthOptions
): Promise<PointLedgerEntry> => {
  const response = await fetch(
    `${API_BASE_URL}/points/award`,
    withAuthHeaders(
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
        },
      },
      options
    )
  );
  return parseJson<PointLedgerEntry>(response);
};

export const fetchLeaderboardSnapshots = async (
  options: SnapshotQueryOptions = {}
): Promise<LeaderboardSnapshot[]> => {
  const query = new URLSearchParams();
  if (options.limit) {
    query.set("limit", Math.min(Math.max(options.limit, 1), 50).toString());
  }
  if (options.after) {
    query.set("after", options.after);
  }
  if (options.before) {
    query.set("before", options.before);
  }

  const response = await fetch(
    `${API_BASE_URL}/points/leaderboard/snapshots${
      query.size > 0 ? `?${query.toString()}` : ""
    }`,
    withAuthHeaders({}, options.auth)
  );
  return parseJson<LeaderboardSnapshot[]>(response);
};

export const captureLeaderboardSnapshot = async (
  payload: CaptureSnapshotPayload = {},
  options?: AuthOptions
): Promise<LeaderboardSnapshot> => {
  const response = await fetch(
    `${API_BASE_URL}/points/leaderboard/snapshots`,
    withAuthHeaders(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      options
    )
  );
  return parseJson<LeaderboardSnapshot>(response);
};
