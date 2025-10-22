// Load testing with k6
// Run: k6 run test/performance/load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '2m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% failures
    errors: ['rate<0.1'],              // Less than 10% errors
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001';

export default function () {
  // Test 1: List markets
  const marketsRes = http.get(`${BASE_URL}/markets`);
  check(marketsRes, {
    'markets list status 200': (r) => r.status === 200,
    'markets list response time < 200ms': (r) => r.timings.duration < 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test 2: Get specific market
  if (marketsRes.status === 200) {
    const markets = JSON.parse(marketsRes.body);
    if (markets.length > 0) {
      const marketId = markets[0].id;
      
      const marketRes = http.get(`${BASE_URL}/markets/${marketId}`);
      check(marketRes, {
        'market detail status 200': (r) => r.status === 200,
        'market detail response time < 300ms': (r) => r.timings.duration < 300,
      }) || errorRate.add(1);
    }
  }

  sleep(1);

  // Test 3: Get trade quote
  const quotePayload = JSON.stringify({
    outcomeIndex: 0,
    shares: 10,
    isBuy: true,
  });

  const quoteRes = http.post(
    `${BASE_URL}/markets/test-market/quote`,
    quotePayload,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(quoteRes, {
    'quote status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'quote response time < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(2);
}

export function handleSummary(data) {
  return {
    'performance-report.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
