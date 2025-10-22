import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { AppModule } from '../../src/app.module';

describe('Authentication Flow (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Flow authentication', () => {
    it('should issue challenge for address', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/flow/challenge')
        .send({
          address: '0x1234567890abcdef',
        });

      expect(response.status).toBe(201);
      expect(response.body.nonce).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
    });

    it('should reject invalid address format', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/flow/challenge')
        .send({
          address: 'invalid',
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should normalize addresses', async () => {
      const response1 = await request(app.getHttpServer())
        .post('/auth/flow/challenge')
        .send({
          address: '0x1234567890ABCDEF',
        });

      const response2 = await request(app.getHttpServer())
        .post('/auth/flow/challenge')
        .send({
          address: '0x1234567890abcdef',
        });

      expect(response1.body.address).toBe(response2.body.address);
    });
  });

  describe('Session management', () => {
    it('should reject requests without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/profile');

      expect(response.status).toBe(401);
    });

    it('should reject expired session', async () => {
      const response = await request(app.getHttpServer())
        .get('/profile')
        .set('Authorization', 'Bearer expired-token');

      expect(response.status).toBe(401);
    });
  });

  describe('API token authentication', () => {
    it('should accept valid API token', async () => {
      if (process.env.API_ACCESS_TOKEN) {
        const response = await request(app.getHttpServer())
          .get('/markets')
          .set('X-API-Token', process.env.API_ACCESS_TOKEN);

        expect(response.status).toBe(200);
      }
    });

    it('should reject invalid API token', async () => {
      if (process.env.API_ACCESS_TOKEN) {
        const response = await request(app.getHttpServer())
          .get('/markets')
          .set('X-API-Token', 'invalid-token');

        expect(response.status).toBe(403);
      }
    });
  });
});
