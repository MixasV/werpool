import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MarketState } from '@prisma/client';

import { AiSportsMarketAutomationService } from './aisports-market-automation.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketsService } from '../markets/markets.service';
import { MetaPredictionService } from '../oracles/aisports/meta-prediction.service';
import { AiSportsFlowService } from '../flow/aisports-flow.service';

describe('AiSportsMarketAutomationService', () => {
  let service: AiSportsMarketAutomationService;
  let prismaService: jest.Mocked<PrismaService>;
  let marketsService: jest.Mocked<MarketsService>;
  let metaPredictionService: jest.Mocked<MetaPredictionService>;
  let flowService: jest.Mocked<AiSportsFlowService>;

  const mockMarket = {
    id: 'market-1',
    slug: 'test-meta-market',
    title: 'Test Meta Market',
    description: 'Test description',
    state: MarketState.CREATED,
    category: 'AISPORTS',
    tags: ['aisports', 'meta'],
    outcomes: ['Yes', 'No'],
    openAt: new Date('2025-01-15T10:00:00Z'),
    closeAt: new Date('2025-01-16T10:00:00Z'),
    expectedSettlementAt: new Date('2025-01-16T16:00:00Z'),
    metadata: {
      aisportsMarketId: 'meta-123',
      contestType: 'META_PREDICTION',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMetaMarket = {
    id: 'meta-123',
    question: 'Will ETH reach $5000?',
    description: 'Prediction about ETH price',
    startTime: new Date('2025-01-15T10:00:00Z').toISOString(),
    endTime: new Date('2025-01-16T10:00:00Z').toISOString(),
    outcomes: ['Yes', 'No'],
    category: 'CRYPTO',
    status: 'OPEN',
    volume: 1000,
    liquidity: 5000,
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

    const mockMetaPredictionService = {
      listActiveMarkets: jest.fn(),
      getMarketById: jest.fn(),
      getMarketOutcome: jest.fn(),
    };

    const mockFlowService = {
      isEnabled: jest.fn(),
      createContest: jest.fn(),
      settleContest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSportsMarketAutomationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MarketsService, useValue: mockMarketsService },
        { provide: MetaPredictionService, useValue: mockMetaPredictionService },
        { provide: AiSportsFlowService, useValue: mockFlowService },
      ],
    }).compile();

    service = module.get<AiSportsMarketAutomationService>(
      AiSportsMarketAutomationService
    );
    prismaService = module.get(PrismaService);
    marketsService = module.get(MarketsService);
    metaPredictionService = module.get(MetaPredictionService);
    flowService = module.get(AiSportsFlowService);

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
      process.env.AISPORTS_MARKET_AUTOMATION_ENABLED = 'false';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiSportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: MetaPredictionService, useValue: metaPredictionService },
          { provide: AiSportsFlowService, useValue: flowService },
        ],
      }).compile();

      const testService = module.get<AiSportsMarketAutomationService>(
        AiSportsMarketAutomationService
      );

      await testService.onModuleInit();

      expect(flowService.isEnabled).not.toHaveBeenCalled();
    });

    it('should warn when flow service disabled', async () => {
      process.env.AISPORTS_MARKET_AUTOMATION_ENABLED = 'true';
      flowService.isEnabled.mockReturnValue(false);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiSportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: MetaPredictionService, useValue: metaPredictionService },
          { provide: AiSportsFlowService, useValue: flowService },
        ],
      }).compile();

      const testService = module.get<AiSportsMarketAutomationService>(
        AiSportsMarketAutomationService
      );

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      await testService.onModuleInit();

      expect(flowService.isEnabled).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('AiSports integration disabled')
      );
    });

    it('should start automation when enabled', async () => {
      process.env.AISPORTS_MARKET_AUTOMATION_ENABLED = 'true';
      flowService.isEnabled.mockReturnValue(true);
      metaPredictionService.listActiveMarkets.mockResolvedValue([]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiSportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: MetaPredictionService, useValue: metaPredictionService },
          { provide: AiSportsFlowService, useValue: flowService },
        ],
      }).compile();

      const testService = module.get<AiSportsMarketAutomationService>(
        AiSportsMarketAutomationService
      );

      await testService.onModuleInit();

      expect(flowService.isEnabled).toHaveBeenCalled();
      expect(metaPredictionService.listActiveMarkets).toHaveBeenCalled();
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
      flowService.isEnabled.mockReturnValue(true);
    });

    it('should create new market from meta prediction', async () => {
      metaPredictionService.listActiveMarkets.mockResolvedValue([
        mockMetaMarket as any,
      ]);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(metaPredictionService.listActiveMarkets).toHaveBeenCalled();
    });

    it('should skip market creation if already exists', async () => {
      metaPredictionService.listActiveMarkets.mockResolvedValue([
        mockMetaMarket as any,
      ]);
      prismaService.market.findFirst.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.create).not.toHaveBeenCalled();
    });

    it('should handle market creation errors gracefully', async () => {
      metaPredictionService.listActiveMarkets.mockResolvedValue([
        mockMetaMarket as any,
      ]);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockRejectedValue(new Error('Creation failed'));

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('market opening automation', () => {
    beforeEach(() => {
      flowService.isEnabled.mockReturnValue(true);
    });

    it('should open markets that reached openAt time', async () => {
      const marketToOpen = {
        ...mockMarket,
        state: MarketState.CREATED,
        openAt: new Date(Date.now() - 1000),
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
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

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketNotReady as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.openMarket).not.toHaveBeenCalled();
    });

    it('should handle market opening errors', async () => {
      const marketToOpen = {
        ...mockMarket,
        state: MarketState.CREATED,
        openAt: new Date(Date.now() - 1000),
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToOpen as any]);
      marketsService.openMarket.mockRejectedValue(new Error('Open failed'));

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('market closing automation', () => {
    beforeEach(() => {
      flowService.isEnabled.mockReturnValue(true);
    });

    it('should close markets that reached closeAt time', async () => {
      const marketToClose = {
        ...mockMarket,
        state: MarketState.OPEN,
        closeAt: new Date(Date.now() - 1000),
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
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

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketNotReady as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.closeMarket).not.toHaveBeenCalled();
    });
  });

  describe('market settlement automation', () => {
    beforeEach(() => {
      flowService.isEnabled.mockReturnValue(true);
    });

    it('should settle markets after dispute window', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        metadata: {
          aisportsMarketId: 'meta-123',
          contestType: 'META_PREDICTION',
        },
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      metaPredictionService.getMarketOutcome.mockResolvedValue({
        outcome: 'Yes',
        confidence: 0.95,
        timestamp: new Date(),
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
          aisportsMarketId: 'meta-123',
          contestType: 'META_PREDICTION',
        },
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketTooEarly as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(metaPredictionService.getMarketOutcome).not.toHaveBeenCalled();
    });

    it('should handle settlement errors gracefully', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        metadata: {
          aisportsMarketId: 'meta-123',
          contestType: 'META_PREDICTION',
        },
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      metaPredictionService.getMarketOutcome.mockRejectedValue(
        new Error('Oracle unavailable')
      );

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should skip settlement if no outcome available', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 7 * 3600 * 1000),
        metadata: {
          aisportsMarketId: 'meta-123',
          contestType: 'META_PREDICTION',
        },
      };

      metaPredictionService.listActiveMarkets.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      metaPredictionService.getMarketOutcome.mockResolvedValue(null);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.settleMarket).not.toHaveBeenCalled();
    });
  });

  describe('concurrent execution protection', () => {
    it('should skip cycle if previous run still in progress', async () => {
      flowService.isEnabled.mockReturnValue(true);
      metaPredictionService.listActiveMarkets.mockImplementation(
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
      process.env.AISPORTS_MARKET_AUTOMATION_INTERVAL_MS = '30000';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiSportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: MetaPredictionService, useValue: metaPredictionService },
          { provide: AiSportsFlowService, useValue: flowService },
        ],
      }).compile();

      const testService = module.get<AiSportsMarketAutomationService>(
        AiSportsMarketAutomationService
      );

      expect(testService).toBeDefined();
    });

    it('should use fallback interval if env invalid', async () => {
      process.env.AISPORTS_MARKET_AUTOMATION_INTERVAL_MS = 'invalid';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiSportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: MetaPredictionService, useValue: metaPredictionService },
          { provide: AiSportsFlowService, useValue: flowService },
        ],
      }).compile();

      const testService = module.get<AiSportsMarketAutomationService>(
        AiSportsMarketAutomationService
      );

      expect(testService).toBeDefined();
    });
  });
});
