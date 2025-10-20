export interface PublishSportsEventRequestDto {
  eventId: string;
  source: string;
  status: "scheduled" | "live" | "final" | "canceled";
  league?: string;
  sport?: string;
  startsAt?: string;
  metadata?: Record<string, unknown>;
  score?: {
    home: number;
    away: number;
    period?: string;
  } | null;
  headline?: string;
}

export interface PublishSportsEventResponseDto {
  eventId: string;
  status: string;
  payload: Record<string, unknown>;
  signature: string;
  publishedAt: string;
  publishedBy: string | null;
}
