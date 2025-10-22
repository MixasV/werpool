import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  SchedulerTaskStatus,
  SchedulerTaskType,
  MarketState,
  WorkflowActionType,
  WorkflowActionStatus,
} from '@prisma/client';

import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';
import { ScheduledSettlementService } from './scheduled-settlement.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let prismaService: jest.Mocked<PrismaService>;
  let pointsService: jest.Mocked<PointsService>;
  let settlementService: jest.Mocked<ScheduledSettlementService>;

  const mockTask = {
    id: 'task-1',
    marketId: 'market-1',
    type: SchedulerTaskType.MARKET_OPEN,
    status: SchedulerTaskStatus.PENDING,
    scheduledFor: new Date('2025-01-15T10:00:00Z'),
    description: 'Open market',
    payload: null,
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    completedAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    createdBy: 'admin',
  };

  const mockMarket = {
    id: 'market-1',
    slug: 'test-market',
    title: 'Test Market',
    state: MarketState.PENDING,
    category: 'CRYPTO',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      schedulerTask: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      market: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      workflowAction: {
        create: jest.fn(),
      },
    };

    const mockPointsService = {
      captureLeaderboardSnapshot: jest.fn(),
    };

    const mockSettlementService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PointsService, useValue: mockPointsService },
        { provide: ScheduledSettlementService, useValue: mockSettlementService },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
    prismaService = module.get(PrismaService);
    pointsService = module.get(PointsService);
    settlementService = module.get(ScheduledSettlementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTasks', () => {
    it('should return all tasks with default limit', async () => {
      const tasks = [mockTask];
      prismaService.schedulerTask.findMany.mockResolvedValue(tasks);

      const result = await service.listTasks();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task-1');
      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { scheduledFor: 'asc' },
        take: 50,
      });
    });

    it('should filter tasks by status', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([mockTask]);

      await service.listTasks({ status: SchedulerTaskStatus.PENDING });

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: SchedulerTaskStatus.PENDING },
        })
      );
    });

    it('should filter tasks by type', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([mockTask]);

      await service.listTasks({ type: SchedulerTaskType.MARKET_OPEN });

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: SchedulerTaskType.MARKET_OPEN },
        })
      );
    });

    it('should filter tasks by marketId', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([mockTask]);

      await service.listTasks({ marketId: 'market-1' });

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { marketId: 'market-1' },
        })
      );
    });

    it('should respect limit parameter', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([]);

      await service.listTasks({ limit: 25 });

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        })
      );
    });

    it('should cap limit at 100', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([]);

      await service.listTasks({ limit: 200 });

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('should use cursor for pagination', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([]);

      await service.listTasks({ cursor: 'task-cursor' });

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'task-cursor' },
        })
      );
    });
  });

  describe('getTask', () => {
    it('should return task by id', async () => {
      prismaService.schedulerTask.findUnique.mockResolvedValue(mockTask);

      const result = await service.getTask('task-1');

      expect(result.id).toBe('task-1');
      expect(prismaService.schedulerTask.findUnique).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
    });

    it('should throw NotFoundException if task not found', async () => {
      prismaService.schedulerTask.findUnique.mockResolvedValue(null);

      await expect(service.getTask('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTask', () => {
    it('should create task with PENDING status', async () => {
      const newTask = { ...mockTask };
      prismaService.schedulerTask.create.mockResolvedValue(newTask);

      const result = await service.createTask({
        type: SchedulerTaskType.MARKET_OPEN,
        scheduledFor: new Date('2025-01-15T10:00:00Z'),
        marketId: 'market-1',
      });

      expect(result.id).toBe('task-1');
      expect(prismaService.schedulerTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: SchedulerTaskStatus.PENDING,
          attempts: 0,
        }),
      });
    });

    it('should set creator if provided', async () => {
      prismaService.schedulerTask.create.mockResolvedValue(mockTask);

      await service.createTask(
        {
          type: SchedulerTaskType.MARKET_OPEN,
          scheduledFor: new Date(),
          marketId: 'market-1',
        },
        'admin-user'
      );

      expect(prismaService.schedulerTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdBy: 'admin-user',
        }),
      });
    });
  });

  describe('updateTask', () => {
    it('should update task data', async () => {
      const updated = { ...mockTask, description: 'Updated' };
      prismaService.schedulerTask.update.mockResolvedValue(updated);

      const result = await service.updateTask('task-1', {
        description: 'Updated',
      });

      expect(result.description).toBe('Updated');
      expect(prismaService.schedulerTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { description: 'Updated' },
      });
    });
  });

  describe('runTask', () => {
    it('should execute MARKET_OPEN task successfully', async () => {
      const pending = { ...mockTask };
      const inProgress = {
        ...mockTask,
        status: SchedulerTaskStatus.IN_PROGRESS,
        attempts: 1,
      };
      const completed = {
        ...mockTask,
        status: SchedulerTaskStatus.COMPLETED,
        completedAt: new Date(),
      };

      prismaService.schedulerTask.update
        .mockResolvedValueOnce(inProgress)
        .mockResolvedValueOnce(completed);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.market.update.mockResolvedValue({} as any);
      prismaService.workflowAction.create.mockResolvedValue({} as any);

      const result = await service.runTask('task-1');

      expect(result.task.status).toBe(SchedulerTaskStatus.COMPLETED);
      expect(result.effect).toMatchObject({
        marketId: 'market-1',
        stateChangedTo: 'live',
        workflowAction: 'open',
      });

      expect(prismaService.market.update).toHaveBeenCalledWith({
        where: { id: 'market-1' },
        data: { state: MarketState.LIVE },
      });
    });

    it('should execute MARKET_CLOSE task successfully', async () => {
      const closeTask = {
        ...mockTask,
        type: SchedulerTaskType.MARKET_CLOSE,
      };
      const completed = {
        ...closeTask,
        status: SchedulerTaskStatus.COMPLETED,
      };

      prismaService.schedulerTask.update
        .mockResolvedValueOnce({ ...closeTask, status: SchedulerTaskStatus.IN_PROGRESS } as any)
        .mockResolvedValueOnce(completed as any);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.market.update.mockResolvedValue({} as any);
      prismaService.workflowAction.create.mockResolvedValue({} as any);

      const result = await service.runTask('task-1');

      expect(prismaService.market.update).toHaveBeenCalledWith({
        where: { id: 'market-1' },
        data: { state: MarketState.CLOSED },
      });
    });

    it('should execute MARKET_SETTLE task successfully', async () => {
      const settleTask = {
        ...mockTask,
        type: SchedulerTaskType.MARKET_SETTLE,
      };
      const completed = {
        ...settleTask,
        status: SchedulerTaskStatus.COMPLETED,
      };

      prismaService.schedulerTask.update
        .mockResolvedValueOnce({ ...settleTask, status: SchedulerTaskStatus.IN_PROGRESS } as any)
        .mockResolvedValueOnce(completed as any);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.market.update.mockResolvedValue({} as any);
      prismaService.workflowAction.create.mockResolvedValue({} as any);

      const result = await service.runTask('task-1');

      expect(prismaService.market.update).toHaveBeenCalledWith({
        where: { id: 'market-1' },
        data: { state: MarketState.SETTLED },
      });
    });

    it('should execute LEADERBOARD_SNAPSHOT task', async () => {
      const snapshotTask = {
        ...mockTask,
        type: SchedulerTaskType.LEADERBOARD_SNAPSHOT,
        marketId: null,
      };
      const completed = {
        ...snapshotTask,
        status: SchedulerTaskStatus.COMPLETED,
      };

      prismaService.schedulerTask.update
        .mockResolvedValueOnce({
          ...snapshotTask,
          status: SchedulerTaskStatus.IN_PROGRESS,
        } as any)
        .mockResolvedValueOnce(completed as any);

      const snapshot = { id: 'snapshot-1', capturedAt: new Date() };
      pointsService.captureLeaderboardSnapshot.mockResolvedValue(snapshot as any);
      prismaService.schedulerTask.findFirst.mockResolvedValue(null);
      prismaService.schedulerTask.create.mockResolvedValue({} as any);

      const result = await service.runTask('task-1');

      expect(pointsService.captureLeaderboardSnapshot).toHaveBeenCalled();
      expect(result.effect?.leaderboardSnapshot).toBeDefined();
    });

    it('should mark task as FAILED on error', async () => {
      const inProgress = {
        ...mockTask,
        status: SchedulerTaskStatus.IN_PROGRESS,
      };
      const failed = {
        ...mockTask,
        status: SchedulerTaskStatus.FAILED,
        lastError: 'Market not found',
      };

      prismaService.schedulerTask.update
        .mockResolvedValueOnce(inProgress as any)
        .mockResolvedValueOnce(failed as any);
      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(service.runTask('task-1')).rejects.toThrow();

      expect(prismaService.schedulerTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: SchedulerTaskStatus.FAILED,
        }),
      });
    });

    it('should increment attempts counter', async () => {
      prismaService.schedulerTask.update.mockResolvedValue({
        ...mockTask,
        status: SchedulerTaskStatus.IN_PROGRESS,
      } as any);

      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(service.runTask('task-1')).rejects.toThrow();

      expect(prismaService.schedulerTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          attempts: { increment: 1 },
        }),
      });
    });
  });

  describe('runDueTasks', () => {
    it('should execute all due tasks', async () => {
      const now = new Date();
      const dueTasks = [
        { ...mockTask, id: 'task-1' },
        { ...mockTask, id: 'task-2' },
      ];

      prismaService.schedulerTask.findMany.mockResolvedValue(dueTasks as any);
      prismaService.schedulerTask.update.mockResolvedValue({
        ...mockTask,
        status: SchedulerTaskStatus.COMPLETED,
      } as any);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.market.update.mockResolvedValue({} as any);
      prismaService.workflowAction.create.mockResolvedValue({} as any);

      const results = await service.runDueTasks();

      expect(results).toHaveLength(2);
      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith({
        where: {
          status: SchedulerTaskStatus.PENDING,
          scheduledFor: { lte: expect.any(Date) },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 10,
      });
    });

    it('should respect limit parameter', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([]);

      await service.runDueTasks(5);

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it('should continue on individual task failure', async () => {
      const dueTasks = [
        { ...mockTask, id: 'task-1' },
        { ...mockTask, id: 'task-2' },
      ];

      prismaService.schedulerTask.findMany.mockResolvedValue(dueTasks as any);
      prismaService.schedulerTask.update
        .mockRejectedValueOnce(new Error('Task 1 failed'))
        .mockResolvedValue({
          ...mockTask,
          status: SchedulerTaskStatus.COMPLETED,
        } as any);
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.market.update.mockResolvedValue({} as any);
      prismaService.workflowAction.create.mockResolvedValue({} as any);

      const results = await service.runDueTasks();

      expect(results).toHaveLength(1);
    });

    it('should cap limit at 25', async () => {
      prismaService.schedulerTask.findMany.mockResolvedValue([]);

      await service.runDueTasks(100);

      expect(prismaService.schedulerTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        })
      );
    });
  });
});
