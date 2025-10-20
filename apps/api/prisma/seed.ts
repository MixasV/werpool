import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const decimal = (value: number): Prisma.Decimal => new Prisma.Decimal(value);

async function upsertMarket(params: {
  slug: string;
  title: string;
  description: string;
  state: Prisma.MarketState;
  category: Prisma.MarketCategory;
  tags?: string[];
  oracleId?: string;
  patrolThreshold?: number;
  closeAt?: Date;
  schedule?: {
    scheduledStartAt?: Date;
    tradingLockAt?: Date;
    freezeWindowStartAt?: Date;
    freezeWindowEndAt?: Date;
  };
  liquidity: {
    tokenSymbol: string;
    totalLiquidity: number;
    feeBps: number;
    providerCount: number;
  };
  outcomes: Array<{
    id: string;
    label: string;
    status: Prisma.OutcomeStatus;
    impliedProbability: number;
    liquidity: number;
  }>;
  workflow: Array<{
    id: string;
    type: Prisma.WorkflowActionType;
    status: Prisma.WorkflowActionStatus;
    description: string;
    triggersAt?: Date;
  }>;
  settlement?: {
    resolvedOutcomeId: string;
    txId: string;
    settledAt: Date;
    notes?: string;
    overrideReason?: string;
  };
  patrolSignals?: Array<{
    id: string;
    issuer: string;
    severity: Prisma.PatrolSignalSeverity;
    code: string;
    weight: number;
    expiresAt?: Date;
    notes?: string;
  }>;
}) {
  const {
    slug,
    title,
    description,
    state,
    category,
    tags = [],
    oracleId,
    patrolThreshold = 0,
    closeAt,
    schedule,
    liquidity,
    outcomes,
    workflow,
    settlement,
    patrolSignals = [],
  } = params;

  const scheduledStartAt = schedule?.scheduledStartAt ?? null;
  const tradingLockAt = schedule?.tradingLockAt ?? null;
  const freezeWindowStartAt = schedule?.freezeWindowStartAt ?? null;
  const freezeWindowEndAt = schedule?.freezeWindowEndAt ?? null;

  const settlementPayload = settlement
    ? {
        resolvedOutcomeId: settlement.resolvedOutcomeId,
        txId: settlement.txId,
        settledAt: settlement.settledAt,
        notes: settlement.notes ?? undefined,
        overrideReason: settlement.overrideReason ?? undefined,
      }
    : undefined;

  await prisma.market.upsert({
    where: { slug },
    update: {
      title,
      description,
      state,
      category,
      tags,
      oracleId: oracleId ?? null,
      patrolThreshold: decimal(patrolThreshold ?? 0),
      closeAt,
      scheduledStartAt,
      tradingLockAt,
      freezeWindowStartAt,
      freezeWindowEndAt,
      liquidityPool: {
        upsert: {
          create: {
            tokenSymbol: liquidity.tokenSymbol,
            totalLiquidity: decimal(liquidity.totalLiquidity),
            feeBps: liquidity.feeBps,
            providerCount: liquidity.providerCount,
          },
          update: {
            tokenSymbol: liquidity.tokenSymbol,
            totalLiquidity: decimal(liquidity.totalLiquidity),
            feeBps: liquidity.feeBps,
            providerCount: liquidity.providerCount,
          },
        },
      },
      outcomes: {
        deleteMany: {},
        create: outcomes.map((outcome) => ({
          id: outcome.id,
          label: outcome.label,
          status: outcome.status,
          impliedProbability: decimal(outcome.impliedProbability),
          liquidity: decimal(outcome.liquidity),
        })),
      },
      workflow: {
        deleteMany: {},
        create: workflow.map((step) => ({
          id: step.id,
          type: step.type,
          status: step.status,
          description: step.description,
          triggersAt: step.triggersAt,
        })),
      },
      settlement: settlementPayload
        ? {
            upsert: {
              create: settlementPayload,
              update: settlementPayload,
            },
          }
        : { delete: true },
      patrolSignals: {
        deleteMany: {},
        create: patrolSignals.map((signal) => ({
          id: signal.id,
          issuer: signal.issuer,
          severity: signal.severity,
          code: signal.code,
          weight: decimal(signal.weight),
          expiresAt: signal.expiresAt,
          notes: signal.notes ?? undefined,
        })),
      },
    },
    create: {
      slug,
      title,
      description,
      state,
      category,
      tags,
      oracleId: oracleId ?? undefined,
      patrolThreshold: decimal(patrolThreshold ?? 0),
      closeAt,
      scheduledStartAt: scheduledStartAt ?? undefined,
      tradingLockAt: tradingLockAt ?? undefined,
      freezeWindowStartAt: freezeWindowStartAt ?? undefined,
      freezeWindowEndAt: freezeWindowEndAt ?? undefined,
      liquidityPool: {
        create: {
          tokenSymbol: liquidity.tokenSymbol,
          totalLiquidity: decimal(liquidity.totalLiquidity),
          feeBps: liquidity.feeBps,
          providerCount: liquidity.providerCount,
        },
      },
      outcomes: {
        create: outcomes.map((outcome) => ({
          id: outcome.id,
          label: outcome.label,
          status: outcome.status,
          impliedProbability: decimal(outcome.impliedProbability),
          liquidity: decimal(outcome.liquidity),
        })),
      },
      workflow: {
        create: workflow.map((step) => ({
          id: step.id,
          type: step.type,
          status: step.status,
          description: step.description,
          triggersAt: step.triggersAt,
        })),
      },
      ...(settlementPayload
        ? {
            settlement: {
              create: settlementPayload,
            },
          }
        : {}),
      patrolSignals: {
        create: patrolSignals.map((signal) => ({
          id: signal.id,
          issuer: signal.issuer,
          severity: signal.severity,
          code: signal.code,
          weight: decimal(signal.weight),
          expiresAt: signal.expiresAt,
          notes: signal.notes ?? undefined,
        })),
      },
    },
  });
}

