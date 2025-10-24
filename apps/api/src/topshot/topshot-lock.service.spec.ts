import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MomentLockStatus } from '@prisma/client';
import { TopShotLockService } from './topshot-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { TopShotService } from './topshot.service';

describe('TopShotLockService', () => {
  let service: TopShotLockService;
  let prismaService: jest.Mocked<PrismaService>;
  let topShotService: jest.Mocked<TopShotService>;

  const mockMarket = {
    id: 'market-1',
    outcomes: [
      { id: 'outcome-1', label: 'Home Win', index: 0, metadata: { type: 'home' } },
      { id: 'outcome-2', label: 'Away Win', index: 1, metadata: { type: 'away' } },
    ],
    closeAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  const mockMoment = {
    id: 'moment-1',
    tier: 'Rare',
    serialNumber: 123,
    play: {
      stats: {
        playerId: 'player-1',
        playerName: 'LeBron James',
        teamName: 'Los Angeles Lakers',
      },
    },
    set: {
      flowName: 'Series 1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopShotLockService,
        {
          provide: PrismaService,
          useValue: {
            topShotMomentLock: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            market: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: TopShotService,
          useValue: {
            getMomentDetail: jest.fn(),
            getOwnerMoments: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TopShotLockService>(TopShotLockService);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;
    topShotService = module.get(TopShotService) as jest.Mocked<TopShotService>;
  });

  describe('createLock', () => {
    const createDto = {
      marketId: 'market-1',
      eventId: 'event-1',
      momentId: 'moment-1',
      outcomeIndex: 0,
    };

    it('should create a new lock successfully', async () => {
      const userAddress = '0xabc123';

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(null);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      topShotService.getMomentDetail.mockResolvedValue(mockMoment as any);
      topShotService.getOwnerMoments.mockResolvedValue([mockMoment as any]);

      const expectedLock = {
        id: 'lock-1',
        userAddress: userAddress.toLowerCase(),
        ...createDto,
        rarity: mockMoment.tier,
        playerId: mockMoment.play.stats.playerId,
        playerName: mockMoment.play.stats.playerName,
        teamName: mockMoment.play.stats.teamName,
        outcomeType: 'home',
        lockedAt: new Date(),
        changeDeadline: new Date(),
        lockedUntil: new Date(),
        status: MomentLockStatus.ACTIVE,
      };

      prismaService.topShotMomentLock.create.mockResolvedValue(expectedLock as any);

      const result = await service.createLock(userAddress, createDto);

      expect(result).toBeDefined();
      expect(result.momentId).toBe(createDto.momentId);
      expect(result.status).toBe(MomentLockStatus.ACTIVE);
      expect(prismaService.topShotMomentLock.create).toHaveBeenCalled();
    });

    it('should throw error if user already has active lock', async () => {
      const userAddress = '0xabc123';

      prismaService.topShotMomentLock.findUnique.mockResolvedValue({
        id: 'existing-lock',
        status: MomentLockStatus.ACTIVE,
      } as any);

      await expect(service.createLock(userAddress, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if market not found', async () => {
      const userAddress = '0xabc123';

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(null);
      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(service.createLock(userAddress, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if user does not own moment', async () => {
      const userAddress = '0xabc123';

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(null);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      topShotService.getMomentDetail.mockResolvedValue(mockMoment as any);
      topShotService.getOwnerMoments.mockResolvedValue([]);

      await expect(service.createLock(userAddress, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if invalid outcome index', async () => {
      const userAddress = '0xabc123';
      const invalidDto = { ...createDto, outcomeIndex: 99 };

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(null);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);

      await expect(service.createLock(userAddress, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateLock', () => {
    it('should update lock outcome successfully', async () => {
      const lockId = 'lock-1';
      const userAddress = '0xabc123';
      const updateDto = { outcomeIndex: 1 };

      const existingLock = {
        id: lockId,
        userAddress: userAddress.toLowerCase(),
        status: MomentLockStatus.ACTIVE,
        changeDeadline: new Date(Date.now() + 60 * 60 * 1000),
        market: mockMarket,
      };

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(existingLock as any);
      prismaService.topShotMomentLock.update.mockResolvedValue({
        ...existingLock,
        outcomeIndex: 1,
        outcomeType: 'away',
      } as any);

      const result = await service.updateLock(lockId, userAddress, updateDto);

      expect(result.outcomeIndex).toBe(1);
      expect(prismaService.topShotMomentLock.update).toHaveBeenCalled();
    });

    it('should throw error if deadline passed', async () => {
      const lockId = 'lock-1';
      const userAddress = '0xabc123';
      const updateDto = { outcomeIndex: 1 };

      const existingLock = {
        id: lockId,
        userAddress: userAddress.toLowerCase(),
        status: MomentLockStatus.ACTIVE,
        changeDeadline: new Date(Date.now() - 1000),
        market: mockMarket,
      };

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(existingLock as any);

      await expect(service.updateLock(lockId, userAddress, updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('releaseLock', () => {
    it('should release lock successfully', async () => {
      const lockId = 'lock-1';
      const userAddress = '0xabc123';

      const existingLock = {
        id: lockId,
        userAddress: userAddress.toLowerCase(),
        status: MomentLockStatus.ACTIVE,
        changeDeadline: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(existingLock as any);
      prismaService.topShotMomentLock.update.mockResolvedValue({
        ...existingLock,
        status: MomentLockStatus.RELEASED,
      } as any);

      await service.releaseLock(lockId, userAddress);

      expect(prismaService.topShotMomentLock.update).toHaveBeenCalledWith({
        where: { id: lockId },
        data: expect.objectContaining({
          status: MomentLockStatus.RELEASED,
        }),
      });
    });
  });

  describe('getUserLocks', () => {
    it('should return user locks', async () => {
      const userAddress = '0xabc123';

      const locks = [
        {
          id: 'lock-1',
          userAddress: userAddress.toLowerCase(),
          marketId: 'market-1',
          status: MomentLockStatus.ACTIVE,
        },
      ];

      prismaService.topShotMomentLock.findMany.mockResolvedValue(locks as any);

      const result = await service.getUserLocks(userAddress);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lock-1');
    });
  });

  describe('getActiveLock', () => {
    it('should return active lock for market and user', async () => {
      const marketId = 'market-1';
      const userAddress = '0xabc123';

      const lock = {
        id: 'lock-1',
        userAddress: userAddress.toLowerCase(),
        marketId,
        status: MomentLockStatus.ACTIVE,
      };

      prismaService.topShotMomentLock.findUnique.mockResolvedValue(lock as any);

      const result = await service.getActiveLock(marketId, userAddress);

      expect(result).toBeDefined();
      expect(result?.id).toBe('lock-1');
    });

    it('should return null if no active lock', async () => {
      const marketId = 'market-1';
      const userAddress = '0xabc123';

      prismaService.topShotMomentLock.findUnique.mockResolvedValue({
        status: MomentLockStatus.RELEASED,
      } as any);

      const result = await service.getActiveLock(marketId, userAddress);

      expect(result).toBeNull();
    });
  });
});
