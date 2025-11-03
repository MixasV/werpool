# Werpool - Flow Blockchain Prediction Markets

A decentralized prediction market platform built on Flow blockchain, featuring NBA TopShot NFT integration, real-time data oracles, and both LMSR and Polymarket-style order book architectures.

**Live Demo:** [werpool.mixas.pro](https://werpool.mixas.pro)  
**Built for:** Flow Forte Hacks Hackathon 2025

---

## 🏆 Hackathon Bounties & Features

### 🎯 Primary Bounty: Best Killer App on Flow

**Consumer-oriented prediction markets platform** bringing Polymarket-style trading to Flow blockchain with:
- Real-world sports betting with Flow wallet integration
- NBA TopShot NFT bonus system for sports fans
- User-friendly UX for mass adoption (no Web3 knowledge required)
- AI-powered sports data oracles for automated market creation

### 🔗 Dapper Labs Integration (3 Bounties)

#### ✅ Top Dapper NFT Experience Unlocking Real Utility
**NBA TopShot Moment Integration:**
- **Moment Ownership Verification** - Users can stake NBA TopShot moments to earn bonus points
- **Team-Based Rewards** - Earn 18-200 points for moments of participating teams
- **Multi-Address Support** - Checks both Flow wallet and linked Dapper account
- **GraphQL API Integration** - Real-time moment data from `https://public-api.nbatopshot.com/graphql`
- **Account Linking** - Connect Dapper wallet with Flow wallet for unified experience

**Implementation:**
```typescript
// Backend services:
apps/api/src/topshot/topshot.service.ts           // 335 lines
apps/api/src/topshot/topshot-lock.service.ts     // 425 lines  
apps/api/src/topshot/topshot-reward.service.ts   // 499 lines
apps/api/src/topshot/topshot-graphql.client.ts   // GraphQL integration
apps/api/src/topshot/topshot-simple.client.ts    // Direct queries

// Frontend:
apps/web/app/components/dapper-account-linking.tsx
```

**Status:** ⚠️ Backend implemented (1259 lines), GraphQL integration partial (returns empty results)

#### ⚠️ Top Game Integration (FastBreak)
**FastBreak Challenge Integration:**
- Database models for challenges and leaderboards
- Backend services for tracking player performance
- Points system integration

**Implementation:**
```prisma
model FastBreakChallenge { ... }  // In schema.prisma
model FastBreakLeaderboard { ... }
```

**Status:** ❌ 10% complete (database schema only, no backend logic)

#### ❌ Best Dapper Data & Insights Tool
Not implemented - focused on trading experience instead of analytics tools.

---

### 🔌 Find Labs Integration

**Flow Blockchain Data API Integration:**
- **FindLabsClient** - Direct integration with Find Labs API
- **Transaction Monitoring** - Real-time blockchain transaction tracking
- **Event Queries** - Monitor on-chain events and contract interactions
- **Analytics** - Blockchain data for market analytics

**Implementation:**
```typescript
apps/api/src/analytics/find-labs.client.ts       // 142 lines
apps/api/src/analytics/analytics.service.ts      // Uses Find Labs data
```

**API Endpoints Used:**
- `GET /flow/v1/transaction` - Query transactions
- `GET /flow/v1/transaction/:id` - Get transaction details
- Uses API key authentication: `FIND_LABS_API_KEY`

**Status:** ✅ Fully integrated and working

---

### 🤖 aiSports Integration (Partial)

**AI-Powered Sports Data:**
- **Oracle Service** - Automated market creation from aiSports predictions
- **Meta Prediction Service** - AI-driven outcome predictions
- **Market Automation** - Auto-create markets from AI sports predictions
- **Flow Integration** - aiSports-specific Cadence contracts

**Implementation:**
```typescript
apps/api/src/oracles/aisports/meta-prediction.service.ts
apps/api/src/automation/aisports-market-automation.service.ts
apps/api/src/flow/aisports-flow.service.ts
apps/api/data/aisports-meta.json                  // Market metadata
```

**Status:** ⚠️ Oracle integration working (predictions + automation), NO $JUICE token integration

---

### ❌ MFL (Metaverse Football League) Integration

**Status:** ❌ Not implemented (placeholder UI only, 0% complete)

```
apps/web/app/mfl/tournaments/page.tsx - Empty placeholder
```

---

## 🔗 Data Sources & APIs

### Sports Data Oracles

#### 1. **aiSports API** ✅
- **Purpose:** AI-powered sports predictions and metadata
- **Integration:** Oracle service + market automation
- **Endpoint:** Internal meta prediction service
- **Data:** Game predictions, AI confidence scores, market metadata

#### 2. **TheSportsDB** ⚠️
- **Purpose:** Sports events, teams, and scores
- **Status:** Client implemented, not actively used
- **Endpoint:** `https://www.thesportsdb.com/api/v1/json/`
- **Data:** NBA/NFL schedules, scores, team info

#### 3. **ESPN Sports API** ⚠️
- **Purpose:** Real-time sports scores and stats
- **Status:** Client exists, limited usage
- **Endpoint:** ESPN public API
- **Data:** Live scores, game status

#### 4. **NBA TopShot GraphQL** ⚠️
- **Purpose:** NBA moment ownership and metadata
- **Status:** Implemented but returning empty results
- **Endpoint:** `https://public-api.nbatopshot.com/graphql`
- **Queries:**
  ```graphql
  getUserMomentsByFlowAddress
  searchMintedMoments (with byOwnerFlowAddress filter)
  ```

### Blockchain Data

#### 5. **Find Labs API** ✅
- **Purpose:** Flow blockchain transaction and event data
- **Status:** Fully integrated
- **Endpoint:** `https://api.test-find.xyz/flow/v1/`
- **Authentication:** API key (`FIND_LABS_API_KEY`)
- **Data:** Transactions, events, blocks, contract interactions

#### 6. **Flow Blockchain (Direct FCL)** ✅
- **Purpose:** Execute Cadence scripts and transactions
- **Integration:** `@onflow/fcl` library
- **Network:** Testnet (`https://rest-testnet.onflow.org`)
- **Usage:**
  - Execute Cadence scripts (read data)
  - User wallet transaction signing
  - Account balance queries
  - Contract interaction

---

## ⚡ Flow Blockchain Features Used

### 1. Flow Actions (FLIP-338) ❌

**Status:** DEMO CODE ONLY (NOT IMPLEMENTED)

**What exists:**
- `FastBreakPeerBetting.cdc` (137 lines) - Educational demo
- Shows Source/Sink/Swapper/Oracle patterns
- NOT using official DeFiActions contract interfaces
- NOT integrated with V4 trading contracts

**What's missing:**
- ❌ No official FLIP-338 interface implementation
- ❌ No `import "DeFiActions"` 
- ❌ No UniqueIdentifier for tracing
- ❌ No connectors to external DeFi protocols
- ❌ Not used in any transactions

**Reality Check:**
Our V4 contracts (OrderBookV4, CoreMarketContractV4) use **custom implementations**:
- Direct order matching engine (not Flow Actions Swapper)
- Direct collateral split/merge (not Flow Actions Source/Sink)
- Standard Cadence patterns (not FLIP-338 composable structs)

**Completion:** ~5% (demo only)

### 2. Flow Client Library (FCL) ✅

**Full wallet integration for user-signed transactions:**

```typescript
// apps/web/app/lib/flow-config.ts
import * as fcl from "@onflow/fcl";

fcl.config({
  'flow.network': 'testnet',
  'accessNode.api': 'https://rest-testnet.onflow.org',
  'discovery.wallet': 'https://fcl-discovery.onflow.org/testnet/authn',
});

// User signs transactions with their wallet
const txId = await fcl.mutate({
  cadence: transactionCode,
  args: [...],
  limit: 9999,
});
```

**Features:**
- ✅ Wallet connection (Dapper + others)
- ✅ Transaction signing (user-controlled)
- ✅ Account balance queries
- ✅ Cadence script execution

### 3. Cadence Smart Contracts ✅

**V3 LMSR Markets:**
- `CoreMarketHubV2.cdc` - Market lifecycle management
- `LMSRAmmV2.cdc` - LMSR automated market maker
- `OutcomeTokenV2.cdc` - Fungible outcome tokens

**V4 Polymarket-Style Markets:**
- `CoreMarketContractV4.cdc` - Market state management
- `OrderBookV4.cdc` - Order matching engine
- `OutcomeTokenV4.cdc` - Binary outcome tokens
- `SealedBettingV4.cdc` - Private betting mechanism

**Deployed on Testnet:**
- Contract Address: `0x3ea7ac2bcdd8bcef`
- FungibleToken: `0x9a0766d93b6608b7`
- FlowToken: `0x7e60df042a9c0868`

### 4. Flow CLI Integration ✅

**Backend transaction execution:**

```typescript
// apps/api/src/markets/flow/flow-transaction.service.ts
async executeTransaction(options: FlowTransactionOptions) {
  const cliArgs = [
    'transactions', 'send',
    options.transactionPath,
    '--args-json', JSON.stringify(options.arguments),
    '--signer', options.signer,
    '--network', 'testnet',
  ];
  
  return this.flowCli.execute(cliArgs);
}
```

### 5. Scheduled Transactions (Flow Workflows) ✅

**Status:** FULLY IMPLEMENTED AND WORKING

Part of "Flow Forte Actions and Workflows" bounty - the **Workflows** half.

**Backend Services:**
```typescript
apps/api/src/scheduler/scheduler.service.ts              // 352 lines - Task management
apps/api/src/scheduler/scheduled-settlement.service.ts   // 246 lines - Auto-settlement
apps/api/src/scheduler/scheduler.controller.ts           // 146 lines - API endpoints
```

**Cadence Transaction:**
```cadence
contracts/cadence/transactions/scheduled/schedule_settlement.cdc
```

**Features:**
- ✅ **Auto-settlement** - Markets settle automatically when oracle data available
- ✅ **Task Scheduler** - Background job processing
- ✅ **Oracle Integration** - Sports, Crypto, Flow Volume oracles
- ✅ **Leaderboard Snapshots** - Recurring daily tasks
- ✅ **API Endpoints** - `GET /scheduler/tasks`, `POST /scheduler/tasks/:id/execute`

**Database Models:**
```prisma
model SchedulerTask {
  id          String
  type        SchedulerTaskType  // MARKET_SETTLEMENT, LEADERBOARD_SNAPSHOT
  status      SchedulerTaskStatus // PENDING, IN_PROGRESS, COMPLETED, FAILED
  scheduledFor DateTime
  marketId    String?
  // ...
}
```

**How it works:**
1. Market closes (`closeAt` timestamp reached)
2. `ScheduledSettlementService.processScheduledSettlements()` runs periodically
3. Checks oracle for final result (sports scores, crypto prices, etc.)
4. If result available → creates settlement task
5. Task executor settles market on blockchain
6. Winners can claim rewards

**Live Status:** API shows **3 active tasks** in system right now

---

## 🏗️ Technical Architecture

### Smart Contracts (Cadence)

**V3 Contracts (LMSR-based) - FULLY WORKING ✅**
- `CoreMarketHubV2.cdc` - Market lifecycle management (1341 lines)
- `LMSRAmmV2.cdc` - LMSR automated market maker (working math)
- `OutcomeTokenV2.cdc` - Fungible outcome tokens
- **Deployed:** `0x3ea7ac2bcdd8bcef` (testnet)
- **Transactions:** 15+ (create, trade, settle, etc.)
- **Scripts:** 5+ (quotes, balances, market data)

**V4 Contracts (Polymarket-style) - DEPLOYED ✅**
- `CoreMarketContractV4.cdc` - Market state & lifecycle (520 lines)
  - Split/merge collateral (1:1 backing)
  - Market settlement with oracle integration
  - Role-based permissions (admin, oracle, operator, patrol)
  - Events: PositionSplit, PositionMerged, MarketSettled
  
- `OrderBookV4.cdc` - FIFO order matching engine (576 lines)
  - Buy/sell order creation
  - Automatic order matching
  - Collateral & share escrow
  - Events: OrderCreated, OrderMatched, OrderCanceled
  
- `OutcomeTokenV4.cdc` - Binary outcome tokens (FungibleToken standard)
  - Minting during position split
  - Burning during merge/redemption
  
- `SealedBettingV4.cdc` - Private predictions
  - Commit/reveal mechanism
  - Time-locked reveals

**Deployed:** `0x3ea7ac2bcdd8bcef` (testnet)
**Transactions:** 11 (split, merge, createOrder, matchOrder, settle, etc.)
**Scripts:** 6 (orderbook, prices, balances)

**Flow Actions (Demo Only) - 5% Complete ⚠️**
- `FastBreakPeerBetting.cdc` (137 lines)
  - Demonstrates Source/Sink/Swapper/Oracle patterns
  - NOT using official FLIP-338 interfaces
  - NOT integrated with V4 contracts
  - Educational example only

**Total Deployed:** 13 contracts, ~3,500 lines working code on testnet

### Backend (NestJS + TypeScript)

**API Services:**
- `MarketsService` - Market CRUD and trading logic
- `LmsrService` - LMSR math calculations
- `PolymarketV4Service` - V4 order book trading
- `TopShotService` - NBA TopShot integration
- `FindLabsClient` - Blockchain data API
- `FlowTransactionService` - Execute Cadence transactions
- `PointsService` - User points and rewards

**Data Integrations:**
- Find Labs API (blockchain data)
- NBA TopShot GraphQL (NFT data)
- aiSports Oracle (AI predictions)
- TheSportsDB Client (sports data)
- ESPN Sports Client (live scores)

**Database:**
- PostgreSQL 16 with Prisma ORM
- 25+ models (markets, users, trades, points, moments)
- Redis for caching and sessions

### Frontend (Next.js 14 + TypeScript)

**Framework:**
- Next.js 14 App Router
- TypeScript strict mode
- Tailwind CSS
- FCL wallet integration

**Key Features:**
- Real-time market updates (WebSocket)
- Wallet connection UI
- Trade execution panel
- NBA TopShot moment selection
- Admin dashboard

---

## 🚀 Quick Start

### Prerequisites
```bash
Node.js 18+
PostgreSQL 16+
Redis 7+
Flow CLI (optional)
pnpm 9+
```

### Installation

```bash
# Install dependencies
pnpm install

# Setup environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Configure APIs in apps/api/.env:
FIND_LABS_API_KEY=your_api_key           # Get from Find Labs
NBA_TOPSHOT_API_URL=https://public-api.nbatopshot.com/graphql
FLOW_NETWORK=testnet
DATABASE_URL=postgresql://...

# Setup database
cd apps/api
pnpm prisma generate
pnpm prisma migrate deploy

# Build and start
cd ../..
pnpm build
pm2 start ecosystem.config.js
```

**Access:**
- Frontend: `http://localhost:3000`
- API: `http://localhost:3000` (same port, proxied)

---

## 📊 What's Implemented

### ✅ Fully Working (85%+)

**V3 LMSR Markets:**
- Market creation and management
- LMSR automated market maker
- Trade execution (backend-signed)
- Real-time quotes and price impact
- Points system and leaderboard

**V4 Backend:**
- Order book contracts deployed
- All API endpoints implemented
- FCL wallet transaction signing
- Effective price calculations

**Wallet & Auth:**
- FCL integration (Dapper + others)
- Session management
- Account balance display
- Multi-wallet support

**Admin Features:**
- Draft market system
- Market editing
- Publishing to blockchain
- Manual settlement

**Data Integrations:**
- Find Labs API (blockchain data) ✅
- aiSports Oracle (predictions) ✅
- Flow CLI execution ✅

### ⚠️ Partially Working (30-60%)

**V4 Frontend:**
- FCL execution works ✅
- UI doesn't refresh after trade ❌
- Order book component exists but not displayed ❌
- Sealed betting UI not integrated ❌

**NBA TopShot:**
- Backend services implemented (1259 lines) ✅
- GraphQL queries return empty ❌
- Account linking UI exists ⚠️
- Bonus calculation works ✅
- Not triggered on V4 trades ❌

**Settlement:**
- Manual settlement works ✅
- Scheduled auto-settlement ✅ (1255 lines code)
- Oracle-driven automation ✅ (Sports/Crypto/Flow Volume)

### ❌ Not Implemented (0-10%)

- MFL integration (placeholder only - 0%)
- FastBreak backend (DB schema only - 10%)
- $JUICE token integration (no code - 0%)
- Advanced V4 features (stop-loss, order expiration - 0%)
- Comprehensive testing suite (tests removed - 15%)
- CI/CD pipelines (no workflows - 0%)

---

## 🎯 Bounty Eligibility Summary

| Bounty | Status | Completion | Notes |
|--------|--------|------------|-------|
| **Best Killer App on Flow** | ✅ Eligible | ~70% | Full prediction market platform working |
| **Best Use of Flow Forte Actions** | ⚠️ Partial | ~40% | Scheduled TX ✅ (75%), Flow Actions ❌ (5% demo only) |
| **Best Existing Code Integration** | ✅ Eligible | ~60% | Working on Flow testnet, ongoing improvements |
| **Dapper NFT Experience** | ⚠️ Partial | ~30% | Backend done, GraphQL issues |
| **Dapper Game Integration** | ❌ Not Eligible | ~10% | FastBreak schema only |
| **Find Labs API Integration** | ✅ Eligible | ~85% | Fully integrated and working |
| **aiSports Integration** | ⚠️ Partial | ~40% | Oracle works, no $JUICE token |
| **MFL Integration** | ❌ Not Eligible | 0% | Not implemented |

---

## 📈 Current Status

**Overall Completion:** **45-50%** of planned features

**What Works Right Now:**
1. ✅ V3 LMSR markets (create, trade, settle)
2. ✅ V4 backend + FCL wallet execution
3. ✅ Draft market system
4. ✅ Points and leaderboard
5. ✅ Find Labs blockchain data integration
6. ✅ Wallet integration (FCL)

**Known Issues:**
1. ⚠️ V4 UI doesn't refresh after trade
2. ⚠️ NBA TopShot GraphQL returns empty
3. ⚠️ No scheduled transactions
4. ⚠️ Tests removed/gitignored
5. ⚠️ No CI/CD pipelines

**Not Started:**
1. ❌ MFL integration
2. ❌ FastBreak backend
3. ❌ Oracle automation
4. ❌ $JUICE token support

---

## 🔒 Security

- ✅ User-signed transactions (FCL)
- ✅ Environment variables for secrets
- ✅ Input validation (class-validator)
- ✅ SQL injection prevention (Prisma)
- ⚠️ Rate limiting (basic only)
- ⚠️ RBAC (partial)

---

## 📝 Development

### Project Structure
```
werpool/
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── src/
│   │   │   ├── markets/              # Market services
│   │   │   ├── topshot/              # NBA TopShot integration
│   │   │   ├── analytics/            # Find Labs client
│   │   │   ├── oracles/              # Data oracles (aiSports, etc.)
│   │   │   └── flow/                 # Flow blockchain services
│   │   └── prisma/schema.prisma      # Database models
│   └── web/                          # Next.js frontend
│       ├── app/
│       │   ├── components/           # React components
│       │   ├── lib/                  # API clients, FCL config
│       │   └── markets/              # Market pages
├── contracts/
│   └── cadence/                      # Smart contracts
│       ├── *.cdc                     # Contract files
│       ├── transactions/             # Transaction templates
│       └── scripts/                  # Read-only scripts
└── flow.json                         # Flow configuration
```

### API Endpoints

**V3 Markets:**
- `GET /markets` - List all markets
- `GET /markets/:slug` - Get market details
- `POST /markets/:slug/quote` - Get trade quote
- `POST /markets/:slug/execute` - Execute trade

**V4 Markets:**
- `GET /v4/polymarket/order-book/:id/:idx` - Get order book
- `GET /v4/polymarket/prices/:id/:idx` - Get effective prices
- `POST /v4/polymarket/buy-outcome` - Prepare buy transaction
- `POST /v4/polymarket/sell-outcome` - Prepare sell transaction

**TopShot:**
- `GET /markets/:slug/topshot/options` - Get user moments
- `POST /markets/:slug/topshot/lock` - Lock moment for bonus

**Admin:**
- `POST /admin/markets/draft` - Create draft market
- `PUT /admin/markets/:id` - Update draft
- `POST /admin/markets/:id/publish` - Publish to blockchain

---

## 🤝 Hackathon Links

- **Flow Forte Hacks:** [dorahacks.io/hackathon/forte-hacks](https://dorahacks.io/hackathon/forte-hacks)
- **Find Labs Docs:** [docs.find.xyz](https://docs.find.xyz)
- **NBA TopShot API:** [public-api.nbatopshot.com](https://public-api.nbatopshot.com/graphql)
- **Flow Docs:** [developers.flow.com](https://developers.flow.com)
- **FCL Documentation:** [developers.flow.com/tools/fcl-js](https://developers.flow.com/tools/fcl-js)

---

## 📄 License

MIT License

---

## 🙏 Acknowledgments

- **Flow Team** - For excellent blockchain infrastructure
- **Dapper Labs** - For NBA TopShot API access
- **Find Labs** - For blockchain data API
- **aiSports** - For AI-powered sports predictions

---

**Built with ❤️ for Flow Forte Hacks 2025**