async function main() {
  const now = new Date();
  const hoursFromNow = (hours: number) =>
    new Date(now.getTime() + hours * 60 * 60 * 1000);

  await upsertMarket({
    slug: "flow-mainnet-volume",
    title: "Will Flow mainnet reach 2M daily tx in November?",
    description:
      "Community prediction market measuring developer momentum across the Flow ecosystem.",
    state: "LIVE",
    category: "CRYPTO",
    tags: ["flow", "volume", "transactions"],
    oracleId: "oracle-flow-volume",
    patrolThreshold: 3.5,
    closeAt: hoursFromNow(72),
    schedule: {
      scheduledStartAt: hoursFromNow(-4),
      tradingLockAt: hoursFromNow(60),
      freezeWindowStartAt: hoursFromNow(54),
      freezeWindowEndAt: hoursFromNow(59),
    },
    liquidity: {
      tokenSymbol: "FLOW",
      totalLiquidity: 2100,
      feeBps: 50,
      providerCount: 3,
    },
    outcomes: [
      {
        id: "mkt-forecast-flow-yes",
        label: "Yes",
        status: "ACTIVE",
        impliedProbability: 0.58,
        liquidity: 1220,
      },
      {
        id: "mkt-forecast-flow-no",
        label: "No",
        status: "ACTIVE",
        impliedProbability: 0.42,
        liquidity: 880,
      },
    ],
    workflow: [
      {
        id: "mkt-forecast-flow-open",
        type: "OPEN",
        status: "EXECUTED",
        description: "Market opened",
        triggersAt: hoursFromNow(-2),
      },
      {
        id: "mkt-forecast-flow-settle",
        type: "SETTLE",
        status: "SCHEDULED",
        description: "Awaiting oracle result",
        triggersAt: hoursFromNow(12),
      },
    ],
    patrolSignals: [
      {
        id: "signal-flow-latency",
        issuer: "0xf8d6e0586b0a20c7",
        severity: "WARNING",
        code: "LATENCY_SPIKE",
        weight: 1.5,
        expiresAt: hoursFromNow(6),
        notes: "Monitoring Flow RPC latency spike",
      },
    ],
  });

  await upsertMarket({
    slug: "dapp-governance-upgrade",
    title: "Will the governance proposal #42 pass by Dec 1st?",
    description:
      "Track sentiment and stake liquidity behind the protocol upgrade required for cross-app primitives.",
    state: "DRAFT",
    category: "CUSTOM",
    tags: ["governance", "upgrade", "proposal"],
    oracleId: "oracle-governance-42",
    patrolThreshold: 2.25,
    closeAt: hoursFromNow(120),
    schedule: {
      scheduledStartAt: hoursFromNow(6),
      tradingLockAt: hoursFromNow(96),
      freezeWindowStartAt: hoursFromNow(90),
      freezeWindowEndAt: hoursFromNow(95),
    },
    liquidity: {
      tokenSymbol: "FLOW",
      totalLiquidity: 1540,
      feeBps: 35,
      providerCount: 2,
    },
    outcomes: [
      {
        id: "mkt-governance-yes",
        label: "Yes",
        status: "ACTIVE",
        impliedProbability: 0.64,
        liquidity: 920,
      },
      {
        id: "mkt-governance-no",
        label: "No",
        status: "ACTIVE",
        impliedProbability: 0.36,
        liquidity: 620,
      },
    ],
    workflow: [
      {
        id: "mkt-governance-open",
        type: "OPEN",
        status: "PENDING",
        description: "Awaiting governance committee review",
        triggersAt: hoursFromNow(8),
      },
      {
        id: "mkt-governance-announce",
        type: "CUSTOM",
        status: "PENDING",
        description: "Publish criteria for settlement",
        triggersAt: hoursFromNow(24),
      },
    ],
    patrolSignals: [],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
