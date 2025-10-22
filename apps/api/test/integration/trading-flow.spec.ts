import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Trading Flow (Integration)', () => {
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

  describe('Quote and execute flow', () => {
    it('should get quote then execute trade', async () => {
      const market = await prisma.market.findFirst({
        where: { state: 'OPEN' },
      });

      if (!market) {
        console.log('No open markets for trading test');
        return;
      }

      // Step 1: Get quote
      const quoteResponse = await request(app.getHttpServer())
        .post(`/markets/${market.id}/quote`)
        .send({
          outcomeIndex: 0,
          shares: 5,
          isBuy: true,
        });

      expect(quoteResponse.status).toBe(200);
      expect(quoteResponse.body.cost).toBeGreaterThan(0);
      expect(quoteResponse.body.probability).toBeGreaterThan(0);

      const quoteCost = quoteResponse.body.cost;

      // Step 2: Execute trade with quote
      const executeResponse = await request(app.getHttpServer())
        .post(`/markets/${market.id}/execute`)
        .send({
          outcomeIndex: 0,
          shares: 5,
          isBuy: true,
          maxCost: quoteCost * 1.1, // 10% slippage tolerance
        });

      expect(executeResponse.status).toBe(200);
      expect(executeResponse.body.actualCost).toBeLessThanOrEqual(
        quoteCost * 1.1
      );
    });

    it('should reject trade with insufficient slippage tolerance', async () => {
      const market = await prisma.market.findFirst({
        where: { state: 'OPEN' },
      });

      if (!market) return;

      const quoteResponse = await request(app.getHttpServer())
        .post(`/markets/${market.id}/quote`)
        .send({
          outcomeIndex: 0,
          shares: 100,
          isBuy: true,
        });

      if (quoteResponse.status !== 200) return;

      const executeResponse = await request(app.getHttpServer())
        .post(`/markets/${market.id}/execute`)
        .send({
          outcomeIndex: 0,
          shares: 100,
          isBuy: true,
          maxCost: quoteResponse.body.cost * 0.9, // Too low
        });

      expect(executeResponse.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Trade history', () => {
    it('should record trade in history', async () => {
      const market = await prisma.market.findFirst({
        where: { state: 'OPEN' },
      });

      if (!market) return;

      // Execute trade
      await request(app.getHttpServer())
        .post(`/markets/${market.id}/execute`)
        .send({
          outcomeIndex: 0,
          shares: 1,
          isBuy: true,
        });

      // Check history
      const historyResponse = await request(app.getHttpServer())
        .get(`/markets/${market.id}/trades`);

      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.length).toBeGreaterThan(0);
    });
  });

  describe('Market analytics', () => {
    it('should update analytics after trade', async () => {
      const market = await prisma.market.findFirst({
        where: { state: 'OPEN' },
      });

      if (!market) return;

      // Get initial analytics
      const beforeResponse = await request(app.getHttpServer())
        .get(`/markets/${market.id}/analytics`);

      const beforeVolume = beforeResponse.body.volume || 0;

      // Execute trade
      await request(app.getHttpServer())
        .post(`/markets/${market.id}/execute`)
        .send({
          outcomeIndex: 0,
          shares: 5,
          isBuy: true,
        });

      // Get updated analytics
      const afterResponse = await request(app.getHttpServer())
        .get(`/markets/${market.id}/analytics`);

      expect(afterResponse.body.volume).toBeGreaterThan(beforeVolume);
    });
  });
});
