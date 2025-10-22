import { MockAiSportsProvider } from "./mock-provider";
import {
  TransferJuiceParams,
  BetWithJuiceParams,
  ClaimRewardParams,
} from "./transaction-provider.interface";

describe("MockAiSportsProvider", () => {
  let provider: MockAiSportsProvider;

  beforeEach(() => {
    provider = new MockAiSportsProvider();
  });

  describe("initialization", () => {
    it("should be available", () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it("should return mock mode", () => {
      expect(provider.getMode()).toBe('mock');
    });

    it("should initialize mock balances", () => {
      const balance = provider.getMockBalance('0x1234567890abcdef');
      expect(balance.juice).toBe(10000);
      expect(balance.flow).toBe(1000);
    });
  });

  describe("transferJuice", () => {
    it("should transfer JUICE between accounts", async () => {
      const params: TransferJuiceParams = {
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 100,
      };

      const result = await provider.transferJuice(params);

      expect(result.txId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.status).toBe('sealed');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.blockHeight).toBeGreaterThan(0);
      expect(result.events).toHaveLength(1);
      expect(result.events?.[0].type).toBe('JuiceTransferred');
    });

    it("should update balances after transfer", async () => {
      const params: TransferJuiceParams = {
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 500,
      };

      const balanceBefore = provider.getMockBalance(params.from);
      await provider.transferJuice(params);
      const balanceAfter = provider.getMockBalance(params.from);

      expect(balanceAfter.juice).toBe(balanceBefore.juice - 500);
    });

    it("should generate unique transaction IDs", async () => {
      const params: TransferJuiceParams = {
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 10,
      };

      const result1 = await provider.transferJuice(params);
      const result2 = await provider.transferJuice(params);

      expect(result1.txId).not.toBe(result2.txId);
    });
  });

  describe("betWithJuice", () => {
    it("should place bet and deduct JUICE", async () => {
      const params: BetWithJuiceParams = {
        marketId: 'market-123',
        outcome: 'YES',
        amount: 200,
        signer: '0x1234567890abcdef',
      };

      const balanceBefore = provider.getMockBalance(params.signer);
      const result = await provider.betWithJuice(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('BetPlaced');
      
      const balanceAfter = provider.getMockBalance(params.signer);
      expect(balanceAfter.juice).toBe(balanceBefore.juice - 200);
    });

    it("should include bet details in events", async () => {
      const params: BetWithJuiceParams = {
        marketId: 'market-456',
        outcome: 'NO',
        amount: 150,
        signer: '0x1234567890abcdef',
      };

      const result = await provider.betWithJuice(params);
      const event = result.events?.[0];

      expect(event?.data.marketId).toBe('market-456');
      expect(event?.data.outcome).toBe('NO');
      expect(event?.data.amount).toBe(150);
    });
  });

  describe("claimReward", () => {
    it("should add reward to recipient balance", async () => {
      const params: ClaimRewardParams = {
        marketId: 'market-789',
        recipient: '0x1234567890abcdef',
        amount: 500,
      };

      const balanceBefore = provider.getMockBalance(params.recipient);
      const result = await provider.claimReward(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('RewardClaimed');

      const balanceAfter = provider.getMockBalance(params.recipient);
      expect(balanceAfter.juice).toBe(balanceBefore.juice + 500);
    });
  });

  describe("getTransactionStatus", () => {
    it("should return transaction details", async () => {
      const params: TransferJuiceParams = {
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 50,
      };

      const tx = await provider.transferJuice(params);
      const status = await provider.getTransactionStatus(tx.txId);

      expect(status.txId).toBe(tx.txId);
      expect(status.status).toBe('sealed');
      expect(status.timestamp).toEqual(tx.timestamp);
    });

    it("should throw error for unknown transaction", async () => {
      await expect(
        provider.getTransactionStatus('0xinvalid')
      ).rejects.toThrow('Transaction not found');
    });
  });

  describe("getTransactionHistory", () => {
    it("should return all transactions when no address provided", async () => {
      await provider.transferJuice({
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 10,
      });

      await provider.transferJuice({
        from: '0xabcdef1234567890',
        to: '0x0123456789abcdef',
        amount: 20,
      });

      const history = provider.getTransactionHistory();
      expect(history.length).toBe(2);
    });

    it("should filter transactions by address", async () => {
      const address = '0x1234567890abcdef';

      await provider.transferJuice({
        from: address,
        to: '0xabcdef1234567890',
        amount: 10,
      });

      await provider.transferJuice({
        from: '0xabcdef1234567890',
        to: '0x0123456789abcdef',
        amount: 20,
      });

      const history = provider.getTransactionHistory(address);
      expect(history.length).toBe(1);
      expect((history[0].params as TransferJuiceParams).from).toBe(address);
    });
  });

  describe("network simulation", () => {
    it("should simulate network delay", async () => {
      const start = Date.now();
      
      await provider.transferJuice({
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 10,
      });

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(500);
      expect(duration).toBeLessThan(3000);
    });

    it("should increment block height", async () => {
      const result1 = await provider.transferJuice({
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 10,
      });

      const result2 = await provider.transferJuice({
        from: '0x1234567890abcdef',
        to: '0xabcdef1234567890',
        amount: 10,
      });

      expect(result2.blockHeight).toBeGreaterThan(result1.blockHeight!);
    });
  });

  describe("createContest", () => {
    it("should create contest with generated ID", async () => {
      const params = {
        title: 'Test Contest',
        prizePool: 1000,
        entryFee: 10,
        startTime: new Date(),
        endTime: new Date(Date.now() + 86400000),
      };

      const result = await provider.createContest(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('ContestCreated');
      expect(result.events?.[0].data.contestId).toMatch(/^contest_[0-9a-f]+$/);
    });
  });

  describe("NFT operations", () => {
    it("should lock NFT", async () => {
      const params = {
        nftId: 'nft-12345',
        marketId: 'market-789',
        owner: '0x1234567890abcdef',
      };

      const result = await provider.lockNFT(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('NFTLocked');
    });

    it("should unlock NFT", async () => {
      const params = {
        nftId: 'nft-12345',
        owner: '0x1234567890abcdef',
      };

      const result = await provider.unlockNFT(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('NFTUnlocked');
    });
  });

  describe("staking operations", () => {
    it("should stake JUICE", async () => {
      const params = {
        amount: 500,
        staker: '0x1234567890abcdef',
        duration: 86400,
      };

      const balanceBefore = provider.getMockBalance(params.staker);
      const result = await provider.stakeJuice(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('JuiceStaked');
      expect(result.events?.[0].data.stakeId).toMatch(/^stake_[0-9a-f]+$/);

      const balanceAfter = provider.getMockBalance(params.staker);
      expect(balanceAfter.juice).toBe(balanceBefore.juice - 500);
    });

    it("should unstake JUICE with reward", async () => {
      const params = {
        stakeId: 'stake-123',
        staker: '0x1234567890abcdef',
      };

      const balanceBefore = provider.getMockBalance(params.staker);
      const result = await provider.unstakeJuice(params);

      expect(result.status).toBe('sealed');
      expect(result.events?.[0].type).toBe('JuiceUnstaked');

      const balanceAfter = provider.getMockBalance(params.staker);
      expect(balanceAfter.juice).toBeGreaterThan(balanceBefore.juice);
    });
  });
});
