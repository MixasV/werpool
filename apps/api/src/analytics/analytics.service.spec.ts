import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { FindLabsClient } from './find-labs.client';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prismaService: jest.Mocked<PrismaService>;
  let findLabsClient: jest.Mocked<FindLabsClient>;

  const mockMarket = {
    id: 'market-1',
    slug: 'test-market',
    title: 'Test Market',
    settlement: {
      txId: '0xtx123',
      resolvedOutcomeId: 'outcome-1',
      settledAt: new Date('2025-01-15'),
      notes: 'Settlement complete',
    },
  };

  const mockTrade = {
    id: 'trade-1',
    marketId: 'market-1',
    signer: '0xtrader',
    flowAmount: '100.50',
    createdAt: new Date('2025-01-10T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      market: {
        findUnique: jest.fn(),
      },
      marketTrade: {
        findMany: jest.fn(),
      },
    };

    const mockFindLabsClient = {
      getTransaction: jest.fn(),
      search: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FindLabsClient, useValue: mockFindLabsClient },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prismaService = module.get(PrismaService);
    findLabsClient = module.get(FindLabsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMarketTransactionHistory', () => {
    it('should return trades for valid market', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.marketTrade.findMany.mockResolvedValue([mockTrade] as any);

      const result = await service.getMarketTransactionHistory('market-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trade-1');
      expect(prismaService.market.findUnique).toHaveBeenCalledWith({
        where: { id: 'market-1' },
      });
      expect(prismaService.marketTrade.findMany).toHaveBeenCalledWith({
        where: { marketId: 'market-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should throw NotFoundException if market not found', async () => {
      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(
        service.getMarketTransactionHistory('invalid')
      ).rejects.toThrow(NotFoundException);
    });

    it('should limit results to 100 trades', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.marketTrade.findMany.mockResolvedValue([]);

      await service.getMarketTransactionHistory('market-1');

      expect(prismaService.marketTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('getSettlementProof', () => {
    it('should return settlement proof with transaction details', async () => {
      const mockTxDetails = {
        blockHeight: 12345,
        timestamp: '2025-01-15T12:00:00Z',
        events: [{ type: 'MarketSettled' }],
      };

      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      findLabsClient.getTransaction.mockResolvedValue(mockTxDetails as any);

      const result = await service.getSettlementProof('market-1');

      expect(result.txId).toBe('0xtx123');
      expect(result.blockHeight).toBe(12345);
      expect(result.winningOutcome).toBe('outcome-1');
      expect(result.notes).toBe('Settlement complete');
      expect(findLabsClient.getTransaction).toHaveBeenCalledWith('0xtx123');
    });

    it('should fallback to settlement date if Find Labs fails', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      findLabsClient.getTransaction.mockResolvedValue(null);

      const result = await service.getSettlementProof('market-1');

      expect(result.txId).toBe('0xtx123');
      expect(result.timestamp).toEqual(mockMarket.settlement.settledAt);
    });

    it('should throw NotFoundException if settlement not found', async () => {
      const marketWithoutSettlement = { ...mockMarket, settlement: null };
      prismaService.market.findUnique.mockResolvedValue(
        marketWithoutSettlement as any
      );

      await expect(service.getSettlementProof('market-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw NotFoundException if market not found', async () => {
      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(service.getSettlementProof('invalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getTradingVolumeAnalytics', () => {
    it('should calculate total volume and trade count', async () => {
      const trades = [
        { ...mockTrade, flowAmount: '100.00' },
        { ...mockTrade, id: 'trade-2', flowAmount: '200.50' },
        { ...mockTrade, id: 'trade-3', flowAmount: '50.75' },
      ];
      prismaService.marketTrade.findMany.mockResolvedValue(trades as any);

      const result = await service.getTradingVolumeAnalytics({});

      expect(result.totalVolume).toBe(351.25);
      expect(result.tradeCount).toBe(3);
      expect(result.avgTradeSize).toBeCloseTo(117.08, 2);
    });

    it('should filter by marketId', async () => {
      prismaService.marketTrade.findMany.mockResolvedValue([]);

      await service.getTradingVolumeAnalytics({ marketId: 'market-1' });

      expect(prismaService.marketTrade.findMany).toHaveBeenCalledWith({
        where: { marketId: 'market-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle zero trades', async () => {
      prismaService.marketTrade.findMany.mockResolvedValue([]);

      const result = await service.getTradingVolumeAnalytics({});

      expect(result.totalVolume).toBe(0);
      expect(result.tradeCount).toBe(0);
      expect(result.avgTradeSize).toBe(0);
    });

    it('should aggregate volume by day', async () => {
      const trades = [
        {
          ...mockTrade,
          createdAt: new Date('2025-01-10T10:00:00Z'),
          flowAmount: '100.00',
        },
        {
          ...mockTrade,
          id: 'trade-2',
          createdAt: new Date('2025-01-10T15:00:00Z'),
          flowAmount: '50.00',
        },
        {
          ...mockTrade,
          id: 'trade-3',
          createdAt: new Date('2025-01-11T10:00:00Z'),
          flowAmount: '200.00',
        },
      ];
      prismaService.marketTrade.findMany.mockResolvedValue(trades as any);

      const result = await service.getTradingVolumeAnalytics({});

      expect(result.volumeByDay).toHaveLength(2);
      expect(result.volumeByDay[0]).toMatchObject({
        date: '2025-01-10',
        volume: 150,
      });
      expect(result.volumeByDay[1]).toMatchObject({
        date: '2025-01-11',
        volume: 200,
      });
    });
  });

  describe('getUserActivityDashboard', () => {
    it('should return user activity metrics', async () => {
      const userTrades = [
        { ...mockTrade, marketId: 'market-1', flowAmount: '100.00' },
        { ...mockTrade, id: 'trade-2', marketId: 'market-2', flowAmount: '200.00' },
        { ...mockTrade, id: 'trade-3', marketId: 'market-1', flowAmount: '50.00' },
      ];
      prismaService.marketTrade.findMany.mockResolvedValue(userTrades as any);

      const result = await service.getUserActivityDashboard('0xtrader');

      expect(result.totalTrades).toBe(3);
      expect(result.totalVolume).toBe(350);
      expect(result.marketsParticipated).toBe(2);
      expect(result.recentActivity).toHaveLength(3);
    });

    it('should limit recent activity to 10 trades', async () => {
      const manyTrades = Array.from({ length: 20 }, (_, i) => ({
        ...mockTrade,
        id: `trade-${i}`,
      }));
      prismaService.marketTrade.findMany.mockResolvedValue(manyTrades as any);

      const result = await service.getUserActivityDashboard('0xtrader');

      expect(result.recentActivity).toHaveLength(10);
    });

    it('should handle user with no trades', async () => {
      prismaService.marketTrade.findMany.mockResolvedValue([]);

      const result = await service.getUserActivityDashboard('0xnewuser');

      expect(result.totalTrades).toBe(0);
      expect(result.totalVolume).toBe(0);
      expect(result.marketsParticipated).toBe(0);
      expect(result.recentActivity).toHaveLength(0);
    });

    it('should query trades by user address', async () => {
      prismaService.marketTrade.findMany.mockResolvedValue([]);

      await service.getUserActivityDashboard('0xuser123');

      expect(prismaService.marketTrade.findMany).toHaveBeenCalledWith({
        where: { signer: '0xuser123' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('search', () => {
    it('should delegate to FindLabsClient', async () => {
      const searchResults = [{ type: 'transaction', data: {} }];
      findLabsClient.search.mockResolvedValue(searchResults);

      const result = await service.search('0xtxhash');

      expect(result).toEqual(searchResults);
      expect(findLabsClient.search).toHaveBeenCalledWith('0xtxhash');
    });
  });
});
