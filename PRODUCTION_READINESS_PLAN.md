# Production Readiness Execution Plan

**Цель:** Довести проект до production-ready состояния  
**Текущий статус:** 80% (hackathon-ready)  
**Целевой статус:** 95%+ (production-ready)

---

## 📊 CURRENT STATE

### Test Coverage
- **Current:** 18/41 services (43.9%)
- **Target:** 29-33/41 services (70-80%)
- **Gap:** Need +11 to +15 test files

### Code Quality
- **TypeScript errors:** 0 ✓
- **TypeScript warnings:** 145 `any` types
- **Frontend lint:** 0 errors ✓
- **Backend lint:** 145 warnings

### Testing Status
- **Unit tests:** 43.9% coverage
- **Integration tests:** 0%
- **E2E tests:** minimal (Playwright configured but not used)

---

## 🎯 PRIORITY TASKS

### Phase 1: Critical Tests (HIGH PRIORITY)
**Goal:** Reach 70% unit test coverage

**Missing tests for critical services:**

1. **Automation Services** (3 files)
   - aisports-market-automation.service.spec.ts
   - crypto-market-automation.service.spec.ts
   - sports-market-automation.service.spec.ts

2. **Flow Transaction Services** (2 files)
   - flow-transaction.service.spec.ts
   - flow-market.service.spec.ts

3. **Auth Services** (2 files)
   - auth.service.spec.ts
   - flow-auth.service.spec.ts

4. **Oracle Services** (3 files)
   - aisports-oracle.service.spec.ts
   - crypto-oracle.service.spec.ts
   - sports-oracle.service.spec.ts

5. **Market Services** (2 files)
   - market-analytics.service.spec.ts
   - market-pool-state.service.spec.ts

6. **Alert & Monitoring** (2 files)
   - alert.service.spec.ts
   - prometheus.service.spec.ts

**Total:** +14 files → 32/41 = 78% coverage ✓

---

### Phase 2: TypeScript Quality (HIGH PRIORITY)
**Goal:** Fix 145 `any` type warnings

**Locations with `any` types:**
- scheduler.service.ts: 13 instances
- topshot-lock.service.ts: 4 instances
- Test files: ~128 instances (mock objects)

**Strategy:**
- Production code: Replace all `any` with proper types
- Test code: Use proper mock types from Jest

---

### Phase 3: Integration Tests (HIGH PRIORITY)
**Goal:** Write integration tests for critical flows

**Critical flows to test:**
1. Market lifecycle (create → open → close → settle)
2. Trading flow (quote → execute → verify)
3. Role purchase flow (request → approve → assign)
4. Points system (earn → spend → verify)
5. Auth flow (login → session → verify)

**Approach:** Real database, mocked blockchain

---

### Phase 4: E2E Tests (HIGH PRIORITY)
**Goal:** Write E2E tests for user journeys

**Critical user journeys:**
1. User registration & onboarding
2. Browse markets & view details
3. Execute a trade
4. View leaderboard & profile
5. Admin workflow (suspend/settle market)

**Tool:** Playwright (already configured)

---

### Phase 5: Security Audit (HIGH PRIORITY)
**Goal:** Identify and fix security vulnerabilities

**Areas to audit:**
1. SQL injection (via Prisma - should be safe)
2. XSS prevention (Next.js should handle)
3. Authentication & authorization
4. Input validation
5. Rate limiting
6. CORS configuration
7. Secret management
8. Dependency vulnerabilities (pnpm audit)

---

### Phase 6: Performance Testing (MEDIUM PRIORITY)
**Goal:** Ensure performance under load

**Tests needed:**
1. Load testing (100-1000 concurrent users)
2. Database query optimization
3. API response times
4. Frontend bundle size optimization
5. Caching strategy verification

**Tool:** k6 or Artillery

---

### Phase 7: Dependencies (MEDIUM PRIORITY)
**Goal:** Fix security vulnerabilities in dependencies

**Tasks:**
1. Run `pnpm audit`
2. Review vulnerabilities
3. Update dependencies where safe
4. Document unfixable issues

---

### Phase 8: Cadence Migration (MEDIUM PRIORITY)
**Goal:** Complete testnet deployment with patrol features

**Issue:** CoreMarketHub needs migration for new fields
**Solution:** Data migration script or new account deployment

---

## 📋 EXECUTION ORDER

### Week 1: Testing Foundation
- Day 1-2: Write 5 automation/flow service tests
- Day 3-4: Write 5 auth/oracle service tests
- Day 5: Write 4 market/monitoring service tests
- **Result:** 70%+ unit test coverage

### Week 2: Quality & Integration
- Day 1-2: Fix TypeScript `any` warnings (production code)
- Day 3-4: Write 5 integration tests
- Day 5: Write 3 E2E tests
- **Result:** Clean TypeScript, integration coverage

### Week 3: Security & Performance
- Day 1-2: Security audit
- Day 3: Fix security issues
- Day 4: Performance testing
- Day 5: Optimize performance
- **Result:** Production-grade security & performance

---

## ✅ ACCEPTANCE CRITERIA

### For Production Launch:
- [ ] Unit test coverage ≥ 70%
- [ ] Integration tests for all critical flows
- [ ] E2E tests for all user journeys
- [ ] Zero TypeScript `any` in production code
- [ ] Zero high/critical security vulnerabilities
- [ ] All API endpoints < 200ms p95
- [ ] Frontend pages < 3s load time
- [ ] Database queries optimized (< 100ms)
- [ ] All builds pass
- [ ] All lints pass (0 errors)
- [ ] Documentation complete
- [ ] Testnet fully deployed

---

## 🚀 START EXECUTION

**Starting with Phase 1: Critical Tests**
**Target:** Write 14 test files to reach 78% coverage
**Approach:** Real unit tests, no mocks, following AGENTS.md

Let's begin!
