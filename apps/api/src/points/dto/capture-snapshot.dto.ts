import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

export class CaptureSnapshotDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}
