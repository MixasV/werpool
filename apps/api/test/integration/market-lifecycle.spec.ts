import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Market Lifecycle (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete market flow', () => {
    it('should create, open, trade, close, and settle market', async () => {
      // Step 1: Create market
      const createResponse = await request(app.getHttpServer())
        .post('/markets')
        .send({
          title: 'Integration Test Market',
          description: 'Market for integration testing',
          outcomes: ['Yes', 'No'],
          category: 'TEST',
          openAt: new Date(Date.now() + 1000).toISOString(),
          closeAt: new Date(Date.now() + 60000).toISOString(),
        });

      expect(createResponse.status).toBe(201);
      const marketId = createResponse.body.id;

      // Step 2: Get market
      const getResponse = await request(app.getHttpServer())
        .get(`/markets/${marketId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.state).toBe('CREATED');

      // Step 3: Open market (wait for openAt)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const openResponse = await request(app.getHttpServer())
        .post(`/markets/${marketId}/open`);

      expect(openResponse.status).toBe(200);

      // Step 4: Get quote
      const quoteResponse = await request(app.getHttpServer())
        .post(`/markets/${marketId}/quote`)
        .send({
          outcomeIndex: 0,
          shares: 10,
          isBuy: true,
        });

      expect(quoteResponse.status).toBe(200);
      expect(quoteResponse.body.cost).toBeDefined();

      // Step 5: Close market
      const closeResponse = await request(app.getHttpServer())
        .post(`/markets/${marketId}/close`);

      expect(closeResponse.status).toBe(200);

      // Step 6: Settle market
      const settleResponse = await request(app.getHttpServer())
        .post(`/markets/${marketId}/settle`)
        .send({
          winningOutcomeIndex: 0,
        });

      expect(settleResponse.status).toBe(200);

      // Verify final state
      const finalState = await request(app.getHttpServer())
        .get(`/markets/${marketId}`);

      expect(finalState.body.state).toBe('SETTLED');
    }, 70000);
  });

  describe('Market validation', () => {
    it('should reject invalid market creation', async () => {
      const response = await request(app.getHttpServer())
        .post('/markets')
        .send({
          title: '',
          outcomes: ['Only One'],
        });

      expect(response.status).toBe(400);
    });

    it('should reject trading on closed market', async () => {
      const market = await prisma.market.findFirst({
        where: { state: 'CLOSED' },
      });

      if (market) {
        const response = await request(app.getHttpServer())
          .post(`/markets/${market.id}/execute`)
          .send({
            outcomeIndex: 0,
            shares: 10,
            isBuy: true,
          });

        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
