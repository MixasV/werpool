import { Module } from '@nestjs/common';
import { FlowSchedulerService } from './flow-scheduler.service';
import { FlowTransactionService } from '../markets/flow/flow-transaction.service';
import { FlowCliService } from './flow-cli.service';
import { AiSportsFlowService } from './aisports-flow.service';

@Module({
  providers: [FlowSchedulerService, FlowTransactionService, FlowCliService, AiSportsFlowService],
  exports: [FlowSchedulerService, FlowTransactionService, FlowCliService, AiSportsFlowService],
})
export class FlowModule {}
