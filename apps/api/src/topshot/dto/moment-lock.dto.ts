import { IsString, IsInt, IsOptional, IsEnum, Min } from 'class-validator';
import { MomentLockStatus } from '@prisma/client';

export class CreateMomentLockDto {
  @IsString()
  marketId: string;

  @IsString()
  eventId: string;

  @IsString()
  momentId: string;

  @IsInt()
  @Min(0)
  outcomeIndex: number;
}

export class UpdateMomentLockDto {
  @IsInt()
  @Min(0)
  outcomeIndex: number;
}

export class MomentLockResponseDto {
  id: string;
  userAddress: string;
  marketId: string;
  eventId: string;
  momentId: string;
  rarity: string;
  playerId?: string;
  playerName?: string;
  teamName?: string;
  outcomeType: string;
  outcomeIndex: number;
  lockedAt: Date;
  changeDeadline: Date;
  lockedUntil: Date;
  releasedAt?: Date | null;
  status: MomentLockStatus;
  estimatedReward?: number | null;
  metadata?: any;
}
