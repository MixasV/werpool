import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { MarketsService } from "./markets.service";
import { PrismaService } from "../prisma/prisma.service";
import { LmsrService } from "./lmsr/lmsr.service";
import { FlowMarketService } from "./flow/flow-market.service";
import { FlowTransactionService } from "./flow/flow-transaction.service";
import { LmsrState, LmsrTradeQuote } from "./lmsr/lmsr.types";
import { CreateMarketDto } from "./dto/create-market.dto";
import { MarketStorageMetadataDto } from "./dto/market-storage-metadata.dto";
import { MarketUpdatesGateway } from "./market-updates.gateway";
import { MarketAnalyticsService } from "./market-analytics.service";
import { MarketPoolStateService } from "./market-pool-state.service";
import type { SchedulerService } from "../scheduler/scheduler.service";
import type { PointsService } from "../points/points.service";

describe("MarketsService", () => {
  let prismaMock: {
    market: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    marketTransactionLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    marketTrade: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    patrolSignal: {
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    workflowAction: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    schedulerTask: {
      deleteMany: jest.Mock;
    };
  };
  let lmsrServiceMock: { quoteTrade: jest.Mock };
  let flowMarketServiceMock: {
    getPoolState: jest.Mock;
    getMarketIdBySlug: jest.Mock;
    getMarketStorage: jest.Mock;
    getAccountBalances: jest.Mock;
  };
  let poolStateServiceMock: {
    getState: jest.Mock;
    refreshFromFlow: jest.Mock;
    syncState: jest.Mock;
    applyQuote: jest.Mock;
  };
  let flowTransactionServiceMock: { send: jest.Mock };
  let analyticsServiceMock: { recordTrade: jest.Mock; getSnapshots: jest.Mock };
  let schedulerServiceMock: { createTask: jest.Mock };
  let pointsServiceMock: { recordEvent: jest.Mock };
  let updatesGatewayMock: {
    emitPoolStateUpdate: jest.Mock;
    emitTransactionLog: jest.Mock;
    emitTrade: jest.Mock;
  };
  let service: MarketsService;

  const originalSigner = process.env.FLOW_TRANSACTION_SIGNER;
  const originalNetwork = process.env.FLOW_NETWORK;

  type TestPrismaMarket = Prisma.MarketGetPayload<{
    include: {
      liquidityPool: true;
      outcomes: true;
      workflow: true;
      settlement: true;
      patrolSignals: true;
    };
  }>;

  const buildPrismaMarket = (overrides: Partial<TestPrismaMarket> = {}): TestPrismaMarket => {
    const marketId = overrides.id ?? "5";
    return {
      id: marketId,
      slug: overrides.slug ?? `market-${marketId}`,
      title: overrides.title ?? "Sample Market",
      description: overrides.description ?? "Description",
      state: (overrides.state as TestPrismaMarket["state"]) ?? "DRAFT",
      category: (overrides.category as TestPrismaMarket["category"]) ?? "CRYPTO",
      tags: (overrides.tags as TestPrismaMarket["tags"]) ?? [],
      oracleId: overrides.oracleId ?? null,
      patrolThreshold:
        (overrides.patrolThreshold as TestPrismaMarket["patrolThreshold"]) ??
        new Prisma.Decimal(0),
      createdAt:
        (overrides.createdAt as TestPrismaMarket["createdAt"]) ??
        new Date("2024-01-01T00:00:00.000Z"),
      closeAt: (overrides.closeAt as TestPrismaMarket["closeAt"]) ?? null,
      scheduledStartAt:
        (overrides.scheduledStartAt as TestPrismaMarket["scheduledStartAt"]) ?? null,
      tradingLockAt:
        (overrides.tradingLockAt as TestPrismaMarket["tradingLockAt"]) ?? null,
      freezeWindowStartAt:
        (overrides.freezeWindowStartAt as TestPrismaMarket["freezeWindowStartAt"]) ?? null,
      freezeWindowEndAt:
        (overrides.freezeWindowEndAt as TestPrismaMarket["freezeWindowEndAt"]) ?? null,
      liquidityPool:
        overrides.liquidityPool ??
        ({
          id: `pool-${marketId}`,
          marketId,
          tokenSymbol: "FLOW",
          totalLiquidity: new Prisma.Decimal(100),
          feeBps: 50,
          providerCount: 1,
        } satisfies NonNullable<TestPrismaMarket["liquidityPool"]>),
      outcomes:
        (overrides.outcomes as TestPrismaMarket["outcomes"]) ??
        ([
          {
            id: `outcome-${marketId}`,
            marketId,
            label: "YES",
            status: "ACTIVE",
            impliedProbability: new Prisma.Decimal(0.5),
            liquidity: new Prisma.Decimal(50),
            metadata: null,
          },
        ] satisfies TestPrismaMarket["outcomes"]),
      workflow: (overrides.workflow as TestPrismaMarket["workflow"]) ?? [],
      settlement: (overrides.settlement as TestPrismaMarket["settlement"]) ?? null,
      patrolSignals:
        (overrides.patrolSignals as TestPrismaMarket["patrolSignals"]) ?? [],
    };
  };

  beforeEach(() => {
    delete process.env.FLOW_TRANSACTION_SIGNER;
    delete process.env.FLOW_NETWORK;

    const defaultPoolState: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    prismaMock = {
      market: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      marketTransactionLog: {
        create: jest.fn().mockImplementation(async (args) => ({
          id: `log-${Math.random().toString(16).slice(2)}`,
          marketId: args.data.marketId,
          transactionId: args.data.transactionId,
          type: args.data.type,
          status: args.data.status ?? "SUCCESS",
          signer: args.data.signer,
          network: args.data.network,
          payload: args.data.payload ?? null,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        })),
        findMany: jest.fn(),
      },
      marketTrade: {
        create: jest.fn().mockImplementation(async (args) => ({
          id: `trade-${Math.random().toString(16).slice(2)}`,
          marketId: args.data.marketId,
          outcomeId: args.data.outcomeId,
          outcomeLabel: args.data.outcomeLabel,
          outcomeIndex: args.data.outcomeIndex,
          shares: args.data.shares,
          flowAmount: args.data.flowAmount,
          isBuy: args.data.isBuy,
          probabilities: args.data.probabilities ?? [],
          maxFlowAmount: args.data.maxFlowAmount ?? null,
          transactionId: args.data.transactionId,
          signer: args.data.signer,
          network: args.data.network,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        })),
        findMany: jest.fn(),
      },
      patrolSignal: {
        upsert: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      workflowAction: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      schedulerTask: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    prismaMock.market.create.mockResolvedValue(buildPrismaMarket());
    prismaMock.market.findFirst.mockResolvedValue(buildPrismaMarket());
    prismaMock.market.findUnique.mockImplementation(async (args?: { where?: { id?: string } }) =>
      buildPrismaMarket({ id: args?.where?.id ?? "5" })
    );
    prismaMock.market.update.mockResolvedValue(buildPrismaMarket());

    lmsrServiceMock = {
      quoteTrade: jest.fn(),
    };
    flowMarketServiceMock = {
      getPoolState: jest.fn().mockResolvedValue({
        liquidityParameter: 0,
        totalLiquidity: 0,
        bVector: [],
        outcomeSupply: [],
      }),
      getMarketIdBySlug: jest.fn(),
      getMarketStorage: jest.fn(),
      getAccountBalances: jest.fn(),
    };
    poolStateServiceMock = {
      getState: jest.fn().mockResolvedValue(defaultPoolState),
      refreshFromFlow: jest.fn().mockResolvedValue(defaultPoolState),
      syncState: jest.fn().mockResolvedValue(defaultPoolState),
      applyQuote: jest.fn().mockResolvedValue(defaultPoolState),
    };
    flowTransactionServiceMock = {
      send: jest.fn(),
    };
    analyticsServiceMock = {
      recordTrade: jest.fn().mockResolvedValue(undefined),
      getSnapshots: jest.fn(),
    };
    schedulerServiceMock = {
      createTask: jest.fn().mockResolvedValue({ id: "task-1" }),
    };
    pointsServiceMock = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
    };
    updatesGatewayMock = {
      emitPoolStateUpdate: jest.fn(),
      emitTransactionLog: jest.fn(),
      emitTrade: jest.fn(),
    };

    service = new MarketsService(
      prismaMock as unknown as PrismaService,
      lmsrServiceMock as unknown as LmsrService,
      flowMarketServiceMock as unknown as FlowMarketService,
      poolStateServiceMock as unknown as MarketPoolStateService,
      flowTransactionServiceMock as unknown as FlowTransactionService,
      analyticsServiceMock as unknown as MarketAnalyticsService,
      schedulerServiceMock as unknown as SchedulerService,
      pointsServiceMock as unknown as PointsService,
      updatesGatewayMock as unknown as MarketUpdatesGateway
    );
  });

  afterAll(() => {
    if (originalSigner !== undefined) {
      process.env.FLOW_TRANSACTION_SIGNER = originalSigner;
    } else {
      delete process.env.FLOW_TRANSACTION_SIGNER;
    }

    if (originalNetwork !== undefined) {
      process.env.FLOW_NETWORK = originalNetwork;
    } else {
      delete process.env.FLOW_NETWORK;
    }
  });

  it("returns formatted quote and cadence payload", async () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    const quote: LmsrTradeQuote = {
      flowAmount: 2.80929804,
      outcomeAmount: 5,
      newBVector: [5, 0],
      newTotalLiquidity: 102.80929804,
      newOutcomeSupply: [5, 0],
      probabilities: [0.62245933, 0.37754067],
    };

    poolStateServiceMock.getState.mockResolvedValue(state);
    lmsrServiceMock.quoteTrade.mockReturnValue(quote);

    const result = await service.quoteTrade("42", {
      outcomeIndex: 0,
      shares: 5,
      isBuy: true,
    });

    expect(poolStateServiceMock.getState).toHaveBeenCalledWith(42, "42");
    expect(lmsrServiceMock.quoteTrade).toHaveBeenCalledWith(state, {
      outcomeIndex: 0,
      shares: 5,
      isBuy: true,
    });
    expect(result).toEqual({
      flowAmount: "2.80929804",
      outcomeAmount: "5.00000000",
      newBVector: ["5.00000000", "0.00000000"],
      newTotalLiquidity: "102.80929804",
      newOutcomeSupply: ["5.00000000", "0.00000000"],
      probabilities: [0.62245933, 0.37754067],
      cadenceArguments: [
        { type: "UInt64", value: "42" },
        { type: "Int", value: "0" },
        { type: "UFix64", value: "2.80929804" },
        { type: "UFix64", value: "5.00000000" },
        {
          type: "Array",
          value: [
            { type: "UFix64", value: "5.00000000" },
            { type: "UFix64", value: "0.00000000" },
          ],
        },
        { type: "UFix64", value: "102.80929804" },
        {
          type: "Array",
          value: [
            { type: "UFix64", value: "5.00000000" },
            { type: "UFix64", value: "0.00000000" },
          ],
        },
        { type: "Bool", value: true },
      ],
      transactionPath: "contracts/cadence/transactions/executeTrade.cdc",
    });
  });

  it("returns pool state", async () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [1, 2],
      outcomeSupply: [3, 4],
    };

    poolStateServiceMock.getState.mockResolvedValue(state);

    const result = await service.getPoolState("15");

    expect(poolStateServiceMock.getState).toHaveBeenCalledWith(15, "15");
    expect(result).toEqual(state);
  });

  it("returns market storage metadata", async () => {
    const metadata: MarketStorageMetadataDto = {
      liquidityPoolPath: "/storage/forte_marketPool_1",
      outcomeVaultPath: "/storage/forte_outcomeVault_1",
      liquidityReceiverPath: "/public/forte_marketPoolReceiver_1",
      liquidityProviderPath: "/public/forte_marketPoolProvider_1",
      outcomeReceiverPath: "/public/forte_outcomeReceiver_1",
      outcomeBalancePath: "/public/forte_outcomeBalance_1",
      outcomeProviderPath: "/public/forte_outcomeProvider_1",
      owner: "0x01",
    };

    flowMarketServiceMock.getMarketStorage.mockResolvedValue(metadata);

    const result = await service.getMarketStorage("1");

    expect(flowMarketServiceMock.getMarketStorage).toHaveBeenCalledWith(1);
    expect(result).toEqual(metadata);
  });

  it("returns formatted account balances", async () => {
    flowMarketServiceMock.getAccountBalances.mockResolvedValue({
      flowBalance: 12.3456789,
      outcomeBalance: 5.5,
    });

    const result = await service.getAccountBalances(
      "42",
      "0xABCDEF0123456789"
    );

    expect(flowMarketServiceMock.getAccountBalances).toHaveBeenCalledWith(
      "0xabcdef0123456789",
      42
    );
    expect(result).toEqual({
      flowBalance: "12.34567890",
      outcomeBalance: "5.50000000",
    });
  });

  it("returns latest trades with normalized limit", async () => {
    const marketRecord = buildPrismaMarket({ id: "5" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    const tradeRecord = {
      id: "trade-1",
      marketId: marketRecord.id,
      outcomeId: marketRecord.outcomes[0].id,
      outcomeLabel: marketRecord.outcomes[0].label,
      outcomeIndex: 0,
      shares: new Prisma.Decimal(1.23456789),
      flowAmount: new Prisma.Decimal(2.3456789),
      isBuy: true,
      probabilities: [0.6, 0.4],
      maxFlowAmount: new Prisma.Decimal(3.5),
      transactionId: "tx-trade-1",
      signer: "0x01",
      network: "testnet",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    };

    prismaMock.marketTrade.findMany.mockResolvedValue([tradeRecord]);

    const result = await service.getTrades("5", 25);

    expect(prismaMock.marketTrade.findMany).toHaveBeenCalledWith({
      where: { marketId: marketRecord.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    expect(result).toEqual([tradeRecord]);
  });

  it("returns transaction logs with normalized limit", async () => {
    const marketRecord = buildPrismaMarket({ id: "5" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    const logRecord = {
      id: "log-1",
      marketId: marketRecord.id,
      transactionId: "tx-1",
      type: "CREATE_POOL",
      status: "SUCCESS",
      signer: "0x01",
      network: "emulator",
      payload: { foo: "bar" },
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };

    prismaMock.marketTransactionLog.findMany.mockResolvedValue([logRecord]);

    const result = await service.getTransactionLogs("5", 25);

    expect(prismaMock.marketTransactionLog.findMany).toHaveBeenCalledWith({
      where: { marketId: marketRecord.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    expect(result).toEqual([logRecord]);
  });

  it("throws for invalid Flow address", async () => {
    await expect(
      service.getAccountBalances("42", "not-an-address")
    ).rejects.toThrow("address must be a valid Flow address");

    expect(flowMarketServiceMock.getAccountBalances).not.toHaveBeenCalled();
  });

  it("creates market via Flow and persists record", async () => {
    const payload: CreateMarketDto = {
      slug: "market-1",
      title: "Market 1",
      description: "Description",
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: 100,
        feeBps: 50,
        providerCount: 1,
      },
      outcomes: [
        {
          label: "YES",
          impliedProbability: 0.5,
          liquidity: 50,
        },
      ],
    };

    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "tx-market",
      rawStdout: "Transaction ID: tx-market",
      rawStderr: "",
    });

    flowMarketServiceMock.getMarketIdBySlug.mockResolvedValue(101);

    const now = new Date();
    prismaMock.market.create.mockResolvedValue(
      buildPrismaMarket({
        id: "101",
        slug: payload.slug,
        title: payload.title,
        description: payload.description,
        state: "DRAFT",
        createdAt: now,
        closeAt: null,
        liquidityPool: null,
        outcomes: [],
        workflow: [],
        settlement: null,
        patrolSignals: [],
      })
    );

    const result = await service.create(payload);

    const flowCall = flowTransactionServiceMock.send.mock.calls[0]?.[0];
    expect(flowCall).toBeDefined();
    expect(flowCall).toMatchObject({
      transactionPath: "contracts/cadence/transactions/createMarket.cdc",
      signer: "emulator-account",
      network: "emulator",
    });
    expect(flowCall.arguments).toHaveLength(20);
    expect(flowCall.arguments.slice(0, 4)).toEqual([
      { type: "String", value: payload.slug },
      { type: "String", value: payload.title },
      { type: "String", value: payload.description },
      { type: "String", value: "crypto" },
    ]);
    expect(flowCall.arguments.slice(4, 18)).toEqual([
      { type: "String", value: "" },
      { type: "Bool", value: false },
      { type: "UFix64", value: "0.00000000" },
      { type: "Bool", value: false },
      { type: "UFix64", value: "0.00000000" },
      { type: "Bool", value: false },
      { type: "UFix64", value: "0.00000000" },
      { type: "Bool", value: false },
      { type: "UFix64", value: "0.00000000" },
      { type: "Bool", value: false },
      { type: "UFix64", value: "0.00000000" },
      { type: "Bool", value: false },
      { type: "UFix64", value: "0.00000000" },
      { type: "Bool", value: false },
    ]);
    expect(flowCall.arguments[18]).toEqual({
      type: "Array",
      value: [],
    });
    expect(flowCall.arguments[19]).toEqual({
      type: "Array",
      value: [{ type: "String", value: "YES" }],
    });

    expect(flowMarketServiceMock.getMarketIdBySlug).toHaveBeenCalledWith(payload.slug);
    expect(prismaMock.market.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: "101" }),
      })
    );
    expect(result.id).toBe("101");

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: "101",
          type: "CREATE_MARKET",
          transactionId: "tx-market",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: payload.slug,
        type: "CREATE_MARKET",
        transactionId: "tx-market",
      })
    );
  });

  it("throws when market id cannot be resolved after Flow creation", async () => {
    const payload: CreateMarketDto = {
      slug: "missing-market",
      title: "Missing",
      description: "Missing",
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: 100,
        feeBps: 50,
        providerCount: 1,
      },
      outcomes: [
        {
          label: "YES",
          impliedProbability: 0.5,
          liquidity: 50,
        },
      ],
    };

    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "tx-market",
      rawStdout: "Transaction ID: tx-market",
      rawStderr: "",
    });

    flowMarketServiceMock.getMarketIdBySlug.mockResolvedValue(null);

    await expect(service.create(payload)).rejects.toThrow(
      "Unable to resolve market id after creation"
    );

    expect(prismaMock.market.create).not.toHaveBeenCalled();
  });

  it("throws when outcomes array is empty", async () => {
    const payload: CreateMarketDto = {
      slug: "empty-market",
      title: "Empty",
      description: "Empty",
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: 100,
        feeBps: 50,
        providerCount: 1,
      },
      outcomes: [],
    };

    await expect(service.create(payload)).rejects.toThrow(
      "Market must include at least one outcome"
    );

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
    expect(prismaMock.market.create).not.toHaveBeenCalled();
  });

  it("creates market pool and returns transaction info", async () => {
    const marketRecord = buildPrismaMarket({ id: "7" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "pool123",
      rawStdout: "Transaction ID: pool123",
      rawStderr: "",
    });

    const result = await service.createPool("7", {
      outcomeCount: 3,
      liquidityParameter: 12.3456789,
      seedAmount: 100.12345678,
    });

    const expectedArguments = [
      { type: "UInt64", value: "7" },
      { type: "Int", value: "3" },
      { type: "UFix64", value: "12.34567890" },
      { type: "UFix64", value: "100.12345678" },
    ];

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/createMarketPool.cdc",
      arguments: expectedArguments,
      signer: "emulator-account",
      network: "emulator",
    });

    expect(result).toEqual({
      outcomeCount: 3,
      liquidityParameter: "12.34567890",
      seedAmount: "100.12345678",
      transactionPath: "contracts/cadence/transactions/createMarketPool.cdc",
      cadenceArguments: expectedArguments,
      transactionId: "pool123",
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "CREATE_POOL",
          transactionId: "pool123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "CREATE_POOL",
        transactionId: "pool123",
      })
    );

    expect(poolStateServiceMock.refreshFromFlow).toHaveBeenCalledWith(7, marketRecord.id);
    expect(updatesGatewayMock.emitPoolStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: marketRecord.id,
        state: expect.any(Object),
      })
    );
  });

  it("throws when outcome count is invalid", async () => {
    prismaMock.market.findUnique.mockResolvedValue(buildPrismaMarket({ id: "2" }));
    await expect(
      service.createPool("2", {
        outcomeCount: 0,
        liquidityParameter: 10,
        seedAmount: 50,
      })
    ).rejects.toThrow("Outcome count must be a positive integer");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
  });

  it("mints outcome tokens", async () => {
    const marketRecord = buildPrismaMarket({ id: "8" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "mint123",
      rawStdout: "Transaction ID: mint123",
      rawStderr: "",
    });

    const result = await service.mintOutcome("8", { amount: 15.12345678 });

    const expectedArguments = [
      { type: "UInt64", value: "8" },
      { type: "UFix64", value: "15.12345678" },
    ];

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/mintOutcome.cdc",
      arguments: expectedArguments,
      signer: "emulator-account",
      network: "emulator",
    });

    expect(result).toEqual({
      amount: "15.12345678",
      transactionPath: "contracts/cadence/transactions/mintOutcome.cdc",
      cadenceArguments: expectedArguments,
      transactionId: "mint123",
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "MINT_OUTCOME",
          transactionId: "mint123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "MINT_OUTCOME",
        transactionId: "mint123",
      })
    );

    expect(poolStateServiceMock.refreshFromFlow).toHaveBeenCalledWith(8, marketRecord.id);
    expect(updatesGatewayMock.emitPoolStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: marketRecord.id,
        state: expect.any(Object),
      })
    );
  });

  it("throws when mint amount is invalid", async () => {
    prismaMock.market.findUnique.mockResolvedValue(buildPrismaMarket({ id: "8" }));
    await expect(service.mintOutcome("8", { amount: 0 })).rejects.toThrow(
      "amount must be a positive number"
    );

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
  });

  it("burns outcome tokens", async () => {
    const marketRecord = buildPrismaMarket({ id: "9" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "burn123",
      rawStdout: "Transaction ID: burn123",
      rawStderr: "",
    });

    const result = await service.burnOutcome("9", { amount: 2.5 });

    const expectedArguments = [
      { type: "UInt64", value: "9" },
      { type: "UFix64", value: "2.50000000" },
    ];

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/burnOutcome.cdc",
      arguments: expectedArguments,
      signer: "emulator-account",
      network: "emulator",
    });

    expect(result).toEqual({
      amount: "2.50000000",
      transactionPath: "contracts/cadence/transactions/burnOutcome.cdc",
      cadenceArguments: expectedArguments,
      transactionId: "burn123",
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "BURN_OUTCOME",
          transactionId: "burn123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "BURN_OUTCOME",
        transactionId: "burn123",
      })
    );

    expect(poolStateServiceMock.refreshFromFlow).toHaveBeenCalledWith(9, marketRecord.id);
    expect(updatesGatewayMock.emitPoolStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: marketRecord.id,
        state: expect.any(Object),
      })
    );
  });

  it("syncs pool state", async () => {
    const marketRecord = buildPrismaMarket({ id: "5" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "sync123",
      rawStdout: "Transaction ID: sync123",
      rawStderr: "",
    });
    poolStateServiceMock.getState.mockResolvedValue({
      liquidityParameter: 12,
      totalLiquidity: 99,
      bVector: [0.1, 0.2],
      outcomeSupply: [1, 2],
    });

    const expectedUpdatedState: LmsrState = {
      liquidityParameter: 12,
      totalLiquidity: 150.98765432,
      bVector: [1.2345, 2.3456],
      outcomeSupply: [10.1, 20.2],
    };
    poolStateServiceMock.syncState.mockResolvedValue(expectedUpdatedState);

    const result = await service.syncPoolState("5", {
      bVector: [1.2345, 2.3456],
      totalLiquidity: 150.98765432,
      outcomeSupply: [10.1, 20.2],
    });

    const expectedArguments = [
      { type: "UInt64", value: "5" },
      {
        type: "Array",
        value: [
          { type: "UFix64", value: "1.23450000" },
          { type: "UFix64", value: "2.34560000" },
        ],
      },
      { type: "UFix64", value: "150.98765432" },
      {
        type: "Array",
        value: [
          { type: "UFix64", value: "10.10000000" },
          { type: "UFix64", value: "20.20000000" },
        ],
      },
    ];

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/syncMarketState.cdc",
      arguments: expectedArguments,
      signer: "emulator-account",
      network: "emulator",
    });

    expect(result).toEqual({
      bVector: ["1.23450000", "2.34560000"],
      totalLiquidity: "150.98765432",
      outcomeSupply: ["10.10000000", "20.20000000"],
      transactionPath: "contracts/cadence/transactions/syncMarketState.cdc",
      cadenceArguments: expectedArguments,
      transactionId: "sync123",
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "SYNC_POOL",
          transactionId: "sync123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "SYNC_POOL",
        transactionId: "sync123",
      })
    );

    expect(poolStateServiceMock.getState).toHaveBeenCalledWith(5, marketRecord.id);
    expect(poolStateServiceMock.syncState).toHaveBeenCalledWith(
      5,
      marketRecord.id,
      expectedUpdatedState
    );
    expect(updatesGatewayMock.emitPoolStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: marketRecord.id,
        state: expectedUpdatedState,
      })
    );
  });

  it("throws when sync arrays mismatch", async () => {
    prismaMock.market.findUnique.mockResolvedValue(buildPrismaMarket({ id: "5" }));
    await expect(
      service.syncPoolState("5", {
        bVector: [1, 2],
        totalLiquidity: 10,
        outcomeSupply: [1],
      })
    ).rejects.toThrow("bVector and outcomeSupply must have the same length");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
  });

  it("activates market and updates state", async () => {
    const marketRecord = buildPrismaMarket({ id: "101", state: "DRAFT" });
    const updatedRecord = { ...marketRecord, state: "LIVE" };

    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    prismaMock.market.update.mockResolvedValue(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "activate123",
      rawStdout: "Transaction ID: activate123",
      rawStderr: "",
    });

    const result = await service.activateMarket("101");

    expect(prismaMock.market.findUnique).toHaveBeenCalledWith({
      where: { id: "101" },
      include: expect.any(Object),
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/activateMarket.cdc",
      arguments: [{ type: "UInt64", value: "101" }],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: "101" },
      data: { state: "LIVE" },
      include: expect.any(Object),
    });

    expect(result.transactionId).toBe("activate123");
    expect(result.market.state).toBe("live");

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "ACTIVATE",
          transactionId: "activate123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "ACTIVATE",
        transactionId: "activate123",
      })
    );

    expect(prismaMock.workflowAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          marketId: marketRecord.id,
          type: "OPEN",
        }),
      })
    );
  });

  it("suspends market with trimmed reason", async () => {
    const marketRecord = buildPrismaMarket({ id: "102", state: "LIVE" });
    const updatedRecord = { ...marketRecord, state: "SUSPENDED" };

    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    prismaMock.market.update.mockResolvedValue(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "suspend123",
      rawStdout: "Transaction ID: suspend123",
      rawStderr: "",
    });

    const result = await service.suspendMarket("102", {
      reason: "  Maintenance window  ",
      signer: "custom-operator",
      network: "testnet",
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/suspendMarket.cdc",
      arguments: [
        { type: "UInt64", value: "102" },
        { type: "Optional", value: { type: "String", value: "Maintenance window" } },
      ],
      signer: "custom-operator",
      network: "testnet",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: "102" },
      data: { state: "SUSPENDED" },
      include: expect.any(Object),
    });

    expect(result.market.state).toBe("suspended");

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "SUSPEND",
          transactionId: "suspend123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "SUSPEND",
        transactionId: "suspend123",
      })
    );

    expect(prismaMock.workflowAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          marketId: marketRecord.id,
          type: "SUSPEND",
        }),
      })
    );
  });

  it("closes market and updates closeAt when timestamp provided", async () => {
    const closedAtIso = "2024-03-01T00:00:00.000Z";
    const closedAtDate = new Date(closedAtIso);
    const marketRecord = buildPrismaMarket({ id: "103", state: "LIVE", closeAt: null });
    const updatedRecord = { ...marketRecord, state: "CLOSED", closeAt: closedAtDate };

    prismaMock.market.findUnique.mockResolvedValueOnce(marketRecord);
    prismaMock.market.update.mockResolvedValueOnce(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "close123",
      rawStdout: "Transaction ID: close123",
      rawStderr: "",
    });

    const result = await service.closeMarket("103", {
      reason: " Completed ",
      closedAt: closedAtIso,
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/closeMarket.cdc",
      arguments: [
        { type: "UInt64", value: "103" },
        { type: "String", value: "Completed" },
        { type: "UFix64", value: "1709251200.00000000" },
        { type: "Bool", value: true },
      ],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: marketRecord.id },
      data: {
        state: "CLOSED",
        closeAt: closedAtDate,
      },
      include: expect.any(Object),
    });

    expect(result.market.state).toBe("closed");
    expect(result.market.closeAt).toBe(closedAtIso);

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CLOSE",
          transactionId: "close123",
        }),
      })
    );
  });

  it("updates market schedule for provided fields", async () => {
    const scheduledIso = "2024-04-01T10:00:00.000Z";
    const scheduledDate = new Date(scheduledIso);
    const marketRecord = buildPrismaMarket({ id: "104" });
    const updatedRecord = {
      ...marketRecord,
      scheduledStartAt: scheduledDate,
    };

    prismaMock.market.findUnique.mockResolvedValueOnce(marketRecord);
    prismaMock.market.update.mockResolvedValueOnce(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "schedule123",
      rawStdout: "Transaction ID: schedule123",
      rawStderr: "",
    });

    const result = await service.updateMarketSchedule("104", {
      scheduledStartAt: scheduledIso,
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/updateMarketSchedule.cdc",
      arguments: [
        { type: "UInt64", value: "104" },
        { type: "UFix64", value: "1711965600.00000000" },
        { type: "Bool", value: true },
        { type: "UFix64", value: "0.00000000" },
        { type: "Bool", value: false },
        { type: "UFix64", value: "0.00000000" },
        { type: "Bool", value: false },
        { type: "UFix64", value: "0.00000000" },
        { type: "Bool", value: false },
      ],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: marketRecord.id },
      data: {
        scheduledStartAt: scheduledDate,
        tradingLockAt: undefined,
        freezeWindowStartAt: undefined,
        freezeWindowEndAt: undefined,
      },
      include: expect.any(Object),
    });

    expect(result.market.schedule.scheduledStartAt).toBe(scheduledIso);
    expect(result.market.schedule.tradingLockAt).toBeUndefined();

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "UPDATE_SCHEDULE",
          transactionId: "schedule123",
        }),
      })
    );
  });

  it("updates patrol threshold amount", async () => {
    const marketRecord = buildPrismaMarket({ id: "105" });
    const updatedRecord = {
      ...marketRecord,
      patrolThreshold: new Prisma.Decimal(2.5),
    };

    prismaMock.market.findUnique.mockResolvedValueOnce(marketRecord);
    prismaMock.market.update.mockResolvedValueOnce(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "threshold123",
      rawStdout: "Transaction ID: threshold123",
      rawStderr: "",
    });

    const result = await service.updatePatrolThreshold("105", {
      patrolThreshold: 2.5,
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/updatePatrolThreshold.cdc",
      arguments: [
        { type: "UInt64", value: "105" },
        { type: "UFix64", value: "2.50000000" },
      ],
      signer: "emulator-account",
      network: "emulator",
    });

    const updateArgs = prismaMock.market.update.mock.calls.at(-1)?.[0];
    expect(updateArgs?.data?.patrolThreshold).toBeInstanceOf(Prisma.Decimal);
    expect(updateArgs?.data?.patrolThreshold.toString()).toBe("2.5");

    expect(result.market.patrolThreshold).toBe(2.5);

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "UPDATE_PATROL_THRESHOLD",
          transactionId: "threshold123",
        }),
      })
    );
  });

  it("records patrol signal and upserts entry", async () => {
    const marketRecord = buildPrismaMarket({ id: "106", patrolSignals: [] });
    const updatedRecord = buildPrismaMarket({
      id: "106",
      patrolSignals: [
        {
          id: "signal-1",
          marketId: "106",
          issuer: "0x0000000000000001",
          severity: "WARNING",
          code: "ALERT",
          weight: new Prisma.Decimal(1.5),
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          expiresAt: null,
          notes: "note",
        },
      ],
    });

    prismaMock.market.findUnique
      .mockResolvedValueOnce(marketRecord)
      .mockResolvedValueOnce(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "signal123",
      rawStdout: "Transaction ID: signal123",
      rawStderr: "",
    });

    const result = await service.recordPatrolSignal("106", {
      signer: "0x0000000000000001",
      severity: "warning",
      code: "ALERT",
      weight: 1.5,
      notes: " note ",
      expiresAt: "2024-06-01T00:00:00.000Z",
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/recordPatrolSignal.cdc",
      arguments: [
        { type: "UInt64", value: "106" },
        { type: "String", value: "warning" },
        { type: "String", value: "ALERT" },
        { type: "UFix64", value: "1.50000000" },
        { type: "UFix64", value: "1717200000.00000000" },
        { type: "Bool", value: true },
        { type: "String", value: "note" },
      ],
      signer: "0x0000000000000001",
      network: "emulator",
    });

    expect(prismaMock.patrolSignal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          marketId_issuer: {
            marketId: "106",
            issuer: "0x0000000000000001",
          },
        },
        create: expect.objectContaining({
          severity: "WARNING",
          code: "ALERT",
          weight: expect.any(Prisma.Decimal),
        }),
      })
    );

    expect(result.market.patrolSignals).toHaveLength(1);
    expect(result.market.patrolSignals[0]).toEqual(
      expect.objectContaining({
        issuer: "0x0000000000000001",
        severity: "warning",
        code: "ALERT",
      })
    );

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RECORD_PATROL_SIGNAL",
          transactionId: "signal123",
        }),
      })
    );
  });

  it("clears patrol signal and records transaction", async () => {
    const marketRecord = buildPrismaMarket({ id: "107" });
    const updatedRecord = buildPrismaMarket({ id: "107", patrolSignals: [] });

    prismaMock.market.findUnique
      .mockResolvedValueOnce(marketRecord)
      .mockResolvedValueOnce(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "clear123",
      rawStdout: "Transaction ID: clear123",
      rawStderr: "",
    });

    const result = await service.clearPatrolSignal("107", {
      patrolAddress: "0x0000000000000001",
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/clearPatrolSignal.cdc",
      arguments: [
        { type: "UInt64", value: "107" },
        { type: "Address", value: "0x0000000000000001" },
      ],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.patrolSignal.delete).toHaveBeenCalledWith({
      where: {
        marketId_issuer: {
          marketId: "107",
          issuer: "0x0000000000000001",
        },
      },
    });

    expect(result.market.patrolSignals).toEqual([]);

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CLEAR_PATROL_SIGNAL",
          transactionId: "clear123",
        }),
      })
    );
  });

  it("voids market", async () => {
    const marketRecord = buildPrismaMarket({ id: "103", state: "LIVE" });
    const updatedRecord = { ...marketRecord, state: "VOIDED" };

    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    prismaMock.market.update.mockResolvedValue(updatedRecord);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "void123",
      rawStdout: "Transaction ID: void123",
      rawStderr: "",
    });

    const result = await service.voidMarket("103");

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/voidMarket.cdc",
      arguments: [{ type: "UInt64", value: "103" }],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: "103" },
      data: { state: "VOIDED" },
      include: expect.objectContaining({
        liquidityPool: true,
        poolState: true,
        outcomes: true,
        workflow: true,
        settlement: true,
        patrolSignals: true,
      }),
    });

    expect(result.market.state).toBe("voided");

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "VOID",
          transactionId: "void123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "VOID",
        transactionId: "void123",
      })
    );

    expect(prismaMock.workflowAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          marketId: marketRecord.id,
          type: "VOID",
        }),
      })
    );
  });

  it("settles market and stores settlement details", async () => {
    const marketRecord = buildPrismaMarket({ id: "104", state: "LIVE" });

    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    prismaMock.market.update.mockImplementation(async ({ data }) => ({
      ...marketRecord,
      state: data.state,
      settlement: {
        id: "settlement-104",
        marketId: marketRecord.id,
        resolvedOutcomeId: data.settlement.upsert.create.resolvedOutcomeId,
        txId: data.settlement.upsert.create.txId,
        settledAt: data.settlement.upsert.create.settledAt,
        notes: data.settlement.upsert.create.notes ?? null,
        overrideReason: data.settlement.upsert.create.overrideReason ?? null,
      },
    }));

    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "settle123",
      rawStdout: "Transaction ID: settle123",
      rawStderr: "",
    });

    const result = await service.settleMarket("104", {
      outcomeId: 104000,
      resolvedOutcomeId: `outcome-104`,
      txHash: " 0xABC123 ",
      notes: "  final resolution  ",
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/settleMarket.cdc",
      arguments: [
        { type: "UInt64", value: "104" },
        { type: "UInt64", value: "104000" },
        { type: "String", value: "0xABC123" },
        { type: "Optional", value: { type: "String", value: "final resolution" } },
      ],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: "104" },
      data: {
        state: "SETTLED",
        settlement: {
          upsert: {
            create: {
              resolvedOutcomeId: "outcome-104",
              txId: "0xABC123",
              settledAt: expect.any(Date),
              notes: "final resolution",
              overrideReason: undefined,
            },
            update: {
              resolvedOutcomeId: "outcome-104",
              txId: "0xABC123",
              settledAt: expect.any(Date),
              notes: "final resolution",
              overrideReason: undefined,
            },
          },
        },
      },
      include: expect.any(Object),
    });

    expect(result.transactionId).toBe("settle123");
    expect(result.market.state).toBe("settled");
    expect(result.market.settlement).toEqual(
      expect.objectContaining({
        resolvedOutcomeId: "outcome-104",
        txId: "0xABC123",
        notes: "final resolution",
        overrideReason: undefined,
      })
    );

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "SETTLE",
          transactionId: "settle123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "SETTLE",
        transactionId: "settle123",
      })
    );

    expect(prismaMock.workflowAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          marketId: marketRecord.id,
          type: "SETTLE",
        }),
      })
    );
  });

  it("throws when settling with invalid outcome id", async () => {
    const marketRecord = buildPrismaMarket({ id: "201" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    await expect(
      service.settleMarket("201", {
        outcomeId: 1,
        resolvedOutcomeId: "missing-outcome",
        txHash: "0xHASH",
      })
    ).rejects.toThrow("Outcome missing-outcome does not belong to market 201");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
    expect(prismaMock.market.update).not.toHaveBeenCalled();
  });

  it("throws when settling with empty tx hash", async () => {
    const marketRecord = buildPrismaMarket({ id: "202" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    await expect(
      service.settleMarket("202", {
        outcomeId: 5,
        resolvedOutcomeId: `outcome-202`,
        txHash: "   ",
      })
    ).rejects.toThrow("txHash must be a non-empty string");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
  });

  it("overrides settlement with new details", async () => {
    const marketRecord = buildPrismaMarket({
      id: "301",
      state: "SETTLED",
      settlement: {
        id: "settlement-301",
        marketId: "301",
        resolvedOutcomeId: "outcome-301",
        txId: "0xOLD",
        settledAt: new Date("2024-01-02T00:00:00.000Z"),
        notes: "old",
        overrideReason: null,
      },
    });

    prismaMock.market.findUnique.mockResolvedValue(marketRecord);
    prismaMock.market.update.mockImplementation(async ({ data }) => ({
      ...marketRecord,
      settlement: {
        id: "settlement-301",
        marketId: "301",
        resolvedOutcomeId: data.settlement.upsert.create.resolvedOutcomeId,
        txId: data.settlement.upsert.create.txId,
        settledAt: data.settlement.upsert.create.settledAt,
        notes: data.settlement.upsert.create.notes ?? null,
        overrideReason: data.settlement.upsert.create.overrideReason ?? null,
      },
    }));

    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "override123",
      rawStdout: "Transaction ID: override123",
      rawStderr: "",
    });

    const result = await service.overrideSettlement("301", {
      outcomeId: 301000,
      resolvedOutcomeId: "outcome-301",
      txHash: " 0xNEW ",
      notes: "  adjusted  ",
      reason: "  wrong data  ",
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/overrideSettlement.cdc",
      arguments: [
        { type: "UInt64", value: "301" },
        { type: "UInt64", value: "301000" },
        { type: "String", value: "0xNEW" },
        { type: "Optional", value: { type: "String", value: "adjusted" } },
        { type: "String", value: "wrong data" },
      ],
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.market.update).toHaveBeenCalledWith({
      where: { id: "301" },
      data: {
        state: "SETTLED",
        settlement: {
          upsert: {
            create: {
              resolvedOutcomeId: "outcome-301",
              txId: "0xNEW",
              settledAt: expect.any(Date),
              notes: "adjusted",
              overrideReason: "wrong data",
            },
            update: {
              resolvedOutcomeId: "outcome-301",
              txId: "0xNEW",
              settledAt: expect.any(Date),
              notes: "adjusted",
              overrideReason: "wrong data",
            },
          },
        },
      },
      include: expect.any(Object),
    });

    expect(result.transactionId).toBe("override123");
    expect(result.market.settlement).toEqual(
      expect.objectContaining({
        txId: "0xNEW",
        notes: "adjusted",
        overrideReason: "wrong data",
      })
    );

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "OVERRIDE_SETTLEMENT",
          transactionId: "override123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "OVERRIDE_SETTLEMENT",
        transactionId: "override123",
      })
    );

    expect(prismaMock.workflowAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          marketId: marketRecord.id,
          type: "SETTLE",
        }),
      })
    );
  });

  it("throws when overriding without existing settlement", async () => {
    const marketRecord = buildPrismaMarket({ id: "302", settlement: null });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    await expect(
      service.overrideSettlement("302", {
        outcomeId: 1,
        resolvedOutcomeId: "outcome-302",
        txHash: "0xHASH",
        reason: "reason",
      })
    ).rejects.toThrow("Market 302 has no existing settlement to override");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
  });

  it("throws when overriding with missing reason", async () => {
    const marketRecord = buildPrismaMarket({
      id: "303",
      settlement: {
        id: "settlement-303",
        marketId: "303",
        resolvedOutcomeId: "outcome-303",
        txId: "0xOLD",
        settledAt: new Date(),
        notes: null,
        overrideReason: null,
      },
    });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    await expect(
      service.overrideSettlement("303", {
        outcomeId: 2,
        resolvedOutcomeId: "outcome-303",
        txHash: "0xHASH",
        reason: "   ",
      })
    ).rejects.toThrow("reason must be a non-empty string");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
  });

  it("throws when market id is invalid", async () => {
    await expect(
      service.quoteTrade("invalid", {
        outcomeIndex: 0,
        shares: 1,
        isBuy: true,
      })
    ).rejects.toThrow(BadRequestException);

    expect(poolStateServiceMock.getState).not.toHaveBeenCalled();
    expect(lmsrServiceMock.quoteTrade).not.toHaveBeenCalled();
  });

  it("validates shares amount", async () => {
    await expect(
      service.quoteTrade("1", {
        outcomeIndex: 0,
        shares: 0,
        isBuy: true,
      })
    ).rejects.toThrow("Shares must be a positive number");

    expect(poolStateServiceMock.getState).not.toHaveBeenCalled();
    expect(lmsrServiceMock.quoteTrade).not.toHaveBeenCalled();
  });

  it("executes trade and returns transaction info", async () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    const marketRecord = buildPrismaMarket({ id: "42" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    const quote: LmsrTradeQuote = {
      flowAmount: 2.80929804,
      outcomeAmount: 5,
      newBVector: [5, 0],
      newTotalLiquidity: 102.80929804,
      newOutcomeSupply: [5, 0],
      probabilities: [0.62245933, 0.37754067],
    };

    poolStateServiceMock.getState.mockResolvedValue(state);
    poolStateServiceMock.applyQuote.mockResolvedValue({
      liquidityParameter: state.liquidityParameter,
      totalLiquidity: quote.newTotalLiquidity,
      bVector: quote.newBVector,
      outcomeSupply: quote.newOutcomeSupply,
    });
    lmsrServiceMock.quoteTrade.mockReturnValue(quote);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "abc123",
      rawStdout: "Transaction ID: abc123",
      rawStderr: "",
    });

    const expectedArguments = [
      { type: "UInt64", value: "42" },
      { type: "Int", value: "0" },
      { type: "UFix64", value: "2.80929804" },
      { type: "UFix64", value: "5.00000000" },
      {
        type: "Array",
        value: [
          { type: "UFix64", value: "5.00000000" },
          { type: "UFix64", value: "0.00000000" },
        ],
      },
      { type: "UFix64", value: "102.80929804" },
      {
        type: "Array",
        value: [
          { type: "UFix64", value: "5.00000000" },
          { type: "UFix64", value: "0.00000000" },
        ],
      },
      { type: "Bool", value: true },
    ];

    const result = await service.executeTrade("42", {
      outcomeIndex: 0,
      shares: 5,
      isBuy: true,
    });

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/executeTrade.cdc",
      arguments: expectedArguments,
      signer: "emulator-account",
      network: "emulator",
    });

    expect(result).toEqual({
      flowAmount: "2.80929804",
      outcomeAmount: "5.00000000",
      newBVector: ["5.00000000", "0.00000000"],
      newTotalLiquidity: "102.80929804",
      newOutcomeSupply: ["5.00000000", "0.00000000"],
      probabilities: [0.62245933, 0.37754067],
      cadenceArguments: expectedArguments,
      transactionPath: "contracts/cadence/transactions/executeTrade.cdc",
      transactionId: "abc123",
      signer: "emulator-account",
      network: "emulator",
    });

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "EXECUTE_TRADE",
          transactionId: "abc123",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "EXECUTE_TRADE",
        transactionId: "abc123",
      })
    );

    expect(poolStateServiceMock.getState).toHaveBeenCalledWith(42, marketRecord.id);
    expect(poolStateServiceMock.applyQuote).toHaveBeenCalledWith(42, marketRecord.id, state, quote);
    expect(updatesGatewayMock.emitPoolStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: marketRecord.id,
        state: {
          liquidityParameter: state.liquidityParameter,
          totalLiquidity: quote.newTotalLiquidity,
          bVector: quote.newBVector,
          outcomeSupply: quote.newOutcomeSupply,
        },
      })
    );

    expect(prismaMock.marketTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          outcomeId: marketRecord.outcomes[0].id,
          outcomeLabel: marketRecord.outcomes[0].label,
          outcomeIndex: 0,
          isBuy: true,
          transactionId: "abc123",
          signer: "emulator-account",
          network: "emulator",
        }),
      })
    );

    expect(updatesGatewayMock.emitTrade).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        transactionId: "abc123",
        outcomeIndex: 0,
      })
    );
  });

  it("uses custom signer and network when provided", async () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    const marketRecord = buildPrismaMarket({ id: "42" });
    prismaMock.market.findUnique.mockResolvedValue(marketRecord);

    const quote: LmsrTradeQuote = {
      flowAmount: 2.80929804,
      outcomeAmount: 5,
      newBVector: [5, 0],
      newTotalLiquidity: 102.80929804,
      newOutcomeSupply: [5, 0],
      probabilities: [0.62245933, 0.37754067],
    };

    poolStateServiceMock.getState.mockResolvedValue(state);
    poolStateServiceMock.applyQuote.mockResolvedValue({
      liquidityParameter: state.liquidityParameter,
      totalLiquidity: quote.newTotalLiquidity,
      bVector: quote.newBVector,
      outcomeSupply: quote.newOutcomeSupply,
    });
    lmsrServiceMock.quoteTrade.mockReturnValue(quote);
    flowTransactionServiceMock.send.mockResolvedValue({
      transactionId: "def456",
      rawStdout: "Transaction ID: def456",
      rawStderr: "",
    });

    const payload = {
      outcomeIndex: 0,
      shares: 5,
      isBuy: true,
      signer: "user-account",
      network: "testing",
    };

    const result = await service.executeTrade("42", payload);

    expect(flowTransactionServiceMock.send).toHaveBeenCalledWith({
      transactionPath: "contracts/cadence/transactions/executeTrade.cdc",
      arguments: expect.any(Array),
      signer: "user-account",
      network: "testing",
    });

    expect(result.signer).toBe("user-account");
    expect(result.network).toBe("testing");
    expect(result.transactionId).toBe("def456");
    expect(result.cadenceArguments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "UInt64", value: "42" }),
        expect.objectContaining({ type: "Int", value: "0" }),
      ])
    );

    expect(prismaMock.marketTransactionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketId: marketRecord.id,
          type: "EXECUTE_TRADE",
          signer: "user-account",
          network: "testing",
        }),
      })
    );

    expect(updatesGatewayMock.emitTransactionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        type: "EXECUTE_TRADE",
        transactionId: "def456",
        signer: "user-account",
        network: "testing",
      })
    );

    expect(updatesGatewayMock.emitTrade).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: marketRecord.slug,
        transactionId: "def456",
        signer: "user-account",
        network: "testing",
      })
    );

    expect(poolStateServiceMock.getState).toHaveBeenCalledWith(42, marketRecord.id);
    expect(poolStateServiceMock.applyQuote).toHaveBeenCalledWith(42, marketRecord.id, state, quote);
  });

  it("throws when maxFlowAmount is exceeded", async () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    prismaMock.market.findUnique.mockResolvedValue(buildPrismaMarket({ id: "42" }));

    const quote: LmsrTradeQuote = {
      flowAmount: 2.80929804,
      outcomeAmount: 5,
      newBVector: [5, 0],
      newTotalLiquidity: 102.80929804,
      newOutcomeSupply: [5, 0],
      probabilities: [0.62245933, 0.37754067],
    };

    poolStateServiceMock.getState.mockResolvedValue(state);
    lmsrServiceMock.quoteTrade.mockReturnValue(quote);

    await expect(
      service.executeTrade("42", {
        outcomeIndex: 0,
        shares: 5,
        isBuy: true,
        maxFlowAmount: 1,
      })
    ).rejects.toThrow("Flow amount exceeds maxFlowAmount tolerance");

    expect(flowTransactionServiceMock.send).not.toHaveBeenCalled();
    expect(poolStateServiceMock.applyQuote).not.toHaveBeenCalled();
  });
});
