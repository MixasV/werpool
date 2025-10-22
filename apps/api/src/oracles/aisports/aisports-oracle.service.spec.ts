import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { AiSportsOracleService } from './aisports-oracle.service';
import { AiSportsFlowService } from '../../flow/aisports-flow.service';
import { MetaPredictionMarket } from '../../types/aisports.types';

describe('AiSportsOracleService', () => {
  let service: AiSportsOracleService;
  let flowService: jest.Mocked<AiSportsFlowService>;

  const mockMarket: MetaPredictionMarket = {
    id: 'meta-123',
    question: 'Will average score exceed 50?',
    description: 'Meta prediction about tournament performance',
    category: 'PERFORMANCE',
    outcomes: ['YES', 'NO'],
    isActive: true,
    isResolved: false,
    startTime: new Date('2025-01-10T00:00:00Z'),
    resolutionTime: new Date('2025-01-15T00:00:00Z'),
    currentData: {
      lastUpdate: new Date(),
      metrics: {},
    },
    oracleConfig: {
      resolutionFunction: 'resolveAverageScoreMarket',
      targetValue: 50,
      dataSource: 'aisports-flow',
    },
  };

  const mockLeaderboard = [
    { address: '0x1', score: 100, rank: 1 },
    { address: '0x2', score: 80, rank: 2 },
    { address: '0x3', score: 60, rank: 3 },
  ];

  beforeEach(async () => {
    const mockFlowService = {
      isEnabled: jest.fn(),
      getTournamentStats: jest.fn(),
      getUserScore: jest.fn(),
      getNftPerformance: jest.fn(),
      getCommunityVotes: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSportsOracleService,
        { provide: AiSportsFlowService, useValue: mockFlowService },
      ],
    }).compile();

    service = module.get<AiSportsOracleService>(AiSportsOracleService);
    flowService = module.get(AiSportsFlowService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should return empty array if flow service disabled', async () => {
      flowService.isEnabled.mockReturnValue(false);

      const result = await service.resolve([mockMarket]);

      expect(result).toEqual([]);
      expect(flowService.getTournamentStats).not.toHaveBeenCalled();
    });

    it('should skip markets that are not active', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const inactiveMarket = { ...mockMarket, isActive: false };

      const result = await service.resolve([inactiveMarket]);

      expect(result).toEqual([]);
    });

    it('should skip markets that are already resolved', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const resolvedMarket = { ...mockMarket, isResolved: true };

      const result = await service.resolve([resolvedMarket]);

      expect(result).toEqual([]);
    });

    it('should skip markets before resolution time', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const futureMarket = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() + 10000),
      };

      const result = await service.resolve([futureMarket]);

      expect(result).toEqual([]);
    });

    it('should resolve markets after resolution time', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const marketToResolve = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
      };

      flowService.getTournamentStats.mockResolvedValue({
        averageScore: 60,
        totalPlayers: 100,
      });

      const result = await service.resolve([marketToResolve]);

      expect(result).toHaveLength(1);
      expect(result[0].isResolved).toBe(true);
      expect(result[0].outcome).toBe('YES');
    });

    it('should handle resolution errors gracefully', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const marketToResolve = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
      };

      flowService.getTournamentStats.mockRejectedValue(
        new Error('Stats unavailable')
      );

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const result = await service.resolve([marketToResolve]);

      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve')
      );
    });

    it('should resolve multiple markets', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const markets = [
        {
          ...mockMarket,
          id: 'market-1',
          resolutionTime: new Date(Date.now() - 1000),
        },
        {
          ...mockMarket,
          id: 'market-2',
          resolutionTime: new Date(Date.now() - 1000),
        },
      ];

      flowService.getTournamentStats.mockResolvedValue({
        averageScore: 60,
        totalPlayers: 100,
      });

      const result = await service.resolve(markets);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('market-1');
      expect(result[1].id).toBe('market-2');
    });
  });

  describe('resolveAverageScoreMarket', () => {
    it('should return YES when average score exceeds threshold', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveAverageScoreMarket',
          targetValue: 50,
          dataSource: 'aisports-flow',
        },
      };

      flowService.getTournamentStats.mockResolvedValue({
        averageScore: 60,
        totalPlayers: 100,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('YES');
    });

    it('should return NO when average score below threshold', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveAverageScoreMarket',
          targetValue: 50,
          dataSource: 'aisports-flow',
        },
      };

      flowService.getTournamentStats.mockResolvedValue({
        averageScore: 40,
        totalPlayers: 100,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('NO');
    });
  });

  describe('resolveUserPerformanceMarket', () => {
    it('should return YES when user reaches target rank', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveUserPerformanceMarket',
          targetValue: 10,
          targetUser: '0x1',
          dataSource: 'aisports-flow',
        },
      };

      flowService.getUserScore.mockResolvedValue({
        address: '0x1',
        score: 150,
        rank: 5,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('YES');
    });

    it('should return NO when user fails to reach target rank', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveUserPerformanceMarket',
          targetValue: 10,
          targetUser: '0x1',
          dataSource: 'aisports-flow',
        },
      };

      flowService.getUserScore.mockResolvedValue({
        address: '0x1',
        score: 80,
        rank: 15,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('NO');
    });
  });

  describe('resolveNftPerformanceMarket', () => {
    it('should return YES when NFT performance exceeds threshold', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveNftPerformanceMarket',
          targetValue: 100,
          nftId: 'nft-123',
          dataSource: 'aisports-flow',
        },
      };

      flowService.getNftPerformance.mockResolvedValue({
        nftId: 'nft-123',
        totalScore: 120,
        matches: 10,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('YES');
    });

    it('should return NO when NFT performance below threshold', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveNftPerformanceMarket',
          targetValue: 100,
          nftId: 'nft-123',
          dataSource: 'aisports-flow',
        },
      };

      flowService.getNftPerformance.mockResolvedValue({
        nftId: 'nft-123',
        totalScore: 80,
        matches: 8,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('NO');
    });
  });

  describe('resolveCommunityMarket', () => {
    it('should return YES when majority votes YES', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveCommunityMarket',
          dataSource: 'aisports-flow',
        },
      };

      flowService.getCommunityVotes.mockResolvedValue({
        YES: 70,
        NO: 30,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('YES');
    });

    it('should return NO when majority votes NO', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'resolveCommunityMarket',
          dataSource: 'aisports-flow',
        },
      };

      flowService.getCommunityVotes.mockResolvedValue({
        YES: 30,
        NO: 70,
      });

      const result = await service.resolve([market]);

      expect(result[0].outcome).toBe('NO');
    });
  });

  describe('unknown resolution function', () => {
    it('should throw error for unknown resolution function', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        oracleConfig: {
          resolutionFunction: 'unknownFunction',
          dataSource: 'aisports-flow',
        },
      };

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const result = await service.resolve([market]);

      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve')
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty market array', async () => {
      flowService.isEnabled.mockReturnValue(true);

      const result = await service.resolve([]);

      expect(result).toEqual([]);
    });

    it('should handle null outcome gracefully', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
      };

      flowService.getTournamentStats.mockResolvedValue(null);

      const result = await service.resolve([market]);

      expect(result).toEqual([]);
    });

    it('should preserve market metadata during resolution', async () => {
      flowService.isEnabled.mockReturnValue(true);
      const market = {
        ...mockMarket,
        resolutionTime: new Date(Date.now() - 1000),
        metadata: { custom: 'data' },
      };

      flowService.getTournamentStats.mockResolvedValue({
        averageScore: 60,
        totalPlayers: 100,
      });

      const result = await service.resolve([market]);

      expect(result[0].metadata).toEqual({ custom: 'data' });
    });
  });
});
