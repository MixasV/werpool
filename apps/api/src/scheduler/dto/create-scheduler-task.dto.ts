import { SchedulerTaskType } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";

const toIsoString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
};

export class CreateSchedulerTaskDto {
  @IsEnum(SchedulerTaskType)
  type!: SchedulerTaskType;

  @IsISO8601()
  @Transform(({ value }) => toIsoString(value))
  scheduledFor!: string;

  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value === null || typeof value === "object")
  @IsObject()
  payload?: Record<string, unknown> | null;
}
