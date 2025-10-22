import { Test, TestingModule } from '@nestjs/testing';
import { MarketState } from '@prisma/client';

import { MarketPoolStateService } from './market-pool-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { FlowMarketService } from './flow/flow-market.service';

describe('MarketPoolStateService', () => {
  let service: MarketPoolStateService;
  let prismaService: jest.Mocked<PrismaService>;
  let flowMarketService: jest.Mocked<FlowMarketService>;

  const mockMarket = {
    id: 'market-1',
    slug: 'test-market',
    state: MarketState.OPEN,
    outcomes: ['Yes', 'No'],
  };

  const mockPoolState = {
    reserves: [100, 200],
    liquidity: 300,
    b: 150,
    totalShares: [50, 100],
    lastSyncedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      market: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      marketPoolState: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const mockFlowMarketService = {
      getPoolState: jest.fn(),
      syncPoolState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketPoolStateService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FlowMarketService, useValue: mockFlowMarketService },
      ],
    }).compile();

    service = module.get<MarketPoolStateService>(MarketPoolStateService);
    prismaService = module.get(PrismaService);
    flowMarketService = module.get(FlowMarketService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPoolState', () => {
    it('should return cached pool state', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(
        mockPoolState as any
      );

      const result = await service.getPoolState('market-1');

      expect(result.reserves).toEqual([100, 200]);
      expect(result.liquidity).toBe(300);
      expect(prismaService.marketPoolState.findUnique).toHaveBeenCalledWith({
        where: { marketId: 'market-1' },
      });
    });

    it('should return null when no state exists', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(null);

      const result = await service.getPoolState('market-1');

      expect(result).toBeNull();
    });

    it('should convert Decimal to number', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue({
        ...mockPoolState,
        b: { toNumber: () => 150 },
      } as any);

      const result = await service.getPoolState('market-1');

      expect(typeof result?.b).toBe('number');
    });
  });

  describe('syncPoolState', () => {
    it('should sync state from blockchain', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      flowMarketService.getPoolState.mockResolvedValue(mockPoolState);
      prismaService.marketPoolState.upsert.mockResolvedValue(
        mockPoolState as any
      );

      const result = await service.syncPoolState('market-1');

      expect(result.reserves).toEqual([100, 200]);
      expect(flowMarketService.getPoolState).toHaveBeenCalledWith('test-market');
      expect(prismaService.marketPoolState.upsert).toHaveBeenCalled();
    });

    it('should throw when market not found', async () => {
      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(service.syncPoolState('invalid-id')).rejects.toThrow(
        'Market not found'
      );
    });

    it('should update lastSyncedAt', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      flowMarketService.getPoolState.mockResolvedValue(mockPoolState);
      prismaService.marketPoolState.upsert.mockResolvedValue(
        mockPoolState as any
      );

      await service.syncPoolState('market-1');

      expect(prismaService.marketPoolState.upsert).toHaveBeenCalledWith({
        where: { marketId: 'market-1' },
        create: expect.objectContaining({
          lastSyncedAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          lastSyncedAt: expect.any(Date),
        }),
      });
    });

    it('should handle blockchain errors', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      flowMarketService.getPoolState.mockRejectedValue(
        new Error('Blockchain unavailable')
      );

      await expect(service.syncPoolState('market-1')).rejects.toThrow(
        'Blockchain unavailable'
      );
    });
  });

  describe('calculateProbabilities', () => {
    it('should calculate probabilities from reserves', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue({
        ...mockPoolState,
        reserves: [100, 200],
        b: 150,
      } as any);

      const result = await service.calculateProbabilities('market-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(1);
      expect(result[1]).toBeGreaterThan(0);
      expect(result[1]).toBeLessThan(1);
    });

    it('should sum to 1', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue({
        ...mockPoolState,
        reserves: [100, 200],
        b: 150,
      } as any);

      const result = await service.calculateProbabilities('market-1');
      const sum = result.reduce((a, b) => a + b, 0);

      expect(sum).toBeCloseTo(1, 5);
    });

    it('should return null when no state', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(null);

      const result = await service.calculateProbabilities('market-1');

      expect(result).toBeNull();
    });
  });

  describe('getReserve', () => {
    it('should return reserve for outcome', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(
        mockPoolState as any
      );

      const result = await service.getReserve('market-1', 0);

      expect(result).toBe(100);
    });

    it('should return null for invalid outcome index', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(
        mockPoolState as any
      );

      const result = await service.getReserve('market-1', 5);

      expect(result).toBeNull();
    });

    it('should return null when no state', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(null);

      const result = await service.getReserve('market-1', 0);

      expect(result).toBeNull();
    });
  });

  describe('getTotalLiquidity', () => {
    it('should return total liquidity', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(
        mockPoolState as any
      );

      const result = await service.getTotalLiquidity('market-1');

      expect(result).toBe(300);
    });

    it('should return zero when no state', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(null);

      const result = await service.getTotalLiquidity('market-1');

      expect(result).toBe(0);
    });
  });

  describe('needsSync', () => {
    it('should return true when never synced', async () => {
      prismaService.marketPoolState.findUnique.mockResolvedValue(null);

      const result = await service.needsSync('market-1');

      expect(result).toBe(true);
    });

    it('should return true when synced long ago', async () => {
      const oldSync = new Date(Date.now() - 3600000); // 1 hour ago
      prismaService.marketPoolState.findUnique.mockResolvedValue({
        ...mockPoolState,
        lastSyncedAt: oldSync,
      } as any);

      const result = await service.needsSync('market-1', 60000); // 1 minute threshold

      expect(result).toBe(true);
    });

    it('should return false when recently synced', async () => {
      const recentSync = new Date(Date.now() - 30000); // 30 seconds ago
      prismaService.marketPoolState.findUnique.mockResolvedValue({
        ...mockPoolState,
        lastSyncedAt: recentSync,
      } as any);

      const result = await service.needsSync('market-1', 60000);

      expect(result).toBe(false);
    });
  });
});
