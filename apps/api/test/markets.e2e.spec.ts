import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Markets API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    
    prisma = app.get<PrismaService>(PrismaService);
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/markets (GET)', () => {
    it('should return list of markets', () => {
      return request(app.getHttpServer())
        .get('/markets')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should filter by category', () => {
      return request(app.getHttpServer())
        .get('/markets?category=CRYPTO')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('category', 'CRYPTO');
          }
        });
    });

    it('should filter by state', () => {
      return request(app.getHttpServer())
        .get('/markets?state=ACTIVE')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('state', 'ACTIVE');
          }
        });
    });
  });

  describe('/markets/:slug (GET)', () => {
    it('should return market details', async () => {
      const markets = await prisma.market.findMany({ take: 1 });
      if (markets.length === 0) {
        return;
      }

      return request(app.getHttpServer())
        .get(`/markets/${markets[0].slug}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('slug');
          expect(res.body).toHaveProperty('title');
        });
    });

    it('should return 404 for non-existent market', () => {
      return request(app.getHttpServer())
        .get('/markets/non-existent-market')
        .expect(404);
    });
  });

  describe('/markets/:slug/quote (POST)', () => {
    it('should calculate trade quote', async () => {
      const markets = await prisma.market.findMany({
        where: { state: 'ACTIVE' },
        include: { outcomes: true },
        take: 1,
      });

      if (markets.length === 0 || markets[0].outcomes.length === 0) {
        return;
      }

      const market = markets[0];

      return request(app.getHttpServer())
        .post(`/markets/${market.slug}/quote`)
        .send({
          outcomeIndex: 0,
          shares: 10,
          isBuy: true,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('cost');
          expect(res.body).toHaveProperty('shares');
          expect(res.body).toHaveProperty('pricePerShare');
        });
    });

    it('should reject invalid shares amount', async () => {
      const markets = await prisma.market.findMany({ take: 1 });
      if (markets.length === 0) {
        return;
      }

      return request(app.getHttpServer())
        .post(`/markets/${markets[0].slug}/quote`)
        .send({
          outcomeIndex: 0,
          shares: -10,
          isBuy: true,
        })
        .expect(400);
    });
  });
});
