/**
 * Transaction Provider Interface for aiSports Integration
 * 
 * Abstraction layer for blockchain transactions supporting multiple execution modes:
 * - Mock: Simulated transactions for development and demonstration
 * - Testnet: Real transactions on Flow testnet
 * - Mainnet: Production transactions on Flow mainnet
 * 
 * This pattern enables:
 * 1. Easy switching between environments
 * 2. Testing without blockchain dependency
 * 3. Gradual migration from demo to production
 * 4. Clear separation of concerns
 */

export interface TransactionResult {
  readonly txId: string;
  readonly status: 'pending' | 'sealed' | 'failed';
  readonly timestamp: Date;
  readonly blockHeight?: number;
  readonly error?: string;
  readonly events?: Array<{
    readonly type: string;
    readonly data: Record<string, unknown>;
  }>;
}

export interface TransferJuiceParams {
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export interface BetWithJuiceParams {
  readonly marketId: string;
  readonly outcome: string;
  readonly amount: number;
  readonly signer: string;
}

export interface ClaimRewardParams {
  readonly marketId: string;
  readonly recipient: string;
  readonly amount: number;
}

export interface CreateContestParams {
  readonly title: string;
  readonly prizePool: number;
  readonly entryFee: number;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly maxParticipants?: number;
}

export interface DepositToEscrowParams {
  readonly contestId: string;
  readonly amount: number;
  readonly depositor: string;
}

export interface WithdrawFromEscrowParams {
  readonly contestId: string;
  readonly amount: number;
  readonly recipient: string;
}

export interface LockNFTParams {
  readonly nftId: string;
  readonly marketId: string;
  readonly owner: string;
}

export interface UnlockNFTParams {
  readonly nftId: string;
  readonly owner: string;
}

export interface StakeJuiceParams {
  readonly amount: number;
  readonly staker: string;
  readonly duration: number;
}

export interface UnstakeJuiceParams {
  readonly stakeId: string;
  readonly staker: string;
}

/**
 * Core interface for aiSports blockchain transaction execution.
 * 
 * All implementations must provide consistent behavior across:
 * - Transaction submission
 * - Status tracking
 * - Error handling
 * - Event emission
 */
export interface AiSportsTransactionProvider {
  /**
   * Transfer JUICE tokens between addresses
   */
  transferJuice(params: TransferJuiceParams): Promise<TransactionResult>;

  /**
   * Place a bet using JUICE tokens
   */
  betWithJuice(params: BetWithJuiceParams): Promise<TransactionResult>;

  /**
   * Claim rewards from a settled market
   */
  claimReward(params: ClaimRewardParams): Promise<TransactionResult>;

  /**
   * Create a new contest in escrow
   */
  createContest(params: CreateContestParams): Promise<TransactionResult>;

  /**
   * Deposit funds to contest escrow
   */
  depositToEscrow(params: DepositToEscrowParams): Promise<TransactionResult>;

  /**
   * Withdraw funds from contest escrow
   */
  withdrawFromEscrow(params: WithdrawFromEscrowParams): Promise<TransactionResult>;

  /**
   * Lock NFT for market participation
   */
  lockNFT(params: LockNFTParams): Promise<TransactionResult>;

  /**
   * Unlock NFT after market settlement
   */
  unlockNFT(params: UnlockNFTParams): Promise<TransactionResult>;

  /**
   * Stake JUICE tokens for rewards
   */
  stakeJuice(params: StakeJuiceParams): Promise<TransactionResult>;

  /**
   * Unstake JUICE tokens
   */
  unstakeJuice(params: UnstakeJuiceParams): Promise<TransactionResult>;

  /**
   * Get current status of a transaction
   */
  getTransactionStatus(txId: string): Promise<TransactionResult>;

  /**
   * Check if provider is available and ready to execute transactions
   */
  isAvailable(): boolean;

  /**
   * Get provider mode identifier
   */
  getMode(): 'mock' | 'testnet' | 'mainnet';
}
