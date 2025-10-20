import { LeaderboardEntryDto } from "./points.dto";

export interface LeaderboardSnapshotDto {
  capturedAt: string;
  entries: LeaderboardEntryDto[];
}
