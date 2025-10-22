import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";

import {
  AiSportsTransactionProvider,
  TransactionResult,
  TransferJuiceParams,
  BetWithJuiceParams,
  ClaimRewardParams,
  CreateContestParams,
  DepositToEscrowParams,
  WithdrawFromEscrowParams,
  LockNFTParams,
  UnlockNFTParams,
  StakeJuiceParams,
  UnstakeJuiceParams,
} from "./transaction-provider.interface";

interface MockBalance {
  juice: number;
  flow: number;
}

interface MockTransaction extends TransactionResult {
  params: unknown;
  type: string;
}

/**
 * Mock Transaction Provider for Development and Demonstration
 * 
 * Simulates blockchain transactions with realistic behavior:
 * - Random transaction IDs
 * - Network delays (500-2000ms)
 * - Occasional failures (5% rate)
 * - Balance tracking
 * - Event emission
 * - Transaction history
 * 
 * This provider enables full-stack development and demonstration
 * without requiring actual blockchain access or tokens.
 */
@Injectable()
export class MockAiSportsProvider implements AiSportsTransactionProvider {
  private readonly logger = new Logger(MockAiSportsProvider.name);
  private readonly transactions = new Map<string, MockTransaction>();
  private readonly balances = new Map<string, MockBalance>();
  private blockHeight = 1000000;

  constructor() {
    this.logger.log("Mock Transaction Provider initialized");
    this.initializeMockBalances();
  }

  getMode(): 'mock' | 'testnet' | 'mainnet' {
    return 'mock';
  }

  isAvailable(): boolean {
    return true;
  }

  async transferJuice(params: TransferJuiceParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Transfer JUICE: ${params.amount} from ${params.from} to ${params.to}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();
    const shouldFail = this.shouldSimulateFailure();

    if (shouldFail) {
      return this.createFailedTransaction(txId, "Insufficient JUICE balance", params, "TRANSFER_JUICE");
    }

    this.updateMockBalance(params.from, -params.amount, 0);
    this.updateMockBalance(params.to, params.amount, 0);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'JuiceTransferred',
          data: {
            from: params.from,
            to: params.to,
            amount: params.amount,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "TRANSFER_JUICE");
    return result;
  }

  async betWithJuice(params: BetWithJuiceParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Bet with JUICE: ${params.amount} on ${params.outcome} in market ${params.marketId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();
    const shouldFail = this.shouldSimulateFailure();

    if (shouldFail) {
      return this.createFailedTransaction(txId, "Market not accepting bets", params, "BET_WITH_JUICE");
    }

    this.updateMockBalance(params.signer, -params.amount, 0);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'BetPlaced',
          data: {
            marketId: params.marketId,
            outcome: params.outcome,
            amount: params.amount,
            bettor: params.signer,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "BET_WITH_JUICE");
    return result;
  }

  async claimReward(params: ClaimRewardParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Claim reward: ${params.amount} for market ${params.marketId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();

    this.updateMockBalance(params.recipient, params.amount, 0);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'RewardClaimed',
          data: {
            marketId: params.marketId,
            recipient: params.recipient,
            amount: params.amount,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "CLAIM_REWARD");
    return result;
  }

  async createContest(params: CreateContestParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Create contest: ${params.title} with prize pool ${params.prizePool}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();
    const contestId = this.generateContestId();

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'ContestCreated',
          data: {
            contestId,
            title: params.title,
            prizePool: params.prizePool,
            entryFee: params.entryFee,
            startTime: params.startTime.toISOString(),
            endTime: params.endTime.toISOString(),
          },
        },
      ],
    };

