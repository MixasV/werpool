import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";
import { PointEventSource } from "@prisma/client";

export class AwardPointsDto {
  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsEnum(PointEventSource)
  source!: PointEventSource;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsPositive()
  amount!: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  notes?: string;
}
