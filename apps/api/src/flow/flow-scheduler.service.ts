import { Injectable, Logger } from '@nestjs/common';
import { FlowTransactionService } from '../markets/flow/flow-transaction.service';

interface ScheduleTransactionDto {
  handlerPath: string;
  data: any;
  executeAt: Date;
  priority: 'High' | 'Medium' | 'Low';
  executionEffort: number;
  signerAddress: string;
}

interface ScheduleResult {
  success: boolean;
  scheduledTxId: string;
  executeAt: string;
  estimatedFee: number;
}

@Injectable()
export class FlowSchedulerService {
  private readonly logger = new Logger(FlowSchedulerService.name);

  constructor(private readonly flowTxService: FlowTransactionService) {}

  async scheduleTransaction(dto: ScheduleTransactionDto): Promise<ScheduleResult> {
    this.logger.log(`Scheduling transaction: handler=${dto.handlerPath}, executeAt=${dto.executeAt.toISOString()}`);

    try {
      const delaySeconds = (dto.executeAt.getTime() - Date.now()) / 1000;

      if (delaySeconds < 0) {
        throw new Error('executeAt must be in the future');
      }

      const priorityValue = dto.priority === 'High' ? 0 : dto.priority === 'Medium' ? 1 : 2;

      const txResult = await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/scheduleTransaction.cdc',
        signer: dto.signerAddress,
        arguments: [
          { type: 'UFix64', value: delaySeconds.toFixed(1) },
          { type: 'UInt8', value: priorityValue.toString() },
          { type: 'UInt64', value: dto.executionEffort.toString() },
          { type: 'Optional', value: dto.data ? JSON.stringify(dto.data) : null },
        ],
        network: 'testnet',
      });

      return {
        success: true,
        scheduledTxId: txResult.transactionId,
        executeAt: dto.executeAt.toISOString(),
        estimatedFee: 0.001, // Placeholder, should calculate from estimate
      };
    } catch (error) {
      this.logger.error(`Failed to schedule transaction: ${error.message}`, error.stack);
      throw error;
    }
  }

  async scheduleAutoReveal(
    betId: number,
    marketCloseAt: Date,
    userAddress: string,
  ): Promise<ScheduleResult> {
    this.logger.log(`Scheduling auto-reveal: betId=${betId}, marketCloseAt=${marketCloseAt.toISOString()}`);

    const autoRevealTime = new Date(marketCloseAt);
    autoRevealTime.setDate(autoRevealTime.getDate() + 30);

    return this.scheduleTransaction({
      handlerPath: '/storage/AutoRevealHandler',
      data: { betId, userAddress },
      executeAt: autoRevealTime,
      priority: 'Medium',
      executionEffort: 1000,
      signerAddress: process.env.FLOW_ADMIN_ADDRESS || '',
    });
  }

  async scheduleAutoSettlement(
    marketId: number,
    marketCloseAt: Date,
  ): Promise<ScheduleResult> {
    this.logger.log(`Scheduling auto-settlement: marketId=${marketId}, closeAt=${marketCloseAt.toISOString()}`);

    const settlementTime = new Date(marketCloseAt);
    settlementTime.setHours(settlementTime.getHours() + 24);

    return this.scheduleTransaction({
      handlerPath: '/storage/AutoSettlementHandler',
      data: { marketId },
      executeAt: settlementTime,
      priority: 'High',
      executionEffort: 2000,
      signerAddress: process.env.FLOW_ADMIN_ADDRESS || '',
    });
  }

  async cancelScheduledTransaction(scheduledTxId: string, signerAddress: string): Promise<boolean> {
    this.logger.log(`Cancelling scheduled transaction: ${scheduledTxId}`);

    try {
      await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/cancelScheduledTransaction.cdc',
        signer: signerAddress,
        arguments: [
          { type: 'String', value: scheduledTxId },
        ],
        network: 'testnet',
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel scheduled transaction: ${error.message}`, error.stack);
      return false;
    }
  }

  async getScheduledTransactionStatus(scheduledTxId: string): Promise<any> {
    this.logger.log(`Getting status for scheduled transaction: ${scheduledTxId}`);

    try {
      const result = await this.flowTxService.executeScript({
        scriptPath: './contracts/cadence/scripts/getScheduledTransactionStatus.cdc',
        arguments: [
          { type: 'String', value: scheduledTxId },
        ],
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to get scheduled transaction status: ${error.message}`, error.stack);
      return null;
    }
  }
}
