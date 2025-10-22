import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ProfileVisibility,
  TradeHistoryVisibility,
  Prisma,
} from '@prisma/client';

import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockUser = {
    address: '0x1234567890abcdef',
    label: 'Test User',
    bio: 'Test bio',
    avatarUrl: 'https://example.com/avatar.png',
    email: 'test@example.com',
    emailVerifiedAt: new Date(),
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
    profileVisibility: ProfileVisibility.PUBLIC,
    tradeHistoryVisibility: TradeHistoryVisibility.PUBLIC,
    marketingOptIn: false,
    firstSeenAt: new Date('2025-01-01'),
    lastSeenAt: new Date('2025-01-10'),
    roles: [],
  };

  beforeEach(async () => {
    const mockPrismaService = {
      flowUser: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile with normalized address', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('0x1234567890ABCDEF');

      expect(result.address).toBe('0x1234567890abcdef');
      expect(prismaService.flowUser.findUnique).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        include: { roles: true },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('0xinvalid')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getProfileForAddress', () => {
    it('should return PUBLIC profile without session', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(mockUser);
      prismaService.flowUser.update.mockResolvedValue(mockUser);

      const result = await service.getProfileForAddress(
        '0x1234567890abcdef',
        null
      );

      expect(result.address).toBe('0x1234567890abcdef');
    });

    it('should allow ADMIN to view PRIVATE profile', async () => {
      const privateUser = {
        ...mockUser,
        profileVisibility: ProfileVisibility.PRIVATE,
      };
      prismaService.flowUser.findUnique.mockResolvedValue(privateUser);

      const session = {
        address: '0xadmin',
        roles: ['ADMIN' as any],
      };

      const result = await service.getProfileForAddress(
        '0x1234567890abcdef',
        session
      );

      expect(result.address).toBe('0x1234567890abcdef');
    });

    it('should allow user to view own PRIVATE profile', async () => {
      const privateUser = {
        ...mockUser,
        profileVisibility: ProfileVisibility.PRIVATE,
      };
      prismaService.flowUser.findUnique.mockResolvedValue(privateUser);

      const session = {
        address: '0x1234567890abcdef',
        roles: [],
      };

      const result = await service.getProfileForAddress(
        '0x1234567890abcdef',
        session
      );

      expect(result.address).toBe('0x1234567890abcdef');
    });

    it('should block non-admin from PRIVATE profile', async () => {
      const privateUser = {
        ...mockUser,
        profileVisibility: ProfileVisibility.PRIVATE,
      };
      prismaService.flowUser.findUnique.mockResolvedValue(privateUser);

      const session = {
        address: '0xother',
        roles: [],
      };

      await expect(
        service.getProfileForAddress('0x1234567890abcdef', session)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should require authentication for NETWORK profile', async () => {
      const networkUser = {
        ...mockUser,
        profileVisibility: ProfileVisibility.NETWORK,
      };
      prismaService.flowUser.findUnique.mockResolvedValue(networkUser);

      await expect(
        service.getProfileForAddress('0x1234567890abcdef', null)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow authenticated user to view NETWORK profile', async () => {
      const networkUser = {
        ...mockUser,
        profileVisibility: ProfileVisibility.NETWORK,
      };
      prismaService.flowUser.findUnique.mockResolvedValue(networkUser);
      prismaService.flowUser.update.mockResolvedValue(networkUser);

      const session = {
        address: '0xother',
        roles: [],
      };

      const result = await service.getProfileForAddress(
        '0x1234567890abcdef',
        session
      );

      expect(result.address).toBe('0x1234567890abcdef');
    });
  });

  describe('updateProfile', () => {
    it('should update user label', async () => {
      const updated = { ...mockUser, label: 'New Label' };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updateProfile('0x1234567890abcdef', {
        label: 'New Label',
      });

      expect(result.profile.label).toBe('New Label');
      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          label: 'New Label',
        }),
        include: { roles: true },
      });
    });

    it('should clear label when empty string provided', async () => {
      const updated = { ...mockUser, label: null };
      prismaService.flowUser.update.mockResolvedValue(updated);

      await service.updateProfile('0x1234567890abcdef', { label: '' });

      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          label: null,
        }),
        include: { roles: true },
      });
    });

    it('should update bio', async () => {
      const updated = { ...mockUser, bio: 'New bio' };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updateProfile('0x1234567890abcdef', {
        bio: 'New bio',
      });

      expect(result.profile.bio).toBe('New bio');
    });

    it('should reject bio longer than 512 characters', async () => {
      const longBio = 'a'.repeat(513);

      await expect(
        service.updateProfile('0x1234567890abcdef', { bio: longBio })
      ).rejects.toThrow(BadRequestException);
    });

    it('should update avatarUrl', async () => {
      const updated = {
        ...mockUser,
        avatarUrl: 'https://example.com/new.png',
      };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updateProfile('0x1234567890abcdef', {
        avatarUrl: 'https://example.com/new.png',
      });

      expect(result.profile.avatarUrl).toBe('https://example.com/new.png');
    });

    it('should reject non-absolute avatarUrl', async () => {
      await expect(
        service.updateProfile('0x1234567890abcdef', {
          avatarUrl: 'relative/path.png',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should update marketingOptIn', async () => {
      const updated = { ...mockUser, marketingOptIn: true };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updateProfile('0x1234567890abcdef', {
        marketingOptIn: true,
      });

      expect(result.profile.marketingOptIn).toBe(true);
    });

    it('should update email and return verification token', async () => {
      const updated = {
        ...mockUser,
        email: 'newemail@example.com',
        emailVerifiedAt: null,
        emailVerificationToken: 'mock-token',
      };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updateProfile('0x1234567890abcdef', {
        email: 'newemail@example.com',
      });

      expect(result.profile.email).toBe('newemail@example.com');
      expect(result.verificationToken).toBeDefined();
      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          email: 'newemail@example.com',
          emailVerifiedAt: null,
        }),
        include: { roles: true },
      });
    });

    it('should normalize email to lowercase', async () => {
      const updated = { ...mockUser, email: 'test@example.com' };
      prismaService.flowUser.update.mockResolvedValue(updated);

      await service.updateProfile('0x1234567890abcdef', {
        email: 'TEST@EXAMPLE.COM',
      });

      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          email: 'test@example.com',
        }),
        include: { roles: true },
      });
    });

    it('should reject invalid email format', async () => {
      await expect(
        service.updateProfile('0x1234567890abcdef', {
          email: 'invalid-email',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should clear email when empty string provided', async () => {
      const updated = {
        ...mockUser,
        email: null,
        emailVerifiedAt: null,
      };
      prismaService.flowUser.update.mockResolvedValue(updated);

      await service.updateProfile('0x1234567890abcdef', { email: '' });

      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          email: null,
          emailVerifiedAt: null,
        }),
        include: { roles: true },
      });
    });

    it('should handle duplicate email error', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['email'] },
        }
      );
      prismaService.flowUser.update.mockRejectedValue(error);

      await expect(
        service.updateProfile('0x1234567890abcdef', {
          email: 'existing@example.com',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePrivacy', () => {
    it('should update profileVisibility', async () => {
      const updated = {
        ...mockUser,
        profileVisibility: ProfileVisibility.PRIVATE,
      };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updatePrivacy('0x1234567890abcdef', {
        profileVisibility: 'private',
      });

      expect(result.profileVisibility).toBe('private');
      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          profileVisibility: ProfileVisibility.PRIVATE,
        }),
        include: { roles: true },
      });
    });

    it('should update tradeHistoryVisibility', async () => {
      const updated = {
        ...mockUser,
        tradeHistoryVisibility: TradeHistoryVisibility.NETWORK,
      };
      prismaService.flowUser.update.mockResolvedValue(updated);

      const result = await service.updatePrivacy('0x1234567890abcdef', {
        tradeHistoryVisibility: 'network',
      });

      expect(result.tradeHistoryVisibility).toBe('network');
    });

    it('should reject invalid profileVisibility value', async () => {
      await expect(
        service.updatePrivacy('0x1234567890abcdef', {
          profileVisibility: 'invalid' as any,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid tradeHistoryVisibility value', async () => {
      await expect(
        service.updatePrivacy('0x1234567890abcdef', {
          tradeHistoryVisibility: 'invalid' as any,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle case-insensitive visibility values', async () => {
      const updated = {
        ...mockUser,
        profileVisibility: ProfileVisibility.PUBLIC,
      };
      prismaService.flowUser.update.mockResolvedValue(updated);

      await service.updatePrivacy('0x1234567890abcdef', {
        profileVisibility: 'PuBLic' as any,
      });

      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          profileVisibility: ProfileVisibility.PUBLIC,
        }),
        include: { roles: true },
      });
    });
  });

  describe('requestEmailVerification', () => {
    it('should generate verification token', async () => {
      prismaService.flowUser.findUnique.mockResolvedValue(mockUser);
      prismaService.flowUser.update.mockResolvedValue({
        ...mockUser,
        emailVerificationToken: 'token123',
      });

      const result = await service.requestEmailVerification(
        '0x1234567890abcdef'
      );

      expect(result.verificationToken).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(prismaService.flowUser.update).toHaveBeenCalled();
    });

    it('should throw if user has no email', async () => {
      const userWithoutEmail = { ...mockUser, email: null };
      prismaService.flowUser.findUnique.mockResolvedValue(userWithoutEmail);

      await expect(
        service.requestEmailVerification('0x1234567890abcdef')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      const userWithToken = {
        ...mockUser,
        emailVerificationToken: 'valid-token',
        emailVerificationExpiresAt: new Date(Date.now() + 86400000),
        emailVerifiedAt: null,
      };
      const verified = {
        ...mockUser,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      };

      prismaService.flowUser.findUnique.mockResolvedValue(userWithToken);
      prismaService.flowUser.update.mockResolvedValue(verified);

      const result = await service.verifyEmail(
        '0x1234567890abcdef',
        'valid-token'
      );

      expect(result.emailVerifiedAt).toBeDefined();
      expect(prismaService.flowUser.update).toHaveBeenCalledWith({
        where: { address: '0x1234567890abcdef' },
        data: expect.objectContaining({
          emailVerifiedAt: expect.any(Date),
          emailVerificationToken: null,
        }),
        include: { roles: true },
      });
    });

    it('should reject empty token', async () => {
      await expect(
        service.verifyEmail('0x1234567890abcdef', '')
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if no verification pending', async () => {
      const userWithoutToken = {
        ...mockUser,
        emailVerificationToken: null,
      };
      prismaService.flowUser.findUnique.mockResolvedValue(userWithoutToken);

      await expect(
        service.verifyEmail('0x1234567890abcdef', 'token')
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid token', async () => {
      const userWithToken = {
        ...mockUser,
        emailVerificationToken: 'correct-token',
        emailVerificationExpiresAt: new Date(Date.now() + 86400000),
      };
      prismaService.flowUser.findUnique.mockResolvedValue(userWithToken);

      await expect(
        service.verifyEmail('0x1234567890abcdef', 'wrong-token')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject expired token', async () => {
      const userWithExpiredToken = {
        ...mockUser,
        emailVerificationToken: 'token',
        emailVerificationExpiresAt: new Date(Date.now() - 1000),
      };
      prismaService.flowUser.findUnique.mockResolvedValue(
        userWithExpiredToken
      );

      await expect(
        service.verifyEmail('0x1234567890abcdef', 'token')
      ).rejects.toThrow(BadRequestException);
    });
  });
});
