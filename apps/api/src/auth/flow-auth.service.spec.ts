import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

import { FlowAuthService } from './flow-auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FlowAuthService', () => {
  let service: FlowAuthService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockFlowUser = {
    address: '0x1234567890abcdef',
    nonce: 'test-nonce-123',
    nonceExpiresAt: new Date(Date.now() + 600000),
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    roles: [],
  };

  const mockSession = {
    id: 'session-1',
    token: 'session-token-hash',
    address: '0x1234567890abcdef',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      flowUser: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      flowSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      roleAssignment: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FlowAuthService>(FlowAuthService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('issueChallenge', () => {
    it('should create challenge for new user', async () => {
      prismaService.flowUser.upsert.mockResolvedValue(mockFlowUser as any);

      const result = await service.issueChallenge('0x1234567890abcdef');

      expect(result.address).toBe('0x1234567890abcdef');
      expect(result.nonce).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(prismaService.flowUser.upsert).toHaveBeenCalled();
    });

    it('should normalize Flow address', async () => {
      prismaService.flowUser.upsert.mockResolvedValue(mockFlowUser as any);

      await service.issueChallenge('0x1234567890ABCDEF');

      expect(prismaService.flowUser.upsert).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        update: expect.any(Object),
        create: expect.any(Object),
      });
    });

    it('should update existing user nonce', async () => {
      prismaService.flowUser.upsert.mockResolvedValue(mockFlowUser as any);

      await service.issueChallenge('0x1234567890abcdef');

      expect(prismaService.flowUser.upsert).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        update: expect.objectContaining({
          nonce: expect.any(String),
          nonceExpiresAt: expect.any(Date),
        }),
        create: expect.any(Object),
      });
    });

    it('should generate unique nonces', async () => {
      const calls: string[] = [];
      prismaService.flowUser.upsert.mockImplementation((args: any) => {
        calls.push(args.update.nonce);
        return Promise.resolve(mockFlowUser as any);
      });

      await service.issueChallenge('0x1234567890abcdef');
      await service.issueChallenge('0x1234567890abcdef');

      expect(calls[0]).not.toBe(calls[1]);
    });

    it('should set expiration time', async () => {
      prismaService.flowUser.upsert.mockResolvedValue(mockFlowUser as any);

      const before = Date.now();
      const result = await service.issueChallenge('0x1234567890abcdef');
      const after = Date.now();

      expect(result.expiresAt.getTime()).toBeGreaterThan(before);
      expect(result.expiresAt.getTime()).toBeLessThan(after + 700000);
    });
  });

  describe('verifySignature', () => {
    it('should throw when challenge not found', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(null);

      await expect(
        service.verifySignature({
          address: '0x1234567890abcdef',
          nonce: 'test-nonce',
          signatures: [],
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when nonce mismatch', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(mockFlowUser as any);

      await expect(
        service.verifySignature({
          address: '0x1234567890abcdef',
          nonce: 'wrong-nonce',
          signatures: [],
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when challenge expired', async () => {
      const expiredUser = {
        ...mockFlowUser,
        nonceExpiresAt: new Date(Date.now() - 1000),
      };
      prismaService.flowUser.findUnique.mockResolvedValue(expiredUser as any);

      await expect(
        service.verifySignature({
          address: '0x1234567890abcdef',
          nonce: 'test-nonce-123',
          signatures: [],
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize address for lookup', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(null);

      await expect(
        service.verifySignature({
          address: '0x1234567890ABCDEF',
          nonce: 'test-nonce',
          signatures: [],
        })
      ).rejects.toThrow();

      expect(prismaService.flowUser.findUnique).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        include: { roles: true },
      });
    });
  });

  describe('verifySessionToken', () => {
    it('should throw when token missing', async () => {
      await expect(service.verifySessionToken('')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw when session not found', async () => {
      prismaService.flowSession.findUnique.mockResolvedValue(null);

      await expect(
        service.verifySessionToken('invalid-token')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when session expired', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000),
      };
      prismaService.flowSession.findUnique.mockResolvedValue(
        expiredSession as any
      );
      prismaService.roleAssignment.findMany.mockResolvedValue([]);

      await expect(
        service.verifySessionToken('expired-token')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return session payload for valid token', async () => {
      prismaService.flowSession.findUnique.mockResolvedValue(mockSession as any);
      prismaService.roleAssignment.findMany.mockResolvedValue([
        { role: 'ADMIN' },
        { role: 'MODERATOR' },
      ] as any);

      const result = await service.verifySessionToken('valid-token');

      expect(result.address).toBe('0x1234567890abcdef');
      expect(result.roles).toEqual(['ADMIN', 'MODERATOR']);
    });

    it('should hash token before lookup', async () => {
      prismaService.flowSession.findUnique.mockResolvedValue(null);

      await expect(
        service.verifySessionToken('test-token')
      ).rejects.toThrow();

      expect(prismaService.flowSession.findUnique).toHaveBeenCalledWith({
        where: { token: expect.any(String) },
      });
    });
  });

  describe('session management', () => {
    it('should cleanup old sessions', async () => {
      prismaService.flowSession.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.cleanupExpiredSessions();

      expect(result).toBe(5);
      expect(prismaService.flowSession.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should revoke session', async () => {
      prismaService.flowSession.deleteMany.mockResolvedValue({ count: 1 });

      await service.revokeSession('session-token');

      expect(prismaService.flowSession.deleteMany).toHaveBeenCalled();
    });
  });

  describe('cookie configuration', () => {
    it('should use default cookie name', () => {
      expect(service.cookieName).toBeDefined();
    });

    it('should use custom cookie name from env', async () => {
      process.env.FLOW_SESSION_COOKIE = 'custom_session';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FlowAuthService,
          { provide: PrismaService, useValue: prismaService },
        ],
      }).compile();

      const customService = module.get<FlowAuthService>(FlowAuthService);

      expect(customService.cookieName).toBe('custom_session');
    });
  });
});
