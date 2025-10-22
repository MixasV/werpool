export type SportsDataEventStatus =
  | "scheduled"
  | "live"
  | "final"
  | "completed"
  | "canceled"
  | "unknown";

export interface SportsDataScore {
  home: number;
  away: number;
  period?: string;
}

export interface SportsDataEvent {
  eventId: string;
  status: SportsDataEventStatus;
  sport?: string;
  league?: string;
  startsAt?: string;
  headline?: string;
  score?: SportsDataScore;
  metadata?: Record<string, unknown>;
  source: string;
  players?: SportsDataPlayerStat[];
}

export interface SportsDataProvider {
  readonly isEnabled: boolean;
  fetchEvent(eventId: string): Promise<SportsDataEvent | null>;
}

export interface SportsDataPlayerStat {
  playerId: string;
  playerName?: string;
  teamId?: string;
  teamName?: string;
  position?: string;
  jerseyNumber?: string;
  minutes?: number;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  plusMinus?: number;
  turnovers?: number;
  fouls?: number;
  metadata?: Record<string, unknown>;
}
