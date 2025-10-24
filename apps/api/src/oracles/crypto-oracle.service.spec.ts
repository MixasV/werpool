import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';

import { CryptoOracleService } from './crypto-oracle.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CryptoOracleService', () => {
  let service: CryptoOracleService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockSnapshot = {
    id: 'snap-1',
    type: 'CRYPTO',
    assetSymbol: 'BTC',
    priceUsd: 42000,
    sourceTag: 'aggregated',
    sources: [
      { source: 'coingecko', priceUsd: 42100, observedAt: '2025-01-15T10:00:00Z' },
      { source: 'binance', priceUsd: 41900, observedAt: '2025-01-15T10:00:00Z' },
    ],
    observedAt: new Date('2025-01-15T10:00:00Z'),
    publishedBy: null,
    signature: 'mock-signature',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      oracleSnapshot: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoOracleService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CryptoOracleService>(CryptoOracleService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('publishQuote', () => {
    it('should publish quote from multiple sources', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      const result = await service.publishQuote({
        assetSymbol: 'BTC',
        sources: ['coingecko', 'binance'],
      });

      expect(result.assetSymbol).toBe('BTC');
      expect(prismaService.oracleSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'CRYPTO',
          assetSymbol: 'BTC',
        }),
      });
    });

    it('should use manual price override when provided', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      await service.publishQuote({
        assetSymbol: 'BTC',
        priceOverride: 45000,
      });

      expect(prismaService.oracleSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priceUsd: expect.any(Number),
        }),
      });
    });

    it('should normalize asset symbols to uppercase', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      await service.publishQuote({
        assetSymbol: 'btc',
      });

      expect(prismaService.oracleSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetSymbol: 'BTC',
        }),
      });
    });

    it('should throw error when no quotes available', async () => {
      await expect(
        service.publishQuote({
          assetSymbol: 'INVALID',
          sources: [],
        })
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should aggregate prices from multiple sources', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue({
        ...mockSnapshot,
        priceUsd: 42000, // Average of 42100 and 41900
      } as any);

      const result = await service.publishQuote({
        assetSymbol: 'BTC',
        sources: ['coingecko', 'binance'],
      });

      expect(result.priceUsd).toBeGreaterThan(0);
    });

    it('should include publishedBy when provided', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      await service.publishQuote({
        assetSymbol: 'BTC',
        publishedBy: '0xadmin',
      });

      expect(prismaService.oracleSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          publishedBy: '0xadmin',
        }),
      });
    });

    it('should use fallback price when sources unavailable', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      const result = await service.publishQuote({
        assetSymbol: 'BTC',
        sources: [],
      });

      expect(result).toBeDefined();
    });
  });

  describe('getLatestQuote', () => {
    it('should return latest quote for asset', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(
        mockSnapshot as any
      );

      const result = await service.getLatestQuote('BTC');

      expect(result).toBeDefined();
      expect(result?.assetSymbol).toBe('BTC');
      expect(prismaService.oracleSnapshot.findFirst).toHaveBeenCalledWith({
        where: {
          type: 'CRYPTO',
          assetSymbol: 'BTC',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return null when no quotes exist', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getLatestQuote('BTC');

      expect(result).toBeNull();
    });

    it('should normalize asset symbol', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(
        mockSnapshot as any
      );

      await service.getLatestQuote('btc');

      expect(prismaService.oracleSnapshot.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          assetSymbol: 'BTC',
        }),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should include all quote fields', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(
        mockSnapshot as any
      );

      const result = await service.getLatestQuote('BTC');

      expect(result).toHaveProperty('priceUsd');
      expect(result).toHaveProperty('observedAt');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('signature');
    });
  });

  describe('getHistoricalQuotes', () => {
    it('should return quotes within time range', async () => {
      prismaService.oracleSnapshot.findMany.mockResolvedValue([
        mockSnapshot,
      ] as any);

      const from = new Date('2025-01-14T00:00:00Z');
      const to = new Date('2025-01-16T00:00:00Z');

      const result = await service.getHistoricalQuotes({
        assetSymbol: 'BTC',
        from,
        to,
      });

      expect(result).toHaveLength(1);
      expect(prismaService.oracleSnapshot.findMany).toHaveBeenCalledWith({
        where: {
          type: 'CRYPTO',
          assetSymbol: 'BTC',
          observedAt: {
            gte: from,
            lte: to,
          },
        },
        orderBy: { observedAt: 'asc' },
        take: 100,
      });
    });

    it('should respect limit parameter', async () => {
      prismaService.oracleSnapshot.findMany.mockResolvedValue([]);

      await service.getHistoricalQuotes({
        assetSymbol: 'BTC',
        limit: 50,
      });

      expect(prismaService.oracleSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should return empty array when no quotes in range', async () => {
      prismaService.oracleSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getHistoricalQuotes({
        assetSymbol: 'BTC',
        from: new Date('2020-01-01'),
        to: new Date('2020-01-02'),
      });

      expect(result).toEqual([]);
    });

    it('should cap limit at maximum allowed', async () => {
      prismaService.oracleSnapshot.findMany.mockResolvedValue([]);

      await service.getHistoricalQuotes({
        assetSymbol: 'BTC',
        limit: 10000,
      });

      expect(prismaService.oracleSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1000, // Maximum limit
        })
      );
    });
  });

  describe('getCurrentPrice', () => {
    it('should return current price for asset', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(
        mockSnapshot as any
      );

      const result = await service.getCurrentPrice('BTC');

      expect(result).toBe(42000);
    });

    it('should return null when no price available', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentPrice('INVALID');

      expect(result).toBeNull();
    });

    it('should normalize asset symbol', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(
        mockSnapshot as any
      );

      await service.getCurrentPrice('eth');

      expect(prismaService.oracleSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assetSymbol: 'ETH',
          }),
        })
      );
    });
  });

  describe('getHistoricalPrice', () => {
    it('should return price at specific timestamp', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue({
        ...mockSnapshot,
        priceUsd: 43000,
      } as any);

      const timestamp = new Date('2025-01-15T12:00:00Z');
      const result = await service.getHistoricalPrice('BTC', timestamp);

      expect(result).toEqual({
        price: 43000,
        timestamp: expect.any(Date),
      });
    });

    it('should return null when no price at timestamp', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(null);

      const timestamp = new Date('2020-01-01T00:00:00Z');
      const result = await service.getHistoricalPrice('BTC', timestamp);

      expect(result).toBeNull();
    });

    it('should find closest price before timestamp', async () => {
      prismaService.oracleSnapshot.findFirst.mockResolvedValue(
        mockSnapshot as any
      );

      const timestamp = new Date('2025-01-15T12:00:00Z');
      await service.getHistoricalPrice('BTC', timestamp);

      expect(prismaService.oracleSnapshot.findFirst).toHaveBeenCalledWith({
        where: {
          type: 'CRYPTO',
          assetSymbol: 'BTC',
          observedAt: {
            lte: timestamp,
          },
        },
        orderBy: { observedAt: 'desc' },
      });
    });
  });

  describe('supported assets', () => {
    it('should support BTC, ETH, SOL, FLOW', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      const assets = ['BTC', 'ETH', 'SOL', 'FLOW'];

      for (const asset of assets) {
        await service.publishQuote({ assetSymbol: asset });

        expect(prismaService.oracleSnapshot.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            assetSymbol: asset,
          }),
        });

        prismaService.oracleSnapshot.create.mockClear();
      }
    });
  });

  describe('signature generation', () => {
    it('should include signature in published quote', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      await service.publishQuote({ assetSymbol: 'BTC' });

      expect(prismaService.oracleSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          signature: expect.any(String),
        }),
      });
    });

    it('should generate consistent signatures', async () => {
      prismaService.oracleSnapshot.create.mockResolvedValue(
        mockSnapshot as any
      );

      const result1 = await service.publishQuote({
        assetSymbol: 'BTC',
        priceOverride: 42000,
      });

      const result2 = await service.publishQuote({
        assetSymbol: 'BTC',
        priceOverride: 42000,
      });

      expect(result1.signature).toBeDefined();
      expect(result2.signature).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      prismaService.oracleSnapshot.create.mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        service.publishQuote({ assetSymbol: 'BTC', priceOverride: 42000 })
      ).rejects.toThrow('DB error');
    });

    it('should handle invalid price values', async () => {
      await expect(
        service.publishQuote({
          assetSymbol: 'BTC',
          priceOverride: NaN,
        })
      ).rejects.toThrow();
    });

    it('should handle empty asset symbol', async () => {
      await expect(
        service.publishQuote({
          assetSymbol: '',
        })
      ).rejects.toThrow();
    });
  });
});
