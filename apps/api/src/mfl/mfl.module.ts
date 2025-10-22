import { Module } from '@nestjs/common';
import { MFLIntegrationService } from './mfl-integration.service';
import { MFLOracleService } from './mfl-oracle.service';
import { MFLController } from './mfl.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlowModule } from '../flow/flow.module';
import { MarketsModule } from '../markets/markets.module';

@Module({
  imports: [PrismaModule, FlowModule, MarketsModule],
  controllers: [MFLController],
  providers: [MFLIntegrationService, MFLOracleService],
  exports: [MFLIntegrationService, MFLOracleService],
})
export class MFLModule {}
