import { Module } from '@nestjs/common';
import { FlowSchedulerService } from './flow-scheduler.service';
import { FlowTransactionService } from '../markets/flow/flow-transaction.service';
import { FlowCliService } from './flow-cli.service';

@Module({
  providers: [FlowSchedulerService, FlowTransactionService, FlowCliService],
  exports: [FlowSchedulerService, FlowTransactionService, FlowCliService],
})
export class FlowModule {}
