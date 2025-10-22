import { Test, TestingModule } from '@nestjs/testing';
import { MarketAnalyticsInterval } from '@prisma/client';

import { MarketAnalyticsService } from './market-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketUpdatesGateway } from './market-updates.gateway';

describe('MarketAnalyticsService', () => {
  let service: MarketAnalyticsService;
  let prismaService: jest.Mocked<PrismaService>;
  let updatesGateway: jest.Mocked<MarketUpdatesGateway>;

  const mockSnapshot = {
    id: 'snap-1',
    marketId: 'market-1',
    outcomeId: 'outcome-1',
    outcomeIndex: 0,
    outcomeLabel: 'Yes',
    interval: MarketAnalyticsInterval.HOUR,
    bucketStart: new Date('2025-01-15T10:00:00Z'),
    bucketEnd: new Date('2025-01-15T11:00:00Z'),
    openPrice: 0.45,
    closePrice: 0.47,
    highPrice: 0.48,
    lowPrice: 0.44,
    averagePrice: 0.46,
    volumeShares: 1000,
    volumeFlow: 460,
    netFlow: 20,
    tradeCount: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTrade = {
    tradeId: 'trade-1',
    marketId: 'market-1',
    marketSlug: 'test-market',
    outcomeId: 'outcome-1',
    outcomeIndex: 0,
    outcomeLabel: 'Yes',
    probability: 0.47,
    shares: 100,
    flowAmount: 47,
    isBuy: true,
    occurredAt: new Date('2025-01-15T10:30:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      marketAnalyticsSnapshot: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrismaService)),
    };

    const mockUpdatesGateway = {
      emitAnalyticsSnapshot: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketAnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MarketUpdatesGateway, useValue: mockUpdatesGateway },
      ],
    }).compile();

    service = module.get<MarketAnalyticsService>(MarketAnalyticsService);
    prismaService = module.get(PrismaService);
    updatesGateway = module.get(MarketUpdatesGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordTrade', () => {
    it('should create snapshot for trade', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(mockTrade);

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });

    it('should skip when probability is null', async () => {
      await service.recordTrade({
        ...mockTrade,
        probability: null,
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).not.toHaveBeenCalled();
    });

    it('should skip when probability is NaN', async () => {
      await service.recordTrade({
        ...mockTrade,
        probability: NaN,
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).not.toHaveBeenCalled();
    });

    it('should create snapshots for both HOUR and DAY intervals', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(mockTrade);

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalledTimes(
        2
      );
    });

    it('should emit analytics snapshot via gateway', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(mockTrade);

      expect(updatesGateway.emitAnalyticsSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-1',
          outcomeIndex: 0,
        })
      );
    });

    it('should handle upsert errors gracefully', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockRejectedValue(
        new Error('DB error')
      );

      await expect(service.recordTrade(mockTrade)).resolves.not.toThrow();
    });

    it('should track buy trades correctly', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade({
        ...mockTrade,
        isBuy: true,
        flowAmount: 47,
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });

    it('should track sell trades correctly', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade({
        ...mockTrade,
        isBuy: false,
        flowAmount: -47,
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });
  });

  describe('getSnapshots', () => {
    it('should return snapshots for market and interval', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([
        mockSnapshot,
      ] as any);

      const result = await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.HOUR,
      });

      expect(result).toHaveLength(1);
      expect(result[0].marketId).toBe('market-1');
      expect(prismaService.marketAnalyticsSnapshot.findMany).toHaveBeenCalledWith({
        where: {
          marketId: 'market-1',
          interval: MarketAnalyticsInterval.HOUR,
        },
        orderBy: { bucketStart: 'asc' },
        take: 100,
      });
    });

    it('should filter by outcome index', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([
        mockSnapshot,
      ] as any);

      await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.HOUR,
        outcomeIndex: 0,
      });

      expect(prismaService.marketAnalyticsSnapshot.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          outcomeIndex: 0,
        }),
        orderBy: { bucketStart: 'asc' },
        take: 100,
      });
    });

    it('should filter by time range', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([]);

      const from = new Date('2025-01-15T00:00:00Z');
      const to = new Date('2025-01-16T00:00:00Z');

      await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.DAY,
        from,
        to,
      });

      expect(prismaService.marketAnalyticsSnapshot.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          bucketStart: {
            gte: from,
            lte: to,
          },
        }),
        orderBy: { bucketStart: 'asc' },
        take: 100,
      });
    });

    it('should respect limit parameter', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([]);

      await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.HOUR,
        limit: 50,
      });

      expect(prismaService.marketAnalyticsSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should cap limit at 500', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([]);

      await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.HOUR,
        limit: 10000,
      });

      expect(prismaService.marketAnalyticsSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        })
      );
    });

    it('should return empty array when no snapshots', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.HOUR,
      });

      expect(result).toEqual([]);
    });
  });

  describe('snapshot aggregation', () => {
    it('should calculate OHLC prices correctly', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue({
        ...mockSnapshot,
        openPrice: 0.40,
        highPrice: 0.50,
        lowPrice: 0.38,
        closePrice: 0.47,
      } as any);

      await service.recordTrade(mockTrade);

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });

    it('should accumulate volume across trades', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue({
        ...mockSnapshot,
        volumeShares: 500,
        volumeFlow: 230,
      } as any);

      await service.recordTrade({
        ...mockTrade,
        shares: 500,
        flowAmount: 230,
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });

    it('should track net flow (buys - sells)', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue({
        ...mockSnapshot,
        netFlow: 100,
      } as any);

      await service.recordTrade({
        ...mockTrade,
        isBuy: true,
        flowAmount: 100,
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });

    it('should increment trade count', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue({
        ...mockSnapshot,
        tradeCount: 10,
      } as any);

      await service.recordTrade(mockTrade);

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });
  });

  describe('time bucket calculation', () => {
    it('should create hourly buckets correctly', async () => {
      const tradeAt10_30 = {
        ...mockTrade,
        occurredAt: new Date('2025-01-15T10:30:00Z'),
      };

      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(tradeAt10_30);

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });

    it('should create daily buckets correctly', async () => {
      const tradeAtNoon = {
        ...mockTrade,
        occurredAt: new Date('2025-01-15T12:00:00Z'),
      };

      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(tradeAtNoon);

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalled();
    });
  });

  describe('multiple outcomes', () => {
    it('should track each outcome separately', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade({
        ...mockTrade,
        outcomeIndex: 0,
        outcomeLabel: 'Yes',
      });

      await service.recordTrade({
        ...mockTrade,
        outcomeIndex: 1,
        outcomeLabel: 'No',
      });

      expect(prismaService.marketAnalyticsSnapshot.upsert).toHaveBeenCalledTimes(
        4
      ); // 2 trades × 2 intervals
    });

    it('should retrieve snapshots for specific outcome', async () => {
      prismaService.marketAnalyticsSnapshot.findMany.mockResolvedValue([
        mockSnapshot,
      ] as any);

      const result = await service.getSnapshots({
        marketId: 'market-1',
        interval: MarketAnalyticsInterval.HOUR,
        outcomeIndex: 1,
      });

      expect(prismaService.marketAnalyticsSnapshot.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          outcomeIndex: 1,
        }),
        orderBy: { bucketStart: 'asc' },
        take: 100,
      });
    });
  });

  describe('websocket integration', () => {
    it('should emit snapshot after recording trade', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(mockTrade);

      expect(updatesGateway.emitAnalyticsSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-1',
          slug: 'test-market',
        })
      );
    });

    it('should convert Prisma Decimal to number in emitted data', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockResolvedValue(
        mockSnapshot as any
      );

      await service.recordTrade(mockTrade);

      expect(updatesGateway.emitAnalyticsSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          openPrice: expect.any(Number),
          closePrice: expect.any(Number),
        })
      );
    });

    it('should not emit when upsert fails', async () => {
      prismaService.marketAnalyticsSnapshot.upsert.mockRejectedValue(
        new Error('DB error')
      );

      await service.recordTrade(mockTrade);

      expect(updatesGateway.emitAnalyticsSnapshot).not.toHaveBeenCalled();
    });
  });
});
