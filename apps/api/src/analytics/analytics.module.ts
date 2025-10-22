import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FindLabsClient } from './find-labs.client';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [AnalyticsController],
  providers: [FindLabsClient, AnalyticsService],
  exports: [FindLabsClient, AnalyticsService],
})
export class AnalyticsModule {}
