export interface SportsDataConfig {
  theSportsDbApiKey: string | null;
  theSportsDbBaseUrl: string;
  sportmonksApiToken: string | null;
  sportmonksBaseUrl: string;
  requestTimeoutMs: number;
}

const DEFAULT_THE_SPORTS_DB_BASE = "https://www.thesportsdb.com/api/v1/json";
const DEFAULT_SPORTMONKS_BASE = "https://api.sportmonks.com/v3/football";

export const resolveSportsDataConfig = (): SportsDataConfig => {
  const timeoutRaw = process.env.SPORTS_DATA_TIMEOUT_MS ?? "5000";
  const timeoutMs = Number(timeoutRaw);

  return {
    theSportsDbApiKey: process.env.THE_SPORTS_DB_API_KEY?.trim() || null,
    theSportsDbBaseUrl:
      process.env.THE_SPORTS_DB_BASE_URL?.trim() || DEFAULT_THE_SPORTS_DB_BASE,
    sportmonksApiToken: process.env.SPORTMONKS_API_TOKEN?.trim() || null,
    sportmonksBaseUrl:
      process.env.SPORTMONKS_BASE_URL?.trim() || DEFAULT_SPORTMONKS_BASE,
    requestTimeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
  };
};
