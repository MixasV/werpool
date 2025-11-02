-- Create new enums if they don't exist
DO $$ BEGIN
    CREATE TYPE "ContractVersion" AS ENUM ('V1_LEGACY', 'V2_LEGACY', 'V3_LMSR', 'V4_POLYMARKET');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SealedBetStatus" AS ENUM ('COMMITTED', 'REVEALED', 'CLAIMED', 'FORFEITED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new enum values to PointEventSource
DO $$ BEGIN
    ALTER TYPE "PointEventSource" ADD VALUE IF NOT EXISTS 'POLYMARKET_V4_BUY';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "PointEventSource" ADD VALUE IF NOT EXISTS 'POLYMARKET_V4_SELL';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add contractVersion and blockchainMarketId to Market table
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "contractVersion" "ContractVersion" DEFAULT 'V4_POLYMARKET';
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "blockchainMarketId" INTEGER UNIQUE;
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN DEFAULT FALSE;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS "Market_contractVersion_idx" ON "Market"("contractVersion");
CREATE INDEX IF NOT EXISTS "Market_isArchived_idx" ON "Market"("isArchived");
CREATE INDEX IF NOT EXISTS "Market_blockchainMarketId_idx" ON "Market"("blockchainMarketId");

-- Archive all existing markets (they are V3 or older)
UPDATE "Market" 
SET "isArchived" = TRUE,
    "contractVersion" = CASE 
      WHEN "createdAt" < '2024-10-01'::timestamp THEN 'V1_LEGACY'::"ContractVersion"
      WHEN "createdAt" < '2024-10-15'::timestamp THEN 'V2_LEGACY'::"ContractVersion"
      ELSE 'V3_LMSR'::"ContractVersion"
    END
WHERE "contractVersion" IS NULL;

-- Add SealedBet table for V4
CREATE TABLE IF NOT EXISTS "SealedBet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "encryptedSalt" TEXT NOT NULL,
    "outcomeIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMMITTED',
    "commitTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealTime" TIMESTAMP(3),
    "autoRevealScheduledFor" TIMESTAMP(3),
    "transactionHash" TEXT NOT NULL,
    "revealTransactionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for SealedBet
CREATE INDEX IF NOT EXISTS "SealedBet_marketId_idx" ON "SealedBet"("marketId");
CREATE INDEX IF NOT EXISTS "SealedBet_userAddress_idx" ON "SealedBet"("userAddress");
CREATE INDEX IF NOT EXISTS "SealedBet_status_idx" ON "SealedBet"("status");