    this.storeTransaction(result, params, "CREATE_CONTEST");
    return result;
  }

  async depositToEscrow(params: DepositToEscrowParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Deposit to escrow: ${params.amount} to contest ${params.contestId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();

    this.updateMockBalance(params.depositor, 0, -params.amount);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'EscrowDeposited',
          data: {
            contestId: params.contestId,
            amount: params.amount,
            depositor: params.depositor,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "DEPOSIT_ESCROW");
    return result;
  }

  async withdrawFromEscrow(params: WithdrawFromEscrowParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Withdraw from escrow: ${params.amount} from contest ${params.contestId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();

    this.updateMockBalance(params.recipient, 0, params.amount);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'EscrowWithdrawn',
          data: {
            contestId: params.contestId,
            amount: params.amount,
            recipient: params.recipient,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "WITHDRAW_ESCROW");
    return result;
  }

  async lockNFT(params: LockNFTParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Lock NFT: ${params.nftId} for market ${params.marketId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'NFTLocked',
          data: {
            nftId: params.nftId,
            marketId: params.marketId,
            owner: params.owner,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "LOCK_NFT");
    return result;
  }

  async unlockNFT(params: UnlockNFTParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Unlock NFT: ${params.nftId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'NFTUnlocked',
          data: {
            nftId: params.nftId,
            owner: params.owner,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "UNLOCK_NFT");
    return result;
  }

  async stakeJuice(params: StakeJuiceParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Stake JUICE: ${params.amount} for ${params.duration}s`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();
    const stakeId = this.generateStakeId();

    this.updateMockBalance(params.staker, -params.amount, 0);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'JuiceStaked',
          data: {
            stakeId,
            amount: params.amount,
            staker: params.staker,
            duration: params.duration,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "STAKE_JUICE");
    return result;
  }

  async unstakeJuice(params: UnstakeJuiceParams): Promise<TransactionResult> {
    this.logger.log(`[MOCK] Unstake JUICE: stake ${params.stakeId}`);

    await this.simulateNetworkDelay();

    const txId = this.generateTxId();
    const rewardAmount = 100;

    this.updateMockBalance(params.staker, rewardAmount, 0);

    const result: TransactionResult = {
      txId,
      status: 'sealed',
      timestamp: new Date(),
      blockHeight: this.getNextBlockHeight(),
      events: [
        {
          type: 'JuiceUnstaked',
          data: {
            stakeId: params.stakeId,
            staker: params.staker,
            reward: rewardAmount,
          },
        },
      ],
    };

    this.storeTransaction(result, params, "UNSTAKE_JUICE");
    return result;
  }

  async getTransactionStatus(txId: string): Promise<TransactionResult> {
    const tx = this.transactions.get(txId);
    
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }

    return {
      txId: tx.txId,
      status: tx.status,
      timestamp: tx.timestamp,
      blockHeight: tx.blockHeight,
      error: tx.error,
      events: tx.events,
    };
  }

  getMockBalance(address: string): MockBalance {
    return this.balances.get(address) || { juice: 0, flow: 0 };
  }

  getTransactionHistory(address?: string): MockTransaction[] {
    const allTxs = Array.from(this.transactions.values());
    
    if (!address) {
      return allTxs;
    }

    return allTxs.filter((tx) => {
      const params = tx.params as Record<string, unknown>;
      return (
        params.from === address ||
        params.to === address ||
        params.signer === address ||
        params.recipient === address ||
        params.owner === address ||
        params.depositor === address ||
        params.staker === address
      );
    });
  }

  private generateTxId(): string {
    return `0x${randomBytes(32).toString('hex')}`;
  }

  private generateContestId(): string {
    return `contest_${randomBytes(8).toString('hex')}`;
  }

  private generateStakeId(): string {
    return `stake_${randomBytes(8).toString('hex')}`;
  }

  private getNextBlockHeight(): number {
    return ++this.blockHeight;
  }

  private async simulateNetworkDelay(): Promise<void> {
    const delay = Math.random() * 1500 + 500;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  private shouldSimulateFailure(): boolean {
    return Math.random() < 0.05;
  }

  private createFailedTransaction(
    txId: string,
    error: string,
    params: unknown,
    type: string
  ): TransactionResult {
    const result: TransactionResult = {
      txId,
      status: 'failed',
      timestamp: new Date(),
      error,
    };

    this.storeTransaction(result, params, type);
    return result;
  }

  private storeTransaction(result: TransactionResult, params: unknown, type: string): void {
    const tx: MockTransaction = {
      ...result,
      params,
      type,
    };
    this.transactions.set(result.txId, tx);
  }

  private updateMockBalance(address: string, juiceDelta: number, flowDelta: number): void {
    const current = this.getMockBalance(address);
    this.balances.set(address, {
      juice: Math.max(0, current.juice + juiceDelta),
      flow: Math.max(0, current.flow + flowDelta),
    });
  }

  private initializeMockBalances(): void {
    const testAddresses = [
      '0x1234567890abcdef',
      '0xabcdef1234567890',
      '0x0123456789abcdef',
    ];

    testAddresses.forEach((address) => {
      this.balances.set(address, {
        juice: 10000,
        flow: 1000,
      });
    });

    this.logger.log(`Initialized ${testAddresses.length} mock accounts with balances`);
  }
}
