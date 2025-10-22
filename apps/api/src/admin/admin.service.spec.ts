import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  WorkflowActionStatus,
  WorkflowActionType,
  Prisma,
} from '@prisma/client';

import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminService', () => {
  let service: AdminService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockMarket = {
    id: 'market-1',
    slug: 'test-market',
    title: 'Test Market',
  };

  const mockWorkflowAction = {
    id: 'action-1',
    marketId: 'market-1',
    type: WorkflowActionType.OPEN,
    status: WorkflowActionStatus.PENDING,
    description: 'Open market',
    triggersAt: new Date('2025-01-15T10:00:00Z'),
    metadata: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    market: mockMarket,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      workflowAction: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      market: {
        findUnique: jest.fn(),
      },
      patrolSignal: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listWorkflowActions', () => {
    it('should return all workflow actions', async () => {
      prismaService.workflowAction.findMany.mockResolvedValue([
        mockWorkflowAction,
      ] as any);

      const result = await service.listWorkflowActions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('action-1');
      expect(prismaService.workflowAction.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ triggersAt: 'asc' }, { createdAt: 'desc' }],
        take: 100,
        include: { market: true },
      });
    });

    it('should filter by status', async () => {
      prismaService.workflowAction.findMany.mockResolvedValue([]);

      await service.listWorkflowActions({ status: 'pending' });

      expect(prismaService.workflowAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: WorkflowActionStatus.PENDING },
        })
      );
    });

    it('should filter by type', async () => {
      prismaService.workflowAction.findMany.mockResolvedValue([]);

      await service.listWorkflowActions({ type: 'open' });

      expect(prismaService.workflowAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: WorkflowActionType.OPEN },
        })
      );
    });

    it('should filter by marketId', async () => {
      prismaService.workflowAction.findMany.mockResolvedValue([]);

      await service.listWorkflowActions({ marketId: 'market-1' });

      expect(prismaService.workflowAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { marketId: 'market-1' },
        })
      );
    });

    it('should respect limit parameter', async () => {
      prismaService.workflowAction.findMany.mockResolvedValue([]);

      await service.listWorkflowActions({ limit: 50 });

      expect(prismaService.workflowAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should cap limit at 500', async () => {
      prismaService.workflowAction.findMany.mockResolvedValue([]);

      await service.listWorkflowActions({ limit: 1000 });

      expect(prismaService.workflowAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        })
      );
    });
  });

  describe('createWorkflowAction', () => {
    it('should create workflow action successfully', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.workflowAction.create.mockResolvedValue(
        mockWorkflowAction as any
      );

      const result = await service.createWorkflowAction({
        marketId: 'market-1',
        type: 'open',
        description: 'Open market',
        triggersAt: '2025-01-15T10:00:00Z',
      });

      expect(result.id).toBe('action-1');
      expect(prismaService.market.findUnique).toHaveBeenCalledWith({
        where: { id: 'market-1' },
      });
      expect(prismaService.workflowAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          marketId: 'market-1',
          type: WorkflowActionType.OPEN,
        }),
        include: { market: true },
      });
    });

    it('should throw BadRequestException if marketId missing', async () => {
      await expect(
        service.createWorkflowAction({
          marketId: '',
          type: 'open',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if market not found', async () => {
      prismaService.market.findUnique.mockResolvedValue(null);

      await expect(
        service.createWorkflowAction({
          marketId: 'invalid',
          type: 'open',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should set default status to PENDING', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.workflowAction.create.mockResolvedValue(
        mockWorkflowAction as any
      );

      await service.createWorkflowAction({
        marketId: 'market-1',
        type: 'open',
      });

      expect(prismaService.workflowAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: WorkflowActionStatus.PENDING,
        }),
        include: { market: true },
      });
    });

    it('should handle custom metadata', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);
      prismaService.workflowAction.create.mockResolvedValue(
        mockWorkflowAction as any
      );

      const metadata = { key: 'value', number: 123 };
      await service.createWorkflowAction({
        marketId: 'market-1',
        type: 'custom',
        metadata,
      });

      expect(prismaService.workflowAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.anything(),
        }),
        include: { market: true },
      });
    });

    it('should reject invalid type', async () => {
      await expect(
        service.createWorkflowAction({
          marketId: 'market-1',
          type: 'invalid-type',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid date format', async () => {
      prismaService.market.findUnique.mockResolvedValue(mockMarket as any);

      await expect(
        service.createWorkflowAction({
          marketId: 'market-1',
          type: 'open',
          triggersAt: 'invalid-date',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateWorkflowAction', () => {
    it('should update workflow action', async () => {
      const updated = {
        ...mockWorkflowAction,
        description: 'Updated description',
      };
      prismaService.workflowAction.update.mockResolvedValue(updated as any);

      const result = await service.updateWorkflowAction('action-1', {
        description: 'Updated description',
      });

      expect(result.description).toBe('Updated description');
      expect(prismaService.workflowAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { description: 'Updated description' },
        include: { market: true },
      });
    });

    it('should throw BadRequestException if id missing', async () => {
      await expect(
        service.updateWorkflowAction('', { description: 'test' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if action not found', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        }
      );
      prismaService.workflowAction.update.mockRejectedValue(error);

      await expect(
        service.updateWorkflowAction('invalid', { description: 'test' })
      ).rejects.toThrow(NotFoundException);
    });

    it('should update status', async () => {
      prismaService.workflowAction.update.mockResolvedValue(
        mockWorkflowAction as any
      );

      await service.updateWorkflowAction('action-1', {
        status: 'executed',
      });

      expect(prismaService.workflowAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { status: WorkflowActionStatus.EXECUTED },
        include: { market: true },
      });
    });

    it('should update triggersAt', async () => {
      prismaService.workflowAction.update.mockResolvedValue(
        mockWorkflowAction as any
      );

      await service.updateWorkflowAction('action-1', {
        triggersAt: '2025-02-01T10:00:00Z',
      });

      expect(prismaService.workflowAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { triggersAt: expect.any(Date) },
        include: { market: true },
      });
    });

    it('should update metadata', async () => {
      prismaService.workflowAction.update.mockResolvedValue(
        mockWorkflowAction as any
      );

      await service.updateWorkflowAction('action-1', {
        metadata: { updated: true },
      });

      expect(prismaService.workflowAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { metadata: expect.anything() },
        include: { market: true },
      });
    });
  });

  describe('executeWorkflowAction', () => {
    it('should mark action as executed', async () => {
      const executed = {
        ...mockWorkflowAction,
        status: WorkflowActionStatus.EXECUTED,
      };
      prismaService.workflowAction.update.mockResolvedValue(executed as any);

      const result = await service.executeWorkflowAction('action-1', {
        note: 'Manual execution',
      });

      expect(result.status).toBe('executed');
      expect(prismaService.workflowAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: {
          status: WorkflowActionStatus.EXECUTED,
          metadata: expect.anything(),
        },
        include: { market: true },
      });
    });

    it('should add executedAt timestamp to metadata', async () => {
      prismaService.workflowAction.update.mockResolvedValue(
        mockWorkflowAction as any
      );

      await service.executeWorkflowAction('action-1', undefined);

      const call = prismaService.workflowAction.update.mock.calls[0][0];
      expect(call.data).toHaveProperty('metadata');
    });

    it('should throw NotFoundException if action not found', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        }
      );
      prismaService.workflowAction.update.mockRejectedValue(error);

      await expect(
        service.executeWorkflowAction('invalid', undefined)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteWorkflowAction', () => {
    it('should delete workflow action', async () => {
      prismaService.workflowAction.delete.mockResolvedValue(
        mockWorkflowAction as any
      );

      await service.deleteWorkflowAction('action-1');

      expect(prismaService.workflowAction.delete).toHaveBeenCalledWith({
        where: { id: 'action-1' },
      });
    });

    it('should throw NotFoundException if action not found', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        }
      );
      prismaService.workflowAction.delete.mockRejectedValue(error);

      await expect(service.deleteWorkflowAction('invalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('listPatrolSignals', () => {
    const mockSignal = {
      id: 'signal-1',
      marketId: 'market-1',
      issuer: '0xpatrol',
      severity: 'HIGH' as any,
      code: 'FRAUD_DETECTED',
      weight: 100,
      notes: 'Suspicious activity',
      expiresAt: new Date('2025-02-01'),
      createdAt: new Date('2025-01-01'),
    };

    it('should return patrol signals', async () => {
      prismaService.patrolSignal.findMany.mockResolvedValue([mockSignal]);

      const result = await service.listPatrolSignals({});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('signal-1');
      expect(result[0].severity).toBe('high');
    });

    it('should filter by marketId', async () => {
      prismaService.patrolSignal.findMany.mockResolvedValue([]);

      await service.listPatrolSignals({ marketId: 'market-1' });

      expect(prismaService.patrolSignal.findMany).toHaveBeenCalledWith({
        where: { marketId: 'market-1' },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      });
    });

    it('should respect limit parameter', async () => {
      prismaService.patrolSignal.findMany.mockResolvedValue([]);

      await service.listPatrolSignals({ limit: 50 });

      expect(prismaService.patrolSignal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should order by severity and createdAt', async () => {
      prismaService.patrolSignal.findMany.mockResolvedValue([]);

      await service.listPatrolSignals({});

      expect(prismaService.patrolSignal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        })
      );
    });
  });
});
