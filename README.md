# Werpool - Decentralized Prediction Markets on Flow

**Live Demo:** [werpool.mixas.pro](https://werpool.mixas.pro)  
**Network:** Flow Testnet  
**Status:** ✅ Production-Ready

A prediction markets platform built on Flow blockchain featuring LMSR automated market making, NBA TopShot FastBreak challenges, and blockchain analytics via Find Labs API.

---

## 🎯 Flow Forte Hacks - Bounty Coverage

### ✅ 1. Best Killer App on Flow ($8,000)

**Full-featured prediction markets platform - LIVE on testnet:**

- ✅ **Consumer-ready UI**: Simple interface for creating and trading markets
- ✅ **LMSR Automated Market Maker**: Pure Cadence implementation with guaranteed liquidity
- ✅ **11 V4 Polymarket transactions**: Split position, merge, redeem, sealed betting
- ✅ **5 Cadence scripts**: Market data, order book, balances, sealed bets, prices
- ✅ **Professional admin panel**: Role-based access control, market management
- ✅ **Real money markets**: Trade sports outcomes, politics, crypto prices
- ✅ **E2E Testnet verified**: 6/6 tests passed, real transactions on Flow testnet

**Why it's a Killer App:**
- Built exclusively on Flow (no multi-chain)
- Solves real problem (prediction markets for sports fans)
- Production-deployed with stable uptime
- Consumer-grade UX accessible to non-crypto users

---

### ✅ 2. Best Use of Flow Forte Actions & Workflows ($6,000-12,000)

**Scheduled Transactions for Autonomous Market Operations:**

✅ **AutoRevealHandler Contract** (138 lines Cadence)
- Implements `TransactionHandler` interface
- Scheduled execution for sealed bet reveals
- Automatic payout to winners after 30 days
- Platform encryption key management

✅ **Auto-reveal Transaction** (62 lines)
- `autoRevealSealedBetV4.cdc` - decrypts sealed bets
- Executes reveal + claim payout atomically
- Triggered by Flow blockchain scheduler
- No external keepers needed

✅ **Cron Fallback System**
- `@nestjs/schedule` integration
- Runs every 6 hours as safety net
- Catches failed scheduled transactions
- Marks expired bets as FORFEITED

✅ **Scheduled Market Settlement**
- Markets settle automatically at close time
- No manual intervention required
- On-chain proof of settlement timestamp
- Autonomous workflow from creation to payout

**Innovation:** First prediction markets platform using Flow Scheduled Transactions for fully autonomous market lifecycle.

---

### ✅ 3. Best Existing Code Integration ($6,000)

**Major Enhancements During Hackathon:**

✅ **Polymarket V4 Implementation** (Nov 3, 2025)
- Before: Basic prediction markets (60% complete)
- Added: 11 new transactions, 5 scripts
- Sealed betting mechanism
- Position splitting/merging
- Order book matching
- **Status:** 100% complete

✅ **NBA TopShot FastBreak** (Nov 3, 2025)
- Before: Concept only (0% code)
- Added: Full challenge system
- Frontend (4 pages: challenges, create, details, markets)
- Backend API (5 endpoints)
- Cadence transactions (create, accept, cancel, claim)
- GraphQL leaderboard sync
- **Status:** 100% complete

✅ **Scheduled Transactions** (Nov 3, 2025)
- Before: Not implemented (0%)
- Added: AutoRevealHandler contract
- Setup transaction
- Cron fallback
- **Status:** 100% complete

✅ **Find Labs Analytics** (Oct-Nov 2025)
- Before: No analytics layer
- Added: FindLabsClient (141 lines)
- AnalyticsService (136 lines)
- 5 API endpoints
- Unit tests (292 lines)
- **Status:** 100% complete

✅ **UI/UX Improvements** (Nov 3, 2025)
- Before: Russian text, mixed navigation
- Added: English-only UI
- Removed sidebar for full-width
- FCL wallet metadata (logo, description)
- Portfolio page fixes
- Draft markets hidden
- **Status:** 100% complete

**Timeline:** Started Oct 21, major work Nov 2-3  
**Evidence:** Git commits, E2E test reports, production deployment  

---

### ✅ 4. Dapper: Top Game Integration - NBA Top Shot ($5,000-9,000)

**FastBreak Challenge System - FULLY IMPLEMENTED:**

✅ **Peer-to-Peer Challenges**
- Create public or private challenges
- Stake FLOW tokens in escrow
- Invite opponents by TopShot username
- Automated settlement from leaderboard data

✅ **Frontend Pages** (4 pages, 100+ lines each)
- `/fastbreak/challenges` - Browse all challenges
- `/fastbreak/challenges/[id]` - Challenge details & accept
- `/fastbreak/create` - Create new challenge
- `/fastbreak/markets` - Prediction markets on runs

✅ **Backend API** (5 endpoints)
- `POST /fastbreak/challenges` - Create challenge
- `GET /fastbreak/challenges` - List challenges
- `GET /fastbreak/challenges/:id` - Get challenge details
- `POST /fastbreak/challenges/:id/accept` - Accept challenge
- `DELETE /fastbreak/challenges/:id` - Cancel challenge

✅ **Cadence Transactions** (4 files)
- `fastBreakCreateChallenge.cdc` - Lock FLOW in escrow
- `fastBreakAcceptChallenge.cdc` - Opponent locks stake
- `fastBreakClaimWinnings.cdc` - Winner claims payout
- `fastBreakCancelChallenge.cdc` - Creator cancels

✅ **TopShot Integration**
- GraphQL API integration for leaderboard
- Real-time rank tracking
- Username lookup and verification
- Moment ownership verification

✅ **Automated Market Creation**
- New prediction markets for active runs
- Bet on which player leads FastBreak
- Settlement from TopShot data

**Technical Stack:**
- TopShot GraphQL API: `https://public-api.nba flow.com/graphql`
- FastBreak leaderboard sync service
- WebSocket updates for real-time ranks
- Integration with CoreMarketHub contracts

---

### ✅ 5. Find Labs: Best Use of API ($1,000)

**Blockchain Analytics Layer - FULLY IMPLEMENTED:**

✅ **FindLabsClient** (141 lines)
- `getTransactions()` - Query transactions by contract/event
- `getTransaction(txId)` - Get transaction details
- `getEvents()` - Filter events by type and block range
- `getTransactionEvents(txId)` - Events for specific TX
- `getBlock(blockHeight)` - Block information
- `getAccountTransactions(address)` - User activity history
- `search(query)` - Omnisearch across Cadence & EVM

✅ **AnalyticsService** (136 lines)
- `getMarketTransactionHistory()` - Trade history per market
- `getSettlementProof()` - On-chain proof of market settlement
- `getTradingVolumeAnalytics()` - Volume aggregation by day
- `getUserActivityDashboard()` - User stats and history

✅ **API Endpoints** (5 endpoints)
- `GET /analytics/markets/:id/transactions` - Market trade history
- `GET /analytics/markets/:id/settlement-proof` - Settlement verification
- `GET /analytics/trading-volume` - Platform-wide volume
- `GET /analytics/users/:address/activity` - User dashboard
- `GET /analytics/search` - Omnisearch integration

✅ **Unit Tests** (292 lines)
- FindLabsClient mocks
- AnalyticsService test suite
- 10+ test cases passing
- Error handling verified

✅ **Integration Points**
- Market detail pages show transaction history
- Settlement proof with block height & timestamp
- User profiles display activity from Find Labs
- Analytics dashboard with volume charts
- Search functionality across platform

**Find Labs API Usage:**
- Flow API v1: `/flow/v1/transaction`, `/flow/v1/block`
- Simple API v1: `/simple/v1/events`
- Public API v1: `/public/v1/resolver` (Omnisearch)

---

### ⚠️ 6. aiSports: Integration ($1,000)

**Partial Implementation - Backend Only:**

✅ **What Works:**
- Read $JUICE balance via Cadence script
- Read user's aiSports NFT collection
- Read fantasy score from escrow contract
- Meta prediction markets (backend API)
- Access gating by $JUICE balance and NFT rarity

❌ **What's Missing:**
- No write operations ($JUICE transfers, staking)
- No frontend UI for aiSports markets
- No escrow contest creation
- Markets only accessible via API

**Status:** Backend infrastructure ready (45% complete), needs UI and transaction implementation.

---

## 🏗️ Technical Architecture

### Smart Contracts (Cadence)

**Deployed on Flow Testnet** (`0x3ea7ac2bcdd8bcef`):

```
CoreMarketHub.cdc              # Market lifecycle, state management
LMSRAmm.cdc                    # Logarithmic Market Scoring Rule
OutcomeToken.cdc               # Fungible outcome tokens
PolymarketV4.cdc               # Sealed betting, position splitting
OrderBookV4.cdc                # Order matching engine
SealedBettingV4.cdc            # Privacy-preserving bets
AutoRevealHandler.cdc          # Scheduled transaction handler
ScheduledTransactionHandlers   # Flow native scheduler integration
```

**Transactions (11 V4 files):**
- `splitPositionV4.cdc` - Create complete sets
- `mergePositionV4.cdc` - Redeem complete sets
- `redeemWinningSharesV4.cdc` - Claim winnings after settlement
- `createBuyOrderV4.cdc` / `createSellOrderV4.cdc` - Order book trading
- `cancelOrderV4.cdc` - Cancel open orders
- `commitSealedBetV4.cdc` - Create sealed bet
- `revealSealedBetV4.cdc` - Manual reveal
- `claimSealedBetPayoutV4.cdc` - Claim sealed bet winnings
- `autoRevealSealedBetV4.cdc` - Scheduled auto-reveal
- `buyOutcomeDirectlyV4.cdc` / `sellOutcomeDirectlyV4.cdc` - Market orders

**Scripts (5 V4 files):**
- `getMarketV4.cdc` - Read market state
- `getOrderBookV4.cdc` - Read buy/sell orders
- `getUserOutcomeBalancesV4.cdc` - Check user's outcome tokens
- `getSealedBetV4.cdc` - Read sealed bet data
- `getEffectivePricesV4.cdc` - Calculate current market prices

---

### Backend (NestJS + TypeScript)

**615 lines** - Find Labs analytics layer  
**732 lines** - aiSports meta markets service  
**441 lines** - aiSports automation service  
**361 lines** - aiSports Flow integration  

```
apps/api/src/
├── markets/                   # Market CRUD, trading logic
├── polymarket-v4/             # V4 transactions & sealed bets
├── fastbreak/                 # TopShot FastBreak integration
│   ├── fastbreak-challenge.service.ts
│   ├── fastbreak-scraper.service.ts
│   └── fastbreak-oracle.service.ts
├── aisports/                  # aiSports meta markets
│   └── oracles/
│       └── meta-prediction.service.ts
├── analytics/                 # Find Labs integration
│   ├── find-labs.client.ts
│   ├── analytics.service.ts
│   └── analytics.controller.ts
├── scheduler/                 # Scheduled tasks & settlement
│   └── scheduled-settlement.service.ts (cron fallback)
├── roles/                     # On-chain role verification
└── monitoring/                # Metrics, health checks, alerts
```

**Database:** PostgreSQL 16 + Prisma ORM  
**Caching:** Redis 7 for session and data caching  
**Real-time:** WebSockets for live market updates  

---

### Frontend (Next.js 14 + TypeScript)

**4 FastBreak pages**, admin panel with navigation, market explorer:

```
apps/web/app/
├── markets/                   # Market discovery & trading UI
├── fastbreak/                 # TopShot integration
│   ├── challenges/            # Browse challenges
│   ├── challenges/[id]/       # Challenge details & accept
│   ├── create/                # Create new challenge
│   └── markets/               # FastBreak prediction markets
├── admin/                     # Admin panel (7 sections)
│   ├── Roles management
│   ├── Monitoring dashboard
│   ├── Scheduler controls
│   ├── Points & leaderboard
│   ├── Markets overview
│   ├── Liquidity monitoring
│   └── FastBreak admin
├── profile/                   # User portfolio & activity
└── lib/
    ├── flow-config.ts         # FCL wallet integration
    ├── fastbreak-api.ts       # FastBreak API client
    └── aisports/api.ts        # aiSports API client
```

**UI Features:**
- Mobile-responsive design
- FCL wallet integration (logo, metadata)
- Real-time market updates
- Transaction history from Find Labs
- Settlement proof display

---

## 🧪 Testing & Verification

### E2E Testnet Tests (Nov 3, 2025)

**Results:** ✅ 6/6 tests passed (100% success rate)

1. ✅ **getMarketV4** - Market data retrieved correctly
2. ✅ **getOrderBookV4** - Order book accessible, 1 buy order found
3. ✅ **getUserOutcomeBalancesV4** - Balances tracked correctly
4. ✅ **getSealedBetV4** - Script works (no sealed bets yet)
5. ✅ **splitPositionV4** - 10 FLOW → complete sets (TX: `a2eb0c46...`)
6. ✅ **createBuyOrderV4** - Buy order created (TX: `4fd569d2...`)

**Flowscan Explorer:**
- Account: [0x3ea7ac2bcdd8bcef](https://testnet.flowscan.io/account/0x3ea7ac2bcdd8bcef)
- Split TX: [a2eb0c46...](https://testnet.flowscan.io/tx/a2eb0c460427197ccdf096f1a1466137b87f05e31c80390dbf346b81448525da)

**Verification:**
- Before split: `[25, 5, 5, 5]` outcome tokens
- After split: `[35, 15, 15, 15]` outcome tokens
- +10 tokens per outcome ✅

---

### Unit Tests

- **Find Labs Analytics**: 10 tests passing
- **aiSports Services**: 10 tests passing  
- **TypeScript Compilation**: 0 errors (backend & frontend)
- **Backend Build**: ✅ Success

---

## 🚀 Live Deployment

### Production Environment

**URL:** https://werpool.mixas.pro  
**Network:** Flow Testnet  
**Contracts:** `0x3ea7ac2bcdd8bcef`  
**Deployment:** PM2 (process manager)  
**Database:** PostgreSQL 14  
**Uptime:** Stable (0 crashes after Nov 3 fix)  

### Services Status

- ✅ **API** (port 3001): Online, 0 errors
- ✅ **Web** (port 3000): Online, responsive
- ✅ **PostgreSQL**: Online
- ✅ **Redis**: Online

### Recent Fixes (Nov 3, 2025)

- ✅ Fixed API 502 error (dependency injection)
- ✅ Removed navigation sidebar (full-width layout)
- ✅ Added FCL wallet metadata (logo, description)
- ✅ Fixed portfolio redirect loop
- ✅ Hidden draft markets from public view

---

## ✨ Key Features

### 1. LMSR Prediction Markets
- **Pure Cadence implementation** of Logarithmic Market Scoring Rule
- Guaranteed liquidity for all market sizes
- Real-time price calculation
- Multi-outcome support (binary and multi-choice)

### 2. Polymarket V4 Mechanics
- **Sealed betting**: Hide bet direction until reveal
- **Position splitting**: Create complete sets (YES + NO tokens)
- **Order book**: Limit orders with price/size
- **Auto-reveal**: Scheduled reveal after 30 days

### 3. NBA TopShot FastBreak
- **Peer challenges**: Compete with friends on FastBreak runs
- **Stake escrow**: FLOW tokens locked until settlement
- **Leaderboard sync**: Real-time rank updates
- **Prediction markets**: Bet on which player leads

### 4. Blockchain Analytics (Find Labs)
- **Transaction history**: View all market trades
- **Settlement proof**: On-chain verification of results
- **User activity**: Personal trading dashboard
- **Omnisearch**: Search transactions, accounts, blocks

### 5. Admin Panel
- **7 sections**: Roles, Monitoring, Scheduler, Points, Markets, Liquidity, FastBreak
- **Role-based access**: ADMIN, OPERATOR, ORACLE, PATROL
- **Market management**: Activate, suspend, settle, void
- **System metrics**: Errors, performance, health checks

---

## 📊 Statistics

### Platform Metrics
- **Markets Created**: 70+ (testnet)
- **Contracts Deployed**: 8 core contracts
- **Transactions**: 11 V4 transaction types
- **Scripts**: 5 V4 query scripts
- **API Endpoints**: 50+ endpoints
- **Frontend Pages**: 15+ pages

### Codebase
- **Backend**: ~10,000 lines TypeScript
- **Frontend**: ~8,000 lines TypeScript/React
- **Smart Contracts**: ~3,000 lines Cadence
- **Tests**: 600+ lines (unit tests)
- **Total**: ~22,000 lines of code

---

## 🎓 Innovation Summary

### What Makes Werpool Unique

1. **First to use Scheduled Transactions**
   - Autonomous sealed bet reveals
   - No external keeper infrastructure
   - Fully on-chain execution

2. **LMSR in Pure Cadence**
   - No off-chain computation
   - Transparent pricing algorithm
   - Verifiable liquidity guarantees

3. **Real Sports Integration**
   - NBA TopShot FastBreak challenges
   - aiSports fantasy score verification
   - Live leaderboard synchronization

4. **Polymarket V4 on Flow**
   - Privacy-preserving sealed bets
   - Position splitting mechanics
   - Order book matching

5. **Blockchain Analytics**
   - Find Labs API integration
   - Transaction history visualization
   - Settlement proof generation

---

## 🏆 Bounty Summary

| Bounty | Amount | Status | Key Deliverables |
|--------|--------|--------|------------------|
| **Killer App** | $8,000 | ✅ Ready | Full platform live on testnet |
| **Forte Actions** | $6-12K | ✅ Ready | Scheduled Transactions + AutoRevealHandler |
| **Existing Integration** | $6,000 | ✅ Ready | V4, FastBreak, Find Labs (major enhancements) |
| **TopShot** | $5-9K | ✅ Ready | FastBreak challenges (full implementation) |
| **Find Labs** | $1,000 | ✅ Ready | Analytics layer (615 lines + tests) |
| **aiSports** | $1,000 | ⚠️ Partial | Backend only, needs UI |

**Total Eligible:** $26,000 - $36,000 USDC

---

## 🔗 Resources

- **Live Platform**: [werpool.mixas.pro](https://werpool.mixas.pro)
- **GitHub**: [github.com/MixasV/werpool](https://github.com/MixasV/werpool)
- **Testnet Explorer**: [testnet.flowscan.io](https://testnet.flowscan.io/account/0x3ea7ac2bcdd8bcef)
- **Flow Docs**: [link.flow.com/ForteDevelopers](https://link.flow.com/ForteDevelopers)
- **NBA TopShot**: [nbatopshot.com](https://nbatopshot.com)
- **Find Labs**: [find.xyz](https://find.xyz)

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/MixasV/werpool.git
cd werpool

# Install dependencies
pnpm install

# Set up environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your Flow testnet account

# Run database migrations
cd apps/api && pnpm prisma migrate dev

# Start development servers
cd ../.. && pnpm dev

# API: http://localhost:3001
# Web: http://localhost:3000
```

---

## 📄 License

MIT License - See LICENSE file

---

**Built for Flow Forte Hacks**  
**By:** MixasV  
**Date:** November 2025  
**Status:** ✅ Production-Ready on Flow Testnet
