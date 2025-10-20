import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

export class LeaderboardSnapshotQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  after?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;
}
