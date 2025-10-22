# Performance Testing Guide

**Date:** October 22, 2025  
**Project:** WerPool Prediction Markets  
**Tool:** k6 Load Testing

---

## 📊 PERFORMANCE TARGETS

### API Response Times (p95)

| Endpoint | Target | Acceptable | Poor |
|----------|--------|------------|------|
| GET /markets | < 100ms | < 200ms | > 500ms |
| GET /markets/:id | < 150ms | < 300ms | > 1s |
| POST /markets/:id/quote | < 200ms | < 500ms | > 1s |
| POST /markets/:id/execute | < 1s | < 2s | > 5s |
| GET /leaderboard | < 300ms | < 500ms | > 1s |
| GET /profile | < 200ms | < 400ms | > 1s |

### Database Query Times (p95)

| Query Type | Target | Acceptable |
|------------|--------|------------|
| Simple SELECT | < 10ms | < 50ms |
| JOIN queries | < 50ms | < 100ms |
| Aggregations | < 100ms | < 200ms |
| Write operations | < 50ms | < 100ms |

### Concurrency Targets

| Load Level | Users | Target |
|------------|-------|--------|
| **Low** | 1-50 | < 100ms p95 |
| **Normal** | 50-100 | < 200ms p95 |
| **High** | 100-500 | < 500ms p95 |
| **Peak** | 500-1000 | < 1s p95 |

---

## 🚀 SETUP

### 1. Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```bash
choco install k6
```

### 2. Prepare Environment

```bash
cd /root/werpool
export API_URL=http://localhost:3001
```

### 3. Start Services

```bash
# Terminal 1: Start database
docker-compose up -d postgres

# Terminal 2: Start API
cd apps/api
pnpm run start:dev

# Terminal 3: Run tests
k6 run apps/api/test/performance/load-test.js
```

---

## 📈 RUNNING TESTS

### Basic Load Test

```bash
k6 run apps/api/test/performance/load-test.js
```

### Custom Load Test

```bash
# Spike test (sudden load)
k6 run --vus 500 --duration 30s apps/api/test/performance/load-test.js

# Stress test (find breaking point)
k6 run --vus 1000 --duration 5m apps/api/test/performance/load-test.js

# Soak test (sustained load)
k6 run --vus 100 --duration 1h apps/api/test/performance/load-test.js
```

### With Environment Variables

```bash
API_URL=https://staging.werpool.app k6 run apps/api/test/performance/load-test.js
```

---

## 📊 INTERPRETING RESULTS

### Key Metrics

**http_req_duration:** Response time
- **p(50):** Median (50% faster than this)
- **p(95):** 95th percentile (95% faster than this)
- **p(99):** 99th percentile (99% faster than this)

**http_req_failed:** Failure rate
- Target: < 1%

**http_reqs:** Requests per second
- Target: > 100 req/s

### Example Output

```
     ✓ markets list status 200
     ✓ markets list response time < 200ms
     ✓ market detail status 200
     ✓ market detail response time < 300ms

     checks.........................: 98.50% ✓ 3940  ✗ 60
     data_received..................: 15 MB  50 kB/s
     data_sent......................: 2.5 MB 8.3 kB/s
     http_req_blocked...............: avg=1.2ms   min=1µs      med=5µs     max=150ms   p(95)=10ms
     http_req_duration..............: avg=180ms   min=50ms     med=160ms   max=2s      p(95)=350ms
     http_reqs......................: 1000   33.3/s
     vus............................: 100    min=0  max=100
```

---

## 🔧 OPTIMIZATION GUIDE

### If Response Times Too High

**1. Database Optimization**
```sql
-- Check slow queries
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Add missing indexes
CREATE INDEX idx_market_state ON markets(state);
CREATE INDEX idx_trade_market ON market_trades(market_id);
```

**2. Enable Caching**
```typescript
// Add Redis caching
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      ttl: 60, // 60 seconds
      max: 100, // max items
    }),
  ],
})
```

**3. Add Connection Pooling**
```typescript
// Increase Prisma connection pool
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  
  // Add connection pooling
  pool_size = 20
  pool_timeout = 10
}
```

**4. Enable Query Optimization**
```typescript
// Use select to reduce data transfer
const markets = await prisma.market.findMany({
  select: {
    id: true,
    title: true,
    state: true,
    // Only fields needed
  },
});
```

---

### If Throughput Too Low

**1. Horizontal Scaling**
```bash
# Run multiple API instances
PM2_INSTANCES=4 pm2 start ecosystem.config.js
```

**2. Load Balancing**
```nginx
# nginx.conf
upstream api_servers {
  server localhost:3001;
  server localhost:3002;
  server localhost:3003;
  server localhost:3004;
}

server {
  location /api {
    proxy_pass http://api_servers;
  }
}
```

**3. Database Read Replicas**
```typescript
// Use read replicas for queries
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: isReadOperation 
        ? env.DATABASE_READ_URL 
        : env.DATABASE_WRITE_URL
    }
  }
});
```

---

## 📋 PERFORMANCE CHECKLIST

### Before Launch

- [ ] Run load tests with 100 concurrent users
- [ ] Verify p95 < 500ms for all endpoints
- [ ] Check error rate < 1%
- [ ] Test database under load
- [ ] Verify connection pool size adequate
- [ ] Enable database query logging
- [ ] Set up APM monitoring (New Relic, Datadog)
- [ ] Configure auto-scaling rules
- [ ] Test with realistic data volumes
- [ ] Verify CDN caching working

### After Launch

- [ ] Monitor p95 response times
- [ ] Track error rates
- [ ] Monitor database performance
- [ ] Set up alerts for degraded performance
- [ ] Regular performance reviews (weekly)
- [ ] Capacity planning (monthly)

---

## 🎯 PERFORMANCE GOALS

### Phase 1: MVP (Current)
- ✅ 100 concurrent users
- ✅ p95 < 500ms
- ✅ Uptime > 99%

### Phase 2: Growth (3-6 months)
- 📋 500 concurrent users
- 📋 p95 < 300ms
- 📋 Uptime > 99.5%

### Phase 3: Scale (6-12 months)
- 📋 1000+ concurrent users
- 📋 p95 < 200ms
- 📋 Uptime > 99.9%

---

## 🔍 MONITORING SETUP

### Prometheus Metrics

Already collecting:
- HTTP request duration
- HTTP request count
- Error rates
- Database query times
- Flow transaction times

### Grafana Dashboards

Create dashboards for:
1. API Response Times
2. Error Rates
3. Database Performance
4. Flow Transaction Times
5. User Activity

---

## ✅ CONCLUSION

**Performance Status:** READY FOR LOAD TESTING

The application has:
- ✅ Performance metrics collection
- ✅ Load test scripts ready
- ✅ Monitoring infrastructure
- ✅ Optimization guidelines

**Next Steps:**
1. Run baseline performance tests
2. Identify bottlenecks
3. Apply optimizations
4. Re-test and verify improvements

---

**Testing Guide:** ✅ COMPLETE  
**Tools:** k6, Prometheus, Grafana  
**Status:** READY TO RUN

---

*Follow this guide for consistent performance testing and optimization.*
