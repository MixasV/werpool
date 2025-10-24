#!/usr/bin/env ts-node
/**
 * Seed script for staging environment
 * Creates sample markets and trades for QA testing
 */

import { PrismaClient, MarketState, MarketCategory, OutcomeStatus, PointEventSource } from '@prisma/client';

const prisma = new PrismaClient();

async function seedStaging() {
  console.log('🌱 Seeding staging environment...');

  // Create test users
  const testUser1 = await prisma.flowUser.upsert({
    where: { address: '0xtest1' },
    update: {},
    create: {
      address: '0xtest1',
      username: 'testuser1',
      roles: ['USER'],
    },
  });

  const testUser2 = await prisma.flowUser.upsert({
    where: { address: '0xtest2' },
    update: {},
    create: {
      address: '0xtest2',
      username: 'testuser2',
      roles: ['USER', 'ORACLE'],
    },
  });

  console.log('✅ Created test users');

  // Create sample crypto market
  const cryptoMarket = await prisma.market.create({
    data: {
      slug: 'btc-100k-2024',
      title: 'Will Bitcoin reach $100,000 by end of 2024?',
      description: 'Market resolves YES if BTC price reaches or exceeds $100,000 USD on any major exchange before Dec 31, 2024 23:59 UTC',
      state: MarketState.ACTIVE,
      category: MarketCategory.CRYPTO,
      closeAt: new Date('2024-12-31T23:59:59Z'),
      tradingLockAt: new Date('2024-12-31T20:00:00Z'),
      tags: ['bitcoin', 'crypto', 'price'],
      outcomes: {
        create: [
          {
            label: 'Yes',
            status: OutcomeStatus.ACTIVE,
            impliedProbability: 0.65,
            liquidity: 5000,
          },
          {
            label: 'No',
            status: OutcomeStatus.ACTIVE,
            impliedProbability: 0.35,
            liquidity: 5000,
          },
        ],
      },
      liquidityPool: {
        create: {
          tokenSymbol: 'FLOW',
          totalLiquidity: 10000,
          feeBps: 30,
          providerCount: 1,
        },
      },
    },
  });

  console.log('✅ Created crypto market:', cryptoMarket.slug);

  // Create sample sports market
  const sportsMarket = await prisma.market.create({
    data: {
      slug: 'lakers-warriors-2024',
      title: 'Lakers vs Warriors - Who will win?',
      description: 'NBA game prediction market',
      state: MarketState.ACTIVE,
      category: MarketCategory.SPORTS,
      closeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      tags: ['nba', 'basketball', 'lakers', 'warriors'],
      outcomes: {
        create: [
          {
            label: 'Lakers Win',
            status: OutcomeStatus.ACTIVE,
            impliedProbability: 0.55,
            liquidity: 3000,
          },
          {
            label: 'Warriors Win',
            status: OutcomeStatus.ACTIVE,
            impliedProbability: 0.45,
            liquidity: 3000,
          },
        ],
      },
      liquidityPool: {
        create: {
          tokenSymbol: 'FLOW',
          totalLiquidity: 6000,
          feeBps: 30,
          providerCount: 1,
        },
      },
    },
  });

  console.log('✅ Created sports market:', sportsMarket.slug);

  // Give test users some points
  await prisma.userPointLedger.create({
    data: {
      address: testUser1.address,
      source: PointEventSource.ADMIN,
      amount: 10000,
      notes: 'Staging seed - initial balance',
    },
  });

  await prisma.userPoints.upsert({
    where: { address: testUser1.address },
    create: {
      address: testUser1.address,
      total: 10000,
    },
    update: {
      total: { increment: 10000 },
    },
  });

  await prisma.userPointLedger.create({
    data: {
      address: testUser2.address,
      source: PointEventSource.ADMIN,
      amount: 10000,
      notes: 'Staging seed - initial balance',
    },
  });

  await prisma.userPoints.upsert({
    where: { address: testUser2.address },
    create: {
      address: testUser2.address,
      total: 10000,
    },
    update: {
      total: { increment: 10000 },
    },
  });

  console.log('✅ Gave test users 10,000 points each');

  console.log('\n🎉 Staging environment seeded successfully!');
  console.log('\nTest Users:');
  console.log('  - testuser1 (0xtest1) - USER role');
  console.log('  - testuser2 (0xtest2) - USER + ORACLE roles');
  console.log('\nSample Markets:');
  console.log('  - btc-100k-2024 (Crypto)');
  console.log('  - lakers-warriors-2024 (Sports)');
}

seedStaging()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
