import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('with API_ACCESS_TOKEN configured', () => {
    beforeEach(async () => {
      process.env.API_ACCESS_TOKEN = 'test-secret-token';

      const module: TestingModule = await Test.createTestingModule({
        providers: [AuthService],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should allow valid token', () => {
      expect(() => {
        service.validateAccessToken('test-secret-token');
      }).not.toThrow();
    });

    it('should reject invalid token', () => {
      expect(() => {
        service.validateAccessToken('wrong-token');
      }).toThrow(ForbiddenException);
    });

    it('should reject missing token', () => {
      expect(() => {
        service.validateAccessToken(undefined);
      }).toThrow(ForbiddenException);
    });

    it('should reject empty token', () => {
      expect(() => {
        service.validateAccessToken('');
      }).toThrow(ForbiddenException);
    });
  });

  describe('without API_ACCESS_TOKEN configured', () => {
    beforeEach(async () => {
      delete process.env.API_ACCESS_TOKEN;

      const module: TestingModule = await Test.createTestingModule({
        providers: [AuthService],
      }).compile();

      service = module.get<AuthService>(AuthService);
    });

    it('should allow any token when not configured', () => {
      expect(() => {
        service.validateAccessToken('any-token');
      }).not.toThrow();
    });

    it('should allow missing token when not configured', () => {
      expect(() => {
        service.validateAccessToken(undefined);
      }).not.toThrow();
    });

    it('should allow empty token when not configured', () => {
      expect(() => {
        service.validateAccessToken('');
      }).not.toThrow();
    });
  });
});
