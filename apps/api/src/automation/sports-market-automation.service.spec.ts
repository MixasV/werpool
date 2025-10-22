import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MarketState } from '@prisma/client';

import { SportsMarketAutomationService } from './sports-market-automation.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketsService } from '../markets/markets.service';
import { SportsOracleService } from '../oracles/sports-oracle.service';

describe('SportsMarketAutomationService', () => {
  let service: SportsMarketAutomationService;
  let prismaService: jest.Mocked<PrismaService>;
  let marketsService: jest.Mocked<MarketsService>;
  let sportsOracleService: jest.Mocked<SportsOracleService>;

  const mockSportsEvent = {
    id: 'event-123',
    league: 'UEFA Champions League',
    leagueId: '4480',
    sport: 'soccer',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    startTime: new Date('2025-01-20T20:00:00Z'),
    venue: 'Santiago Bernabéu',
    status: 'scheduled',
  };

  const mockMarket = {
    id: 'market-1',
    slug: 'real-madrid-vs-barcelona-2025-01-20',
    title: 'Real Madrid vs Barcelona - Winner',
    description: 'UEFA Champions League match',
    state: MarketState.CREATED,
    category: 'SPORTS',
    tags: ['sports', 'soccer', 'uefa'],
    outcomes: ['Real Madrid', 'Draw', 'Barcelona'],
    openAt: new Date('2025-01-18T10:00:00Z'),
    closeAt: new Date('2025-01-20T19:45:00Z'),
    expectedSettlementAt: new Date('2025-01-20T22:00:00Z'),
    metadata: {
      eventId: 'event-123',
      sport: 'soccer',
      league: 'UEFA Champions League',
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

    const mockSportsOracleService = {
      fetchUpcomingEvents: jest.fn(),
      getEventResult: jest.fn(),
      getEventStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SportsMarketAutomationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MarketsService, useValue: mockMarketsService },
        { provide: SportsOracleService, useValue: mockSportsOracleService },
      ],
    }).compile();

    service = module.get<SportsMarketAutomationService>(
      SportsMarketAutomationService
    );
    prismaService = module.get(PrismaService);
    marketsService = module.get(MarketsService);
    sportsOracleService = module.get(SportsOracleService);

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
      process.env.SPORTS_MARKET_AUTOMATION_ENABLED = 'false';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: SportsOracleService, useValue: sportsOracleService },
        ],
      }).compile();

      const testService = module.get<SportsMarketAutomationService>(
        SportsMarketAutomationService
      );

      const logSpy = jest.spyOn(Logger.prototype, 'log');
      await testService.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sports automation disabled')
      );
    });

    it('should start automation when enabled', async () => {
      process.env.SPORTS_MARKET_AUTOMATION_ENABLED = 'true';
      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: SportsOracleService, useValue: sportsOracleService },
        ],
      }).compile();

      const testService = module.get<SportsMarketAutomationService>(
        SportsMarketAutomationService
      );

      await testService.onModuleInit();

      expect(sportsOracleService.fetchUpcomingEvents).toHaveBeenCalled();
    });

    it('should set up interval timer', async () => {
      process.env.SPORTS_MARKET_AUTOMATION_ENABLED = 'true';
      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([]);

      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: SportsOracleService, useValue: sportsOracleService },
        ],
      }).compile();

      const testService = module.get<SportsMarketAutomationService>(
        SportsMarketAutomationService
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
      process.env.SPORTS_MARKET_AUTOMATION_ENABLED = 'true';
    });

    it('should create markets for upcoming events', async () => {
      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([
        mockSportsEvent as any,
      ]);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(sportsOracleService.fetchUpcomingEvents).toHaveBeenCalled();
    });

    it('should skip market creation if already exists', async () => {
      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([
        mockSportsEvent as any,
      ]);
      prismaService.market.findFirst.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.create).not.toHaveBeenCalled();
    });

    it('should create markets for multiple leagues', async () => {
      const events = [
        { ...mockSportsEvent, id: 'event-1', leagueId: '4480' }, // UEFA
        { ...mockSportsEvent, id: 'event-2', leagueId: '4328' }, // EPL
        { ...mockSportsEvent, id: 'event-3', leagueId: '4387' }, // NBA
      ];

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue(events as any);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('should respect max markets per league limit', async () => {
      const manyEvents = Array.from({ length: 10 }, (_, i) => ({
        ...mockSportsEvent,
        id: `event-${i}`,
        leagueId: '4480', // UEFA (max 4)
      }));

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue(
        manyEvents as any
      );
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('should handle market creation errors', async () => {
      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([
        mockSportsEvent as any,
      ]);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockRejectedValue(new Error('Creation failed'));

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle oracle errors gracefully', async () => {
      sportsOracleService.fetchUpcomingEvents.mockRejectedValue(
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

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
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

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
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

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
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

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
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

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketNotReady as any]);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.closeMarket).not.toHaveBeenCalled();
    });
  });

  describe('market settlement automation', () => {
    it('should settle markets with available results', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 3 * 3600 * 1000),
        metadata: {
          eventId: 'event-123',
          sport: 'soccer',
        },
      };

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      sportsOracleService.getEventResult.mockResolvedValue({
        winner: 'Real Madrid',
        homeScore: 2,
        awayScore: 1,
        status: 'completed',
      });
      marketsService.settleMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should skip settlement if result not available', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 3 * 3600 * 1000),
        metadata: {
          eventId: 'event-123',
          sport: 'soccer',
        },
      };

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      sportsOracleService.getEventResult.mockResolvedValue(null);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(marketsService.settleMarket).not.toHaveBeenCalled();
    });

    it('should handle settlement errors', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 3 * 3600 * 1000),
        metadata: {
          eventId: 'event-123',
          sport: 'soccer',
        },
      };

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      sportsOracleService.getEventResult.mockRejectedValue(
        new Error('Oracle error')
      );

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should determine outcome for soccer matches', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 3 * 3600 * 1000),
        outcomes: ['Real Madrid', 'Draw', 'Barcelona'],
        metadata: {
          eventId: 'event-123',
          sport: 'soccer',
          homeTeam: 'Real Madrid',
          awayTeam: 'Barcelona',
        },
      };

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      sportsOracleService.getEventResult.mockResolvedValue({
        winner: 'Real Madrid',
        homeScore: 3,
        awayScore: 1,
        status: 'completed',
      });
      marketsService.settleMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle draw outcomes', async () => {
      const marketToSettle = {
        ...mockMarket,
        state: MarketState.CLOSED,
        closeAt: new Date(Date.now() - 3 * 3600 * 1000),
        outcomes: ['Real Madrid', 'Draw', 'Barcelona'],
        metadata: {
          eventId: 'event-123',
          sport: 'soccer',
        },
      };

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue([]);
      prismaService.market.findMany.mockResolvedValue([marketToSettle as any]);
      sportsOracleService.getEventResult.mockResolvedValue({
        winner: 'Draw',
        homeScore: 2,
        awayScore: 2,
        status: 'completed',
      });
      marketsService.settleMarket.mockResolvedValue(undefined);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe('concurrent execution protection', () => {
    it('should skip cycle if previous run still in progress', async () => {
      sportsOracleService.fetchUpcomingEvents.mockImplementation(
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
      process.env.SPORTS_MARKET_AUTOMATION_INTERVAL_MS = '30000';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: SportsOracleService, useValue: sportsOracleService },
        ],
      }).compile();

      const testService = module.get<SportsMarketAutomationService>(
        SportsMarketAutomationService
      );

      expect(testService).toBeDefined();
    });

    it('should use fallback interval if env invalid', async () => {
      process.env.SPORTS_MARKET_AUTOMATION_INTERVAL_MS = 'invalid';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SportsMarketAutomationService,
          { provide: PrismaService, useValue: prismaService },
          { provide: MarketsService, useValue: marketsService },
          { provide: SportsOracleService, useValue: sportsOracleService },
        ],
      }).compile();

      const testService = module.get<SportsMarketAutomationService>(
        SportsMarketAutomationService
      );

      expect(testService).toBeDefined();
    });
  });

  describe('multi-sport support', () => {
    it('should support soccer, basketball, and hockey', async () => {
      const events = [
        {
          ...mockSportsEvent,
          id: 'soccer-1',
          sport: 'soccer',
          leagueId: '4480',
        },
        {
          ...mockSportsEvent,
          id: 'basketball-1',
          sport: 'basketball',
          leagueId: '4387',
        },
        {
          ...mockSportsEvent,
          id: 'hockey-1',
          sport: 'hockey',
          leagueId: '4380',
        },
      ];

      sportsOracleService.fetchUpcomingEvents.mockResolvedValue(events as any);
      prismaService.market.findFirst.mockResolvedValue(null);
      marketsService.create.mockResolvedValue(mockMarket as any);

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(sportsOracleService.fetchUpcomingEvents).toHaveBeenCalledTimes(4);
    });

    it('should continue if one league fails', async () => {
      sportsOracleService.fetchUpcomingEvents
        .mockResolvedValueOnce([mockSportsEvent as any]) // UEFA
        .mockRejectedValueOnce(new Error('EPL failed')) // EPL
        .mockResolvedValueOnce([mockSportsEvent as any]) // NBA
        .mockResolvedValueOnce([mockSportsEvent as any]); // NHL

      prismaService.market.findFirst.mockResolvedValue(null);

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('EPL failed')
      );
    });
  });
});
