export interface SportsEventDto {
  eventId: string;
  status: string;
  signature: string;
  publishedAt: string;
  publishedBy: string | null;
  payload: Record<string, unknown>;
}
