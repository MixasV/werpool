import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { AlertService } from './alert.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AlertService', () => {
  let service: AlertService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockAlert = {
    id: 'alert-1',
    type: 'ERROR',
    severity: 'HIGH',
    message: 'Database connection failed',
    source: 'prisma',
    metadata: {
      error: 'Connection timeout',
      timestamp: new Date().toISOString(),
    },
    resolved: false,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      alert: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    prismaService = module.get(PrismaService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createAlert', () => {
    it('should create alert with given parameters', async () => {
      prismaService.alert.create.mockResolvedValue(mockAlert as any);

      const result = await service.createAlert({
        type: 'ERROR',
        severity: 'HIGH',
        message: 'Database connection failed',
        source: 'prisma',
      });

      expect(result).toEqual(mockAlert);
      expect(prismaService.alert.create).toHaveBeenCalledWith({
        data: {
          type: 'ERROR',
          severity: 'HIGH',
          message: 'Database connection failed',
          source: 'prisma',
          resolved: false,
        },
      });
    });

    it('should include metadata when provided', async () => {
      prismaService.alert.create.mockResolvedValue(mockAlert as any);

      await service.createAlert({
        type: 'ERROR',
        severity: 'HIGH',
        message: 'Test alert',
        source: 'test',
        metadata: { key: 'value' },
      });

      expect(prismaService.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.anything(),
        }),
      });
    });

    it('should set resolved to false by default', async () => {
      prismaService.alert.create.mockResolvedValue(mockAlert as any);

      await service.createAlert({
        type: 'WARNING',
        severity: 'MEDIUM',
        message: 'Test warning',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resolved: false,
        }),
      });
    });

    it('should handle creation errors', async () => {
      prismaService.alert.create.mockRejectedValue(new Error('DB error'));

      await expect(
        service.createAlert({
          type: 'ERROR',
          severity: 'HIGH',
          message: 'Test',
          source: 'test',
        })
      ).rejects.toThrow('DB error');
    });
  });

  describe('listAlerts', () => {
    it('should return all alerts', async () => {
      prismaService.alert.findMany.mockResolvedValue([mockAlert] as any);

      const result = await service.listAlerts();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockAlert);
      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should filter by resolved status', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({ resolved: false });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: { resolved: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should filter by severity', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({ severity: 'HIGH' });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: { severity: 'HIGH' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should filter by type', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({ type: 'ERROR' });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: { type: 'ERROR' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should filter by source', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({ source: 'prisma' });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: { source: 'prisma' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should respect limit parameter', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({ limit: 50 });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should cap limit at 1000', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({ limit: 10000 });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
    });

    it('should combine multiple filters', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      await service.listAlerts({
        resolved: false,
        severity: 'HIGH',
        type: 'ERROR',
      });

      expect(prismaService.alert.findMany).toHaveBeenCalledWith({
        where: {
          resolved: false,
          severity: 'HIGH',
          type: 'ERROR',
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  });

  describe('resolveAlert', () => {
    it('should mark alert as resolved', async () => {
      const resolvedAlert = { ...mockAlert, resolved: true, resolvedAt: new Date() };
      prismaService.alert.update.mockResolvedValue(resolvedAlert as any);

      const result = await service.resolveAlert('alert-1');

      expect(result.resolved).toBe(true);
      expect(result.resolvedAt).toBeDefined();
      expect(prismaService.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          resolved: true,
          resolvedAt: expect.any(Date),
        },
      });
    });

    it('should include resolution notes', async () => {
      prismaService.alert.update.mockResolvedValue(mockAlert as any);

      await service.resolveAlert('alert-1', 'Fixed by restarting service');

      expect(prismaService.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          resolved: true,
          resolvedAt: expect.any(Date),
          metadata: expect.anything(),
        },
      });
    });

    it('should handle non-existent alert', async () => {
      prismaService.alert.update.mockRejectedValue(new Error('Alert not found'));

      await expect(service.resolveAlert('invalid-id')).rejects.toThrow(
        'Alert not found'
      );
    });
  });

  describe('countAlerts', () => {
    it('should return total alert count', async () => {
      prismaService.alert.count.mockResolvedValue(42);

      const result = await service.countAlerts();

      expect(result).toBe(42);
      expect(prismaService.alert.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it('should count unresolved alerts', async () => {
      prismaService.alert.count.mockResolvedValue(15);

      const result = await service.countAlerts({ resolved: false });

      expect(result).toBe(15);
      expect(prismaService.alert.count).toHaveBeenCalledWith({
        where: { resolved: false },
      });
    });

    it('should count by severity', async () => {
      prismaService.alert.count.mockResolvedValue(8);

      const result = await service.countAlerts({ severity: 'HIGH' });

      expect(result).toBe(8);
      expect(prismaService.alert.count).toHaveBeenCalledWith({
        where: { severity: 'HIGH' },
      });
    });

    it('should return zero when no alerts', async () => {
      prismaService.alert.count.mockResolvedValue(0);

      const result = await service.countAlerts();

      expect(result).toBe(0);
    });
  });

  describe('getAlertById', () => {
    it('should return alert by id', async () => {
      prismaService.alert.findMany.mockResolvedValue([mockAlert] as any);

      const result = await service.getAlertById('alert-1');

      expect(result).toEqual(mockAlert);
    });

    it('should return null when alert not found', async () => {
      prismaService.alert.findMany.mockResolvedValue([]);

      const result = await service.getAlertById('invalid-id');

      expect(result).toBeNull();
    });
  });

  describe('severity levels', () => {
    it('should support LOW severity', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        severity: 'LOW',
      } as any);

      await service.createAlert({
        type: 'INFO',
        severity: 'LOW',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });

    it('should support MEDIUM severity', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        severity: 'MEDIUM',
      } as any);

      await service.createAlert({
        type: 'WARNING',
        severity: 'MEDIUM',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });

    it('should support HIGH severity', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        severity: 'HIGH',
      } as any);

      await service.createAlert({
        type: 'ERROR',
        severity: 'HIGH',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });

    it('should support CRITICAL severity', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        severity: 'CRITICAL',
      } as any);

      await service.createAlert({
        type: 'ERROR',
        severity: 'CRITICAL',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });
  });

  describe('alert types', () => {
    it('should support ERROR type', async () => {
      prismaService.alert.create.mockResolvedValue(mockAlert as any);

      await service.createAlert({
        type: 'ERROR',
        severity: 'HIGH',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });

    it('should support WARNING type', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        type: 'WARNING',
      } as any);

      await service.createAlert({
        type: 'WARNING',
        severity: 'MEDIUM',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });

    it('should support INFO type', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        type: 'INFO',
      } as any);

      await service.createAlert({
        type: 'INFO',
        severity: 'LOW',
        message: 'Test',
        source: 'test',
      });

      expect(prismaService.alert.create).toHaveBeenCalled();
    });
  });

  describe('metadata handling', () => {
    it('should preserve complex metadata', async () => {
      const complexMetadata = {
        error: {
          name: 'ConnectionError',
          message: 'Timeout',
          stack: 'Error stack trace',
        },
        context: {
          user: '0x123',
          action: 'trade',
        },
        timestamp: new Date().toISOString(),
      };

      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        metadata: complexMetadata,
      } as any);

      const result = await service.createAlert({
        type: 'ERROR',
        severity: 'HIGH',
        message: 'Test',
        source: 'test',
        metadata: complexMetadata,
      });

      expect(result.metadata).toEqual(complexMetadata);
    });

    it('should handle null metadata', async () => {
      prismaService.alert.create.mockResolvedValue({
        ...mockAlert,
        metadata: null,
      } as any);

      const result = await service.createAlert({
        type: 'INFO',
        severity: 'LOW',
        message: 'Test',
        source: 'test',
      });

      expect(result.metadata).toBeNull();
    });
  });
});
