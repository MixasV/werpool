-- CreateEnum
CREATE TYPE "MarketState" AS ENUM ('DRAFT', 'LIVE', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'SETTLED');

-- CreateEnum
CREATE TYPE "WorkflowActionType" AS ENUM ('OPEN', 'SUSPEND', 'SETTLE', 'VOID', 'DISTRIBUTE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WorkflowActionStatus" AS ENUM ('PENDING', 'SCHEDULED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "state" "MarketState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closeAt" TIMESTAMP(3),

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidityPool" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "totalLiquidity" DECIMAL(18,4) NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "providerCount" INTEGER NOT NULL,

    CONSTRAINT "LiquidityPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "OutcomeStatus" NOT NULL DEFAULT 'ACTIVE',
    "impliedProbability" DECIMAL(5,4) NOT NULL,
    "liquidity" DECIMAL(18,4) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAction" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "type" "WorkflowActionType" NOT NULL,
    "status" "WorkflowActionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "triggersAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "resolvedOutcomeId" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_slug_key" ON "Market"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityPool_marketId_key" ON "LiquidityPool"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_marketId_key" ON "Settlement"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_resolvedOutcomeId_key" ON "Settlement"("resolvedOutcomeId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_txId_key" ON "Settlement"("txId");

-- AddForeignKey
ALTER TABLE "LiquidityPool" ADD CONSTRAINT "LiquidityPool_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_resolvedOutcomeId_fkey" FOREIGN KEY ("resolvedOutcomeId") REFERENCES "Outcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
