import { IsString, IsInt, IsOptional, IsEnum, Min } from 'class-validator';
import { MomentLockStatus } from '@prisma/client';

export class CreateMomentLockDto {
  @IsString()
  marketId: string;

  @IsString()
  eventId: string;

  @IsString()
  momentId: string;

  // outcomeIndex removed - card locked for event, not specific outcome
}

export class UpdateMomentLockDto {
  @IsString()
  momentId: string;  // Can change moment before deadline
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
  outcomeType?: string | null;  // Optional: determined at settlement
  outcomeIndex?: number | null; // Optional: determined at settlement
  lockedAt: Date;
  changeDeadline: Date;
  lockedUntil: Date;
  releasedAt?: Date | null;
  status: MomentLockStatus;
  estimatedReward?: number | null;
  metadata?: any;
}
