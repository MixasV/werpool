import { Module } from '@nestjs/common';
import { FlowSchedulerService } from './flow-scheduler.service';
import { FlowTransactionService } from '../markets/flow/flow-transaction.service';

@Module({
  providers: [FlowSchedulerService, FlowTransactionService],
  exports: [FlowSchedulerService, FlowTransactionService],
})
export class FlowModule {}
