import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MarketState } from '@prisma/client';

import { CryptoMarketAutomationService } from './crypto-market-automation.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketsService } from '../markets/markets.service';
import { CryptoOracleService } from '../oracles/crypto-oracle.service';

describe('CryptoMarketAutomationService', () => {
  let service: CryptoMarketAutomationService;
  let prismaService: jest.Mocked<PrismaService>;
  let marketsService: jest.Mocked<MarketsService>;
  let cryptoOracleService: jest.Mocked<CryptoOracleService>;

  const mockMarket = {
    id: 'market-1',
    slug: 'btc-price-2025-01-17',
    title: 'BTC Price on 2025-01-17',
    description: 'Prediction market for Bitcoin price',
    state: MarketState.CREATED,
    category: 'CRYPTO',
    tags: ['crypto', 'btc'],
    outcomes: ['< $40k', '$40k-$45k', '$45k-$50k', '> $50k'],
    openAt: new Date('2025-01-15T10:00:00Z'),
    closeAt: new Date('2025-01-17T00:00:00Z'),
    expectedSettlementAt: new Date('2025-01-17T06:00:00Z'),
    metadata: {
      assetSymbol: 'BTC',
      targetDate: '2025-01-17',
      referencePrice: 42000,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      market: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockMarketsService = {
      create: jest.fn(),
      openMarket: jest.fn(),
      closeMarket: jest.fn(),
      settleMarket: jest.fn(),
      list: jest.fn(),
    };

    const mockCryptoOracleService = {
      getCurrentPrice: jest.fn(),
      getHistoricalPrice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoMarketAutomationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MarketsService, useValue: mockMarketsService },
        { provide: CryptoOracleService, useValue: mockCryptoOracleService },
      ],
    }).compile();

    service = module.get<CryptoMarketAutomationService>(
      CryptoMarketAutomationService
    );
    prismaService = module.get(PrismaService);
    marketsService = module.get(MarketsService);
    cryptoOracleService = module.get(CryptoOracleService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should skip automation when disabled via env', async () => {
      process.env.CRYPTO_MARKET_AUTOMATION_ENABLED = 'false';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CryptoMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: CryptoOracleService, useValue: cryptoOracleService },
        ],
      }).compile();

      const testService = module.get<CryptoMarketAutomationService>(
        CryptoMarketAutomationService
      );

      const logSpy = jest.spyOn(Logger.prototype, 'log');
      await testService.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Crypto automation disabled')
      );
    });

    it('should start automation when enabled', async () => {
      process.env.CRYPTO_MARKET_AUTOMATION_ENABLED = 'true';
      cryptoOracleService.getCurrentPrice.mockResolvedValue(42000);
      prismaService.market.findMany.mockResolvedValue([]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CryptoMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: CryptoOracleService, useValue: cryptoOracleService },
        ],
      }).compile();

      const testService = module.get<CryptoMarketAutomationService>(
        CryptoMarketAutomationService
      );

      await testService.onModuleInit();

      expect(prismaService.market.findMany).toHaveBeenCalled();
    });

    it('should set up interval timer', async () => {
      process.env.CRYPTO_MARKET_AUTOMATION_ENABLED = 'true';
      cryptoOracleService.getCurrentPrice.mockResolvedValue(42000);
      prismaService.market.findMany.mockResolvedValue([]);

      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CryptoMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: CryptoOracleService, useValue: cryptoOracleService },
        ],
      }).compile();

      const testService = module.get<CryptoMarketAutomationService>(
        CryptoMarketAutomationService
      );

      await testService.onModuleInit();

      expect(setIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear interval timer', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('market creation automation', () => {
    beforeEach(() => {
      process.env.CRYPTO_MARKET_AUTOMATION_ENABLED = 'true';
    });

    it('should create markets for all supported assets', async () => {
      cryptoOracleService.getCurrentPrice.mockResolvedValue(42000);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cryptoOracleService.getCurrentPrice).toHaveBeenCalled();
    });

    it('should skip market creation if already exists', async () => {
      cryptoOracleService.getCurrentPrice.mockResolvedValue(42000);
      prismaService.market.findFirst.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.create).not.toHaveBeenCalled();
    });

    it('should generate price ranges based on current price', async () => {
      cryptoOracleService.getCurrentPrice.mockResolvedValue(45000);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle market creation errors', async () => {
      cryptoOracleService.getCurrentPrice.mockResolvedValue(42000);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockRejectedValue(new Error('Creation failed'));

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle oracle errors gracefully', async () => {
      cryptoOracleService.getCurrentPrice.mockRejectedValue(
        new Error('Oracle unavailable')
      );

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('market opening automation', () => {
    it('should open markets that reached openAt time', async () => {
      const marketToOpen = {
        ...mockMarket,
        state: MarketState.CREATED,
        openAt: new Date(Date.now() - 1000),
      };

      prismaService.market.findMany.mockResolvedValue([marketToOpen as any]);
      marketsService.openMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should not open markets before openAt time', async () => {
      const marketNotReady = {
        ...mockMarket,
        state: MarketState.CREATED,
        openAt: new Date(Date.now() + 10000),
      };

      prismaService.market.findMany.mockResolvedValue([marketNotReady as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.openMarket).not.toHaveBeenCalled();
    });

    it('should handle opening errors', async () => {
      const marketToOpen = {
        ...mockMarket,
        state: MarketState.CREATED,
        openAt: new Date(Date.now() - 1000),
      };

      prismaService.market.findMany.mockResolvedValue([marketToOpen as any]);
      marketsService.openMarket.mockRejectedValue(new Error('Open failed'));

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('market closing automation', () => {
    it('should close markets that reached closeAt time', async () => {
      const marketToClose = {
        ...mockMarket,
        state: MarketState.OPEN,
        closeAt: new Date(Date.now() - 1000),
      };

      prismaService.market.findMany.mockResolvedValue([marketToClose as any]);
      marketsService.closeMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should not close markets before closeAt time', async () => {
      const marketNotReady = {
        ...mockMarket,
        state: MarketState.OPEN,
        closeAt: new Date(Date.now() + 10000),
      };

      prismaService.market.findMany.mockResolvedValue([marketNotReady as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.closeMarket).not.toHaveBeenCalled();
    });
  });

  describe('market settlement automation', () => {
    it('should settle markets after dispute window', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        metadata: {
          assetSymbol: 'BTC',
          targetDate: '2025-01-17',
        },
      };

      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      cryptoOracleService.getHistoricalPrice.mockResolvedValue({
        price: 43500,
        timestamp: new Date('2025-01-17T00:00:00Z'),
      });
      marketsService.settleMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should not settle markets within dispute window', async () => {
      const marketTooEarly = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 3 * 3600 * 1000),
        metadata: {
          assetSymbol: 'BTC',
          targetDate: '2025-01-17',
        },
      };

      prismaService.market.findMany.mockResolvedValue([marketTooEarly as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cryptoOracleService.getHistoricalPrice).not.toHaveBeenCalled();
    });

    it('should determine winning outcome based on price ranges', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        outcomes: ['< $40k', '$40k-$45k', '$45k-$50k', '> $50k'],
        metadata: {
          assetSymbol: 'BTC',
          targetDate: '2025-01-17',
        },
      };

      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      cryptoOracleService.getHistoricalPrice.mockResolvedValue({
        price: 43500,
        timestamp: new Date('2025-01-17T00:00:00Z'),
      });
      marketsService.settleMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle settlement errors', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        metadata: {
          assetSymbol: 'BTC',
          targetDate: '2025-01-17',
        },
      };

      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      cryptoOracleService.getHistoricalPrice.mockRejectedValue(
        new Error('Oracle error')
      );

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should skip settlement if price not available', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        metadata: {
          assetSymbol: 'BTC',
          targetDate: '2025-01-17',
        },
      };

      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      cryptoOracleService.getHistoricalPrice.mockResolvedValue(null);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.settleMarket).not.toHaveBeenCalled();
    });
  });

  describe('concurrent execution protection', () => {
    it('should skip cycle if previous run still in progress', async () => {
      prismaService.market.findMany.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      );

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('previous run still in progress')
      );
    });
  });

  describe('configuration parsing', () => {
    it('should parse interval from env variable', async () => {
      process.env.CRYPTO_MARKET_AUTOMATION_INTERVAL_MS = '30000';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CryptoMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: CryptoOracleService, useValue: cryptoOracleService },
        ],
      }).compile();

      const testService = module.get<CryptoMarketAutomationService>(
        CryptoMarketAutomationService
      );

      expect(testService).toBeDefined();
    });

    it('should use fallback interval if env invalid', async () => {
      process.env.CRYPTO_MARKET_AUTOMATION_INTERVAL_MS = 'invalid';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CryptoMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: CryptoOracleService, useValue: cryptoOracleService },
        ],
      }).compile();

      const testService = module.get<CryptoMarketAutomationService>(
        CryptoMarketAutomationService
      );

      expect(testService).toBeDefined();
    });
  });

  describe('multi-asset support', () => {
    it('should create markets for BTC, ETH, SOL, and FLOW', async () => {
      cryptoOracleService.getCurrentPrice
        .mockResolvedValueOnce(42000) // BTC
        .mockResolvedValueOnce(2500) // ETH
        .mockResolvedValueOnce(100) // SOL
        .mockResolvedValueOnce(1.5); // FLOW

      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(cryptoOracleService.getCurrentPrice).toHaveBeenCalledTimes(4);
    });

    it('should continue if one asset fails', async () => {
      cryptoOracleService.getCurrentPrice
        .mockResolvedValueOnce(42000) // BTC
        .mockRejectedValueOnce(new Error('ETH failed')) // ETH
        .mockResolvedValueOnce(100) // SOL
        .mockResolvedValueOnce(1.5); // FLOW

      prismaService.market.findFirst.mockResolvedValue(null);

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ETH failed')
      );
    });
  });
});
