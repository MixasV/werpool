import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FastBreakChallengeService } from './fastbreak-challenge.service';
import { FastBreakOracleService } from './fastbreak-oracle.service';
import { FastBreakController } from './fastbreak.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TopShotModule } from '../topshot/topshot.module';

@Module({
  imports: [PrismaModule, TopShotModule, HttpModule],
  controllers: [FastBreakController],
  providers: [FastBreakChallengeService, FastBreakOracleService],
  exports: [FastBreakChallengeService, FastBreakOracleService],
})
export class FastBreakModule {}
