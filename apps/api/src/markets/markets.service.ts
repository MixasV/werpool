import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  LiquidityPool as PrismaLiquidityPool,
  FlowTransactionStatus as PrismaFlowTransactionStatus,
  FlowTransactionType as PrismaFlowTransactionType,
  Market as PrismaMarket,
  MarketAnalyticsInterval as PrismaMarketAnalyticsInterval,
  MarketCategory as PrismaMarketCategory,
  MarketTrade as PrismaMarketTrade,
  MarketTransactionLog as PrismaMarketTransactionLog,
  MarketState as PrismaMarketState,
  MomentLockStatus as PrismaMomentLockStatus,
  Outcome as PrismaOutcome,
  OutcomeStatus as PrismaOutcomeStatus,
  PatrolSignal as PrismaPatrolSignal,
  PatrolSignalSeverity as PrismaPatrolSignalSeverity,
  Prisma,
  PointEventSource as PrismaPointEventSource,
  SchedulerTaskStatus as PrismaSchedulerTaskStatus,
  SchedulerTaskType as PrismaSchedulerTaskType,
  Settlement as PrismaSettlement,
  WorkflowAction as PrismaWorkflowAction,
  WorkflowActionStatus as PrismaWorkflowActionStatus,
  WorkflowActionType as PrismaWorkflowActionType,
} from "@prisma/client";

import {
  LiquidityPool,
  Market,
  MarketCategory,
  MarketState,
  Outcome,
  OutcomeStatus,
  PatrolSignal,
  PatrolSignalSeverity,
  WorkflowAction,
  WorkflowActionStatus,
  WorkflowActionType,
} from "./domain/market";
import { CreateMarketDto, UpdateMarketDto } from "./dto/create-market.dto";
import { QuoteTradeRequestDto, QuoteTradeResponseDto } from "./dto/quote-trade.dto";
import { ExecuteTradeRequestDto, ExecuteTradeResponseDto } from "./dto/execute-trade.dto";
import { ClaimRewardsRequestDto, ClaimRewardsResponseDto } from "./dto/claim-rewards.dto";
import { MarketPoolStateDto } from "./dto/market-pool-state.dto";
import {
  CreateMarketPoolRequestDto,
  CreateMarketPoolResponseDto,
} from "./dto/create-market-pool.dto";
import { MarketStorageMetadataDto } from "./dto/market-storage-metadata.dto";
import { MintOutcomeRequestDto, MintOutcomeResponseDto } from "./dto/mint-outcome.dto";
import { BurnOutcomeRequestDto, BurnOutcomeResponseDto } from "./dto/burn-outcome.dto";
import { SyncPoolStateRequestDto, SyncPoolStateResponseDto } from "./dto/sync-pool-state.dto";
import {
  ActivateMarketRequestDto,
  ClearPatrolSignalRequestDto,
  CloseMarketRequestDto,
  OverrideSettlementRequestDto,
  RecordPatrolSignalRequestDto,
  SettleMarketRequestDto,
  SuspendMarketRequestDto,
  UpdateMarketScheduleRequestDto,
  UpdatePatrolThresholdRequestDto,
  VoidMarketRequestDto,
} from "./dto/market-action.dto";
import { PrismaService } from "../prisma/prisma.service";
import { LmsrService } from "./lmsr/lmsr.service";
import { LmsrTradeQuote, LmsrState } from "./lmsr/lmsr.types";
import { FlowMarketService } from "./flow/flow-market.service";
import { FlowTransactionService } from "./flow/flow-transaction.service";
import { MarketUpdatesGateway } from "./market-updates.gateway";
import { normalizeFlowAddress } from "../common/flow-address.util";
import {
  MarketAnalyticsSnapshotDto,
  toMarketAnalyticsDto,
} from "./dto/market-analytics.dto";
import { MarketAnalyticsService } from "./market-analytics.service";
import { MarketPoolStateService } from "./market-pool-state.service";
import { SchedulerService } from "../scheduler/scheduler.service";
import { PointsService } from "../points/points.service";
import { TopShotLockService } from "../topshot/topshot-lock.service";
import { TopShotService } from "../topshot/topshot.service";
import { TopShotRewardService } from "../topshot/topshot-reward.service";
import { TopShotProjectedBonus, TopShotMomentLockDto } from "../topshot/topshot.types";

type PrismaMarketWithRelations = PrismaMarket & {
  liquidityPool: PrismaLiquidityPool | null;
  poolState: { flowMarketId: number } | null;
  outcomes: PrismaOutcome[];
  workflow: PrismaWorkflowAction[];
  settlement: PrismaSettlement | null;
  patrolSignals: PrismaPatrolSignal[];
};

const includeMarketRelations = {
  liquidityPool: true,
  poolState: true,
  outcomes: true,
  workflow: true,
  settlement: true,
  patrolSignals: true,
} satisfies Prisma.MarketInclude;

type CadenceArgument = { type: string; value: unknown };

interface FormattedTradeQuote {
  flowAmount: string;
  outcomeAmount: string;
  newBVector: string[];
  newTotalLiquidity: string;
  newOutcomeSupply: string[];
  cadenceArguments: CadenceArgument[];
}

interface CalculatedTradeQuote extends FormattedTradeQuote {
  quote: LmsrTradeQuote;
  probabilities: number[];
  state: LmsrState;
}

interface MarketTransactionResult {
  market: Market;
  transactionPath: string;
  cadenceArguments: CadenceArgument[];
  transactionId: string;
  signer: string;
  network: string;
}

const toDomainState = (state: PrismaMarketState): MarketState =>
  state.toLowerCase() as MarketState;

const toPrismaState = (state: MarketState = "draft"): PrismaMarketState =>
  state.toUpperCase() as PrismaMarketState;

const toDomainCategory = (category: PrismaMarketCategory): MarketCategory =>
  category.toLowerCase() as MarketCategory;

const toPrismaCategory = (
  category: MarketCategory = "crypto"
): PrismaMarketCategory => category.toUpperCase() as PrismaMarketCategory;

const toDomainOutcomeStatus = (
  status: PrismaOutcomeStatus
): OutcomeStatus => status.toLowerCase() as OutcomeStatus;

const toPrismaOutcomeStatus = (
  status: OutcomeStatus = "active"
): PrismaOutcomeStatus => status.toUpperCase() as PrismaOutcomeStatus;

const toDomainWorkflowStatus = (
  status: PrismaWorkflowActionStatus
): WorkflowActionStatus => status.toLowerCase() as WorkflowActionStatus;

const toPrismaWorkflowStatus = (
  status: WorkflowActionStatus = "pending"
): PrismaWorkflowActionStatus =>
  status.toUpperCase() as PrismaWorkflowActionStatus;

const toDomainWorkflowType = (
  type: PrismaWorkflowActionType
): WorkflowActionType => type.toLowerCase() as WorkflowActionType;

const toPrismaWorkflowType = (
  type: WorkflowActionType
): PrismaWorkflowActionType => type.toUpperCase() as PrismaWorkflowActionType;

const toDomainPatrolSeverity = (
  severity: PrismaPatrolSignalSeverity
): PatrolSignalSeverity => severity.toLowerCase() as PatrolSignalSeverity;

const toPrismaPatrolSeverity = (
  severity: PatrolSignalSeverity
): PrismaPatrolSignalSeverity => severity.toUpperCase() as PrismaPatrolSignalSeverity;

const toIsoString = (value?: Date | null): string | undefined =>
  value ? value.toISOString() : undefined;

const createSettlementData = (payload: CreateMarketDto["settlement"]) =>
  payload
    ? {
        create: {
          resolvedOutcomeId: payload.resolvedOutcomeId,
          txId: payload.txId,
          settledAt: new Date(payload.settledAt),
          notes: payload.notes ?? undefined,
        },
      }
    : undefined;

const upsertSettlementData = (payload: CreateMarketDto["settlement"]) =>
  payload
    ? {
        upsert: {
          create: {
            resolvedOutcomeId: payload.resolvedOutcomeId,
            txId: payload.txId,
            settledAt: new Date(payload.settledAt),
            notes: payload.notes ?? undefined,
          },
          update: {
            resolvedOutcomeId: payload.resolvedOutcomeId,
            txId: payload.txId,
            settledAt: new Date(payload.settledAt),
            notes: payload.notes ?? undefined,
          },
        },
      }
    : undefined;

const decimalToNumber = (value: Prisma.Decimal | null | undefined): number =>
  value ? Number(value) : 0;

const toJsonRecord = (
  value: Prisma.JsonValue | null | undefined
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const toInputJson = (value: Record<string, unknown> | undefined) =>
  (value ?? undefined) as Prisma.InputJsonValue | undefined;

const toDomainOutcome = (outcome: PrismaOutcome, index?: number): Outcome => ({
  id: outcome.id,
  index,
  label: outcome.label,
  status: toDomainOutcomeStatus(outcome.status),
  impliedProbability: decimalToNumber(outcome.impliedProbability),
  liquidity: decimalToNumber(outcome.liquidity),
  metadata: toJsonRecord(outcome.metadata),
});

const toDomainLiquidityPool = (
  pool: PrismaLiquidityPool | null
): LiquidityPool => ({
  id: pool?.id ?? "",
  tokenSymbol: pool?.tokenSymbol ?? "FLOW",
  totalLiquidity: decimalToNumber(pool?.totalLiquidity ?? null),
  feeBps: pool?.feeBps ?? 0,
  providerCount: pool?.providerCount ?? 0,
});

const extractExecutedAt = (
  metadata: Prisma.JsonValue | null | undefined
): string | undefined => {
  const record = toJsonRecord(metadata);
  if (!record) {
    return undefined;
  }
  const value = record.executedAt;
  return typeof value === "string" ? value : undefined;
};

const toDomainWorkflow = (
  action: PrismaWorkflowAction
): WorkflowAction => ({
  id: action.id,
  type: toDomainWorkflowType(action.type),
  status: toDomainWorkflowStatus(action.status),
  description: action.description,
  scheduledAt: action.triggersAt ? action.triggersAt.toISOString() : undefined,
  executedAt: extractExecutedAt(action.metadata),
  triggersAt: action.triggersAt?.toISOString(),
  metadata: toJsonRecord(action.metadata),
});

const toDomainSettlement = (
  settlement: PrismaSettlement | null
): Market["settlement"] =>
  settlement
    ? {
        id: settlement.id,
        resolvedOutcomeId: settlement.resolvedOutcomeId,
        txId: settlement.txId,
        settledAt: settlement.settledAt.toISOString(),
        notes: settlement.notes ?? undefined,
        overrideReason: settlement.overrideReason ?? undefined,
      }
    : undefined;

const toDomainPatrolSignal = (signal: PrismaPatrolSignal): PatrolSignal => ({
  id: signal.id,
  issuer: signal.issuer,
  severity: toDomainPatrolSeverity(signal.severity),
  code: signal.code,
  weight: decimalToNumber(signal.weight),
  createdAt: signal.createdAt.toISOString(),
  expiresAt: toIsoString(signal.expiresAt),
  notes: signal.notes ?? undefined,
});

const toDomainMarket = (market: PrismaMarketWithRelations): Market => ({
  id: market.id,
  slug: market.slug,
  title: market.title,
  description: market.description,
  state: toDomainState(market.state),
  category: toDomainCategory(market.category),
  tags: Array.isArray(market.tags) ? market.tags : [],
  oracleId: market.oracleId ?? undefined,
  patrolThreshold:
    market.patrolThreshold !== null && market.patrolThreshold !== undefined
      ? decimalToNumber(market.patrolThreshold)
      : undefined,
  createdAt: market.createdAt.toISOString(),
  closeAt: toIsoString(market.closeAt),
  schedule: {
    scheduledStartAt: toIsoString(market.scheduledStartAt),
    tradingLockAt: toIsoString(market.tradingLockAt),
    freezeWindowStartAt: toIsoString(market.freezeWindowStartAt),
    freezeWindowEndAt: toIsoString(market.freezeWindowEndAt),
  },
  liquidityPool: toDomainLiquidityPool(market.liquidityPool),
  outcomes: market.outcomes.map((outcome, index) => toDomainOutcome(outcome, index)),
  workflow: market.workflow.map(toDomainWorkflow),
  settlement: toDomainSettlement(market.settlement),
  patrolSignals: market.patrolSignals.map(toDomainPatrolSignal),
});

const MAX_USER_POSITION_PER_MARKET = 1000;
const DEFAULT_LIQUIDITY_PARAMETER = 2000;
const DEFAULT_SEED_AMOUNT = 50000;

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);
  private readonly tradeTransactionPath = "contracts/cadence/transactions/executeTrade.cdc";
  private readonly createPoolTransactionPath = "contracts/cadence/transactions/createMarketPool.cdc";
  private readonly createMarketTransactionPath = "contracts/cadence/transactions/createMarket.cdc";
  private readonly mintOutcomeTransactionPath = "contracts/cadence/transactions/mintOutcome.cdc";
  private readonly burnOutcomeTransactionPath = "contracts/cadence/transactions/burnOutcome.cdc";
  private readonly syncMarketStateTransactionPath = "contracts/cadence/transactions/syncMarketState.cdc";
  private readonly activateMarketTransactionPath = "contracts/cadence/transactions/activateMarket.cdc";
  private readonly suspendMarketTransactionPath = "contracts/cadence/transactions/suspendMarket.cdc";
  private readonly voidMarketTransactionPath = "contracts/cadence/transactions/voidMarket.cdc";
  private readonly settleMarketTransactionPath = "contracts/cadence/transactions/settleMarket.cdc";
  private readonly overrideSettlementTransactionPath =
    "contracts/cadence/transactions/overrideSettlement.cdc";
  private readonly closeMarketTransactionPath = "contracts/cadence/transactions/closeMarket.cdc";
  private readonly updateMarketScheduleTransactionPath =
    "contracts/cadence/transactions/updateMarketSchedule.cdc";
  private readonly updatePatrolThresholdTransactionPath =
    "contracts/cadence/transactions/updatePatrolThreshold.cdc";
  private readonly recordPatrolSignalTransactionPath =
    "contracts/cadence/transactions/recordPatrolSignal.cdc";
  private readonly clearPatrolSignalTransactionPath =
    "contracts/cadence/transactions/clearPatrolSignal.cdc";

  constructor(
    private readonly prisma: PrismaService,
    private readonly lmsrService: LmsrService,
    private readonly flowMarketService: FlowMarketService,
    private readonly poolStateService: MarketPoolStateService,
    private readonly flowTransactionService: FlowTransactionService,
    private readonly analyticsService: MarketAnalyticsService,
    private readonly schedulerService: SchedulerService,
    private readonly pointsService: PointsService,
    private readonly updatesGateway: MarketUpdatesGateway,
    private readonly topShotLockService: TopShotLockService,
    private readonly topShotService: TopShotService,
    private readonly topShotRewardService: TopShotRewardService
  ) {}

  async findAll(): Promise<Market[]> {
    const markets = await this.prisma.market.findMany({
      include: includeMarketRelations,
      orderBy: { createdAt: "desc" },
    });

    return markets.map(toDomainMarket);
  }

  async findOne(idOrSlug: string): Promise<Market> {
    const market = await this.prisma.market.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: includeMarketRelations,
    });

    if (!market) {
      throw new NotFoundException(`Market ${idOrSlug} not found`);
    }

    return toDomainMarket(market);
  }

  async getPoolState(marketId: string): Promise<MarketPoolStateDto> {
    const marketRecord = await this.getMarketRecordByIdOrSlug(marketId);
    const numericMarketId = this.getNumericMarketId(marketRecord);
    return this.poolStateService.getState(numericMarketId, marketRecord.id);
  }

  async getMarketStorage(marketId: string): Promise<MarketStorageMetadataDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const metadata = await this.flowMarketService.getMarketStorage(parsedMarketId);

    return {
      liquidityPoolPath: metadata.liquidityPoolPath,
      outcomeVaultPath: metadata.outcomeVaultPath,
      liquidityReceiverPath: metadata.liquidityReceiverPath,
      liquidityProviderPath: metadata.liquidityProviderPath,
      outcomeReceiverPath: metadata.outcomeReceiverPath,
      outcomeBalancePath: metadata.outcomeBalancePath,
      outcomeProviderPath: metadata.outcomeProviderPath,
      owner: metadata.owner,
    };
  }

  async getAccountBalances(
    marketId: string,
    address: string
  ): Promise<{ flowBalance: string; outcomeBalance: string }> {
    const marketRecord = await this.getMarketRecordByIdOrSlug(marketId);
    
    if (!marketRecord.poolState?.flowMarketId) {
      return {
        flowBalance: "0.00000000",
        outcomeBalance: "0.00000000",
      };
    }
    
    const numericMarketId = this.getNumericMarketId(marketRecord);
    const normalizedAddress = normalizeFlowAddress(address);
    const balances = await this.flowMarketService.getAccountBalances(
      normalizedAddress,
      numericMarketId
    );

    return {
      flowBalance: this.formatUFix64(balances.flowBalance),
      outcomeBalance: this.formatUFix64(balances.outcomeBalance),
    };
  }

  async createPool(
    marketId: string,
    payload: CreateMarketPoolRequestDto
  ): Promise<CreateMarketPoolResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const outcomeCount = this.parseOutcomeCount(payload.outcomeCount);
    const liquidityParameter = this.parsePositiveNumber(
      payload.liquidityParameter,
      "liquidityParameter"
    );
    const seedAmount = this.parsePositiveNumber(payload.seedAmount, "seedAmount");

    const formattedLiquidity = this.formatUFix64(liquidityParameter);
    const formattedSeed = this.formatUFix64(seedAmount);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "Int", value: outcomeCount.toString() },
      { type: "UFix64", value: formattedLiquidity },
      { type: "UFix64", value: formattedSeed },
    ];

    const signer =
      payload.signer ?? process.env.FLOW_TRANSACTION_SIGNER ?? "emulator-account";
    const network = payload.network ?? process.env.FLOW_NETWORK ?? "emulator";

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.createPoolTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const response: CreateMarketPoolResponseDto = {
      outcomeCount,
      liquidityParameter: formattedLiquidity,
      seedAmount: formattedSeed,
      transactionPath: this.createPoolTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.CREATE_POOL,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        outcomeCount,
        liquidityParameter: formattedLiquidity,
        seedAmount: formattedSeed,
        cadenceArguments,
      },
    });

    const refreshedState = await this.poolStateService.refreshFromFlow(
      parsedMarketId,
      marketRecord.id
    );
    await this.broadcastPoolState(parsedMarketId, { state: refreshedState });

    return response;
  }

  async mintOutcome(
    marketId: string,
    payload: MintOutcomeRequestDto
  ): Promise<MintOutcomeResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const amount = this.parsePositiveNumber(payload.amount, "amount");
    const formattedAmount = this.formatUFix64(amount);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "UFix64", value: formattedAmount },
    ];

    const signer =
      payload.signer ?? process.env.FLOW_TRANSACTION_SIGNER ?? "emulator-account";
    const network = payload.network ?? process.env.FLOW_NETWORK ?? "emulator";

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.mintOutcomeTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const response: MintOutcomeResponseDto = {
      amount: formattedAmount,
      transactionPath: this.mintOutcomeTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.MINT_OUTCOME,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        amount: formattedAmount,
        cadenceArguments,
      },
    });

    const refreshedState = await this.poolStateService.refreshFromFlow(
      parsedMarketId,
      marketRecord.id
    );
    await this.broadcastPoolState(parsedMarketId, { state: refreshedState });

    return response;
  }

  async burnOutcome(
    marketId: string,
    payload: BurnOutcomeRequestDto
  ): Promise<BurnOutcomeResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const amount = this.parsePositiveNumber(payload.amount, "amount");
    const formattedAmount = this.formatUFix64(amount);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "UFix64", value: formattedAmount },
    ];

    const signer =
      payload.signer ?? process.env.FLOW_TRANSACTION_SIGNER ?? "emulator-account";
    const network = payload.network ?? process.env.FLOW_NETWORK ?? "emulator";

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.burnOutcomeTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const response: BurnOutcomeResponseDto = {
      amount: formattedAmount,
      transactionPath: this.burnOutcomeTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.BURN_OUTCOME,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        amount: formattedAmount,
        cadenceArguments,
      },
    });

    const refreshedState = await this.poolStateService.refreshFromFlow(
      parsedMarketId,
      marketRecord.id
    );
    await this.broadcastPoolState(parsedMarketId, { state: refreshedState });

    return response;
  }

  async syncPoolState(
    marketId: string,
    payload: SyncPoolStateRequestDto
  ): Promise<SyncPoolStateResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const bVector = this.parseNumberArray(payload.bVector, "bVector");
    const outcomeSupply = this.parseNumberArray(payload.outcomeSupply, "outcomeSupply");

    if (bVector.length !== outcomeSupply.length) {
      throw new BadRequestException("bVector and outcomeSupply must have the same length");
    }

    const totalLiquidity = this.parsePositiveNumber(payload.totalLiquidity, "totalLiquidity");

    const formattedBVector = bVector.map((value) => this.formatUFix64(value));
    const formattedTotalLiquidity = this.formatUFix64(totalLiquidity);
    const formattedOutcomeSupply = outcomeSupply.map((value) => this.formatUFix64(value));

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      {
        type: "Array",
        value: formattedBVector.map((value) => ({ type: "UFix64", value })),
      },
      { type: "UFix64", value: formattedTotalLiquidity },
      {
        type: "Array",
        value: formattedOutcomeSupply.map((value) => ({ type: "UFix64", value })),
      },
    ];

    const signer =
      payload.signer ?? process.env.FLOW_TRANSACTION_SIGNER ?? "emulator-account";
    const network = payload.network ?? process.env.FLOW_NETWORK ?? "emulator";

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.syncMarketStateTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const response: SyncPoolStateResponseDto = {
      bVector: formattedBVector,
      totalLiquidity: formattedTotalLiquidity,
      outcomeSupply: formattedOutcomeSupply,
      transactionPath: this.syncMarketStateTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.SYNC_POOL,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        bVector: formattedBVector,
        outcomeSupply: formattedOutcomeSupply,
        totalLiquidity: formattedTotalLiquidity,
        cadenceArguments,
      },
    });

    const currentState = await this.poolStateService.getState(parsedMarketId, marketRecord.id);
    const updatedState: LmsrState = {
      liquidityParameter: currentState.liquidityParameter,
      totalLiquidity,
      bVector,
      outcomeSupply,
    };

    await this.poolStateService.syncState(parsedMarketId, marketRecord.id, updatedState);

    await this.broadcastPoolState(parsedMarketId, { state: updatedState });

    return response;
  }

  async activateMarket(
    marketId: string,
    payload: ActivateMarketRequestDto = {}
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.activateMarketTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: { state: toPrismaState("live") },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.activateMarketTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.ACTIVATE,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: { cadenceArguments },
    });

    await this.markWorkflowActionExecuted(marketRecord.id, PrismaWorkflowActionType.OPEN, {
      transactionId: transaction.transactionId,
      signer,
      network,
    });

    return result;
  }

  async suspendMarket(
    marketId: string,
    payload: SuspendMarketRequestDto = {}
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const reason = this.sanitizeOptionalString(payload.reason);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      this.buildOptionalStringArgument(reason),
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.suspendMarketTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: { state: toPrismaState("suspended") },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.suspendMarketTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.SUSPEND,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: { cadenceArguments, reason },
    });

    await this.markWorkflowActionExecuted(marketRecord.id, PrismaWorkflowActionType.SUSPEND, {
      transactionId: transaction.transactionId,
      signer,
      network,
      extra: reason ? { reason } : undefined,
    });

    return result;
  }

  async closeMarket(
    marketId: string,
    payload: CloseMarketRequestDto = {}
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const reason = this.sanitizeOptionalString(payload.reason);
    let closedAtDate: Date | undefined;
    if (Object.prototype.hasOwnProperty.call(payload, "closedAt")) {
      closedAtDate = this.parseIsoDate(payload.closedAt);
      if (payload.closedAt && !closedAtDate) {
        throw new BadRequestException("closedAt must be a valid ISO timestamp");
      }
    }

    const zeroUFix64 = this.formatUFix64(0);
    const formattedClosedAt = closedAtDate ? this.formatTimestamp(closedAtDate) : undefined;

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "String", value: reason ?? "" },
      { type: "UFix64", value: formattedClosedAt ?? zeroUFix64 },
      { type: "Bool", value: formattedClosedAt !== undefined },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.closeMarketTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const effectiveClosedAt = closedAtDate ?? new Date();

    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: {
        state: toPrismaState("closed"),
        closeAt: effectiveClosedAt,
      },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.closeMarketTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.CLOSE,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        reason,
        closedAt: effectiveClosedAt.toISOString(),
      },
    });

    return result;
  }

  async voidMarket(
    marketId: string,
    payload: VoidMarketRequestDto = {}
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.voidMarketTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: { state: toPrismaState("voided") },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.voidMarketTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.VOID,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: { cadenceArguments },
    });

    await this.markWorkflowActionExecuted(marketRecord.id, PrismaWorkflowActionType.VOID, {
      transactionId: transaction.transactionId,
      signer,
      network,
    });

    return result;
  }

  async updateMarketSchedule(
    marketId: string,
    payload: UpdateMarketScheduleRequestDto = {}
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const scheduledStartAtDate = this.parseScheduleTimestamp(
      payload.scheduledStartAt,
      "scheduledStartAt"
    );
    const tradingLockAtDate = this.parseScheduleTimestamp(
      payload.tradingLockAt,
      "tradingLockAt"
    );
    const freezeWindowStartAtDate = this.parseScheduleTimestamp(
      payload.freezeWindowStartAt,
      "freezeWindowStartAt"
    );
    const freezeWindowEndAtDate = this.parseScheduleTimestamp(
      payload.freezeWindowEndAt,
      "freezeWindowEndAt"
    );

    const zeroUFix64 = this.formatUFix64(0);
    const formattedScheduledStartAt = scheduledStartAtDate
      ? this.formatTimestamp(scheduledStartAtDate)
      : undefined;
    const formattedTradingLockAt = tradingLockAtDate
      ? this.formatTimestamp(tradingLockAtDate)
      : undefined;
    const formattedFreezeStartAt = freezeWindowStartAtDate
      ? this.formatTimestamp(freezeWindowStartAtDate)
      : undefined;
    const formattedFreezeEndAt = freezeWindowEndAtDate
      ? this.formatTimestamp(freezeWindowEndAtDate)
      : undefined;

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "UFix64", value: formattedScheduledStartAt ?? zeroUFix64 },
      { type: "Bool", value: formattedScheduledStartAt !== undefined },
      { type: "UFix64", value: formattedTradingLockAt ?? zeroUFix64 },
      { type: "Bool", value: formattedTradingLockAt !== undefined },
      { type: "UFix64", value: formattedFreezeStartAt ?? zeroUFix64 },
      { type: "Bool", value: formattedFreezeStartAt !== undefined },
      { type: "UFix64", value: formattedFreezeEndAt ?? zeroUFix64 },
      { type: "Bool", value: formattedFreezeEndAt !== undefined },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.updateMarketScheduleTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: {
        scheduledStartAt: scheduledStartAtDate ?? undefined,
        tradingLockAt: tradingLockAtDate ?? undefined,
        freezeWindowStartAt: freezeWindowStartAtDate ?? undefined,
        freezeWindowEndAt: freezeWindowEndAtDate ?? undefined,
      },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.updateMarketScheduleTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.UPDATE_SCHEDULE,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        schedule: {
          scheduledStartAt: scheduledStartAtDate?.toISOString(),
          tradingLockAt: tradingLockAtDate?.toISOString(),
          freezeWindowStartAt: freezeWindowStartAtDate?.toISOString(),
          freezeWindowEndAt: freezeWindowEndAtDate?.toISOString(),
        },
      },
    });

    await this.syncSchedulerTasksForMarket(updated, {
      createdBy: signer,
    });

    return result;
  }

  async updatePatrolThreshold(
    marketId: string,
    payload: UpdatePatrolThresholdRequestDto
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const threshold = this.parseNonNegativeNumber(
      payload.patrolThreshold,
      "patrolThreshold"
    );
    if (threshold === undefined) {
      throw new BadRequestException("patrolThreshold must be provided");
    }

    const formattedThreshold = this.formatUFix64(threshold);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "UFix64", value: formattedThreshold },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.updatePatrolThresholdTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: {
        patrolThreshold: new Prisma.Decimal(threshold),
      },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.updatePatrolThresholdTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.UPDATE_PATROL_THRESHOLD,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        patrolThreshold: threshold,
      },
    });

    return result;
  }

  async recordPatrolSignal(
    marketId: string,
    payload: RecordPatrolSignalRequestDto
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);
    const issuerSource = payload.issuer ?? signer;
    let issuer: string;
    try {
      issuer = normalizeFlowAddress(issuerSource);
    } catch (error) {
      throw new BadRequestException("issuer or signer must be a valid Flow address");
    }
    const severity = payload.severity ?? "info";
    const code = this.ensureNonEmptyString(payload.code, "code");
    const weight = this.parsePositiveNumber(payload.weight, "weight");
    const notes = this.sanitizeOptionalString(payload.notes);
    const expiresAtDate = this.parseIsoDate(payload.expiresAt);
    if (payload.expiresAt && !expiresAtDate) {
      throw new BadRequestException("expiresAt must be a valid ISO timestamp");
    }

    const zeroUFix64 = this.formatUFix64(0);
    const formattedWeight = this.formatUFix64(weight);
    const formattedExpiresAt = expiresAtDate ? this.formatTimestamp(expiresAtDate) : undefined;

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "String", value: severity },
      { type: "String", value: code },
      { type: "UFix64", value: formattedWeight },
      { type: "UFix64", value: formattedExpiresAt ?? zeroUFix64 },
      { type: "Bool", value: formattedExpiresAt !== undefined },
      { type: "String", value: notes ?? "" },
    ];

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.recordPatrolSignalTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const now = new Date();

    await this.prisma.patrolSignal.upsert({
      where: {
        marketId_issuer: {
          marketId: marketRecord.id,
          issuer,
        },
      },
      update: {
        severity: toPrismaPatrolSeverity(severity),
        code,
        weight: new Prisma.Decimal(weight),
        expiresAt: expiresAtDate ?? null,
        notes: notes ?? null,
        createdAt: now,
      },
      create: {
        marketId: marketRecord.id,
        issuer,
        severity: toPrismaPatrolSeverity(severity),
        code,
        weight: new Prisma.Decimal(weight),
        createdAt: now,
        expiresAt: expiresAtDate ?? null,
        notes: notes ?? null,
      },
    });

    const updated = await this.getMarketRecord(parsedMarketId);

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.recordPatrolSignalTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.RECORD_PATROL_SIGNAL,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        issuer,
        severity,
        code,
        weight,
        expiresAt: expiresAtDate?.toISOString(),
        notes,
      },
    });

    if (weight > 0) {
      await this.pointsService.recordEvent({
        address: issuer,
        amount: weight,
        source: PrismaPointEventSource.PATROL,
        reference: transaction.transactionId,
        notes: `patrol:${marketRecord.slug}:${code}`,
        actor: signer,
      });
    }

    return result;
  }

  private async syncSchedulerTasksForMarket(
    market: PrismaMarketWithRelations,
    options: { createdBy?: string } = {}
  ): Promise<void> {
    const { createdBy } = options;
    const now = new Date();

    await this.prisma.schedulerTask.deleteMany({
      where: {
        marketId: market.id,
        status: PrismaSchedulerTaskStatus.PENDING,
        description: { startsWith: "Авто-" },
      },
    });

    const tasks: Array<{
      type: PrismaSchedulerTaskType;
      at?: Date | null;
      payload?: Prisma.InputJsonValue;
      description: string;
    }> = [
      {
        type: PrismaSchedulerTaskType.MARKET_OPEN,
        at: market.scheduledStartAt,
        description: "Авто-активация рынка",
      },
      {
        type: PrismaSchedulerTaskType.MARKET_LOCK,
        at: market.tradingLockAt,
        description: "Авто-блокировка торговли",
        payload: market.tradingLockAt
          ? { lockAt: market.tradingLockAt.toISOString() }
          : undefined,
      },
      {
        type: PrismaSchedulerTaskType.CUSTOM,
        at: market.freezeWindowStartAt,
        description: "Авто-фриз-старт",
      },
      {
        type: PrismaSchedulerTaskType.CUSTOM,
        at: market.freezeWindowEndAt,
        description: "Авто-фриз-окончание",
      },
      {
        type: PrismaSchedulerTaskType.MARKET_CLOSE,
        at: market.closeAt,
        description: "Авто-закрытие рынка",
      },
    ];

    for (const task of tasks) {
      if (!task.at) {
        continue;
      }
      if (task.at.getTime() <= now.getTime()) {
        continue;
      }

      await this.schedulerService.createTask(
        {
          type: task.type,
          scheduledFor: task.at,
          payload: task.payload ?? undefined,
          description: task.description,
          marketId: market.id,
        },
        createdBy
      );
    }
  }

  async clearPatrolSignal(
    marketId: string,
    payload: ClearPatrolSignalRequestDto
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const patrolAddress = normalizeFlowAddress(
      this.ensureNonEmptyString(payload.patrolAddress, "patrolAddress")
    );

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "Address", value: patrolAddress },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.clearPatrolSignalTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    try {
      await this.prisma.patrolSignal.delete({
        where: {
          marketId_issuer: {
            marketId: marketRecord.id,
            issuer: patrolAddress,
          },
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      ) {
        throw error;
      }
    }

    const updated = await this.getMarketRecord(parsedMarketId);

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.clearPatrolSignalTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.CLEAR_PATROL_SIGNAL,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        patrolAddress,
      },
    });

    return result;
  }

  async settleMarket(
    marketId: string,
    payload: SettleMarketRequestDto
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    const outcomeId = this.parsePositiveInteger(payload.outcomeId, "outcomeId");
    const resolvedOutcomeId = this.ensureNonEmptyString(
      payload.resolvedOutcomeId,
      "resolvedOutcomeId"
    );
    if (!marketRecord.outcomes.some((outcome) => outcome.id === resolvedOutcomeId)) {
      throw new BadRequestException(
        `Outcome ${resolvedOutcomeId} does not belong to market ${marketRecord.id}`
      );
    }

    const txHash = this.ensureNonEmptyString(payload.txHash, "txHash");
    const notes = this.sanitizeOptionalString(payload.notes);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "UInt64", value: outcomeId.toString() },
      { type: "String", value: txHash },
      this.buildOptionalStringArgument(notes),
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.settleMarketTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const now = new Date();
    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: {
        state: toPrismaState("settled"),
        settlement: {
          upsert: {
            create: {
              resolvedOutcomeId,
              txId: txHash,
              settledAt: now,
              notes: notes ?? undefined,
              overrideReason: undefined,
            },
            update: {
              resolvedOutcomeId,
              txId: txHash,
              settledAt: now,
              notes: notes ?? undefined,
              overrideReason: undefined,
            },
          },
        },
      },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.settleMarketTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.SETTLE,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        outcomeId,
        resolvedOutcomeId,
        txHash,
        notes,
      },
    });

    await this.markWorkflowActionExecuted(
      marketRecord.id,
      PrismaWorkflowActionType.SETTLE,
      {
        transactionId: transaction.transactionId,
        signer,
        network,
        extra: {
          outcomeId,
          resolvedOutcomeId,
          txHash,
          notes,
        },
      }
    );

    if (marketRecord.category === PrismaMarketCategory.SPORTS) {
      const eventId = this.extractEventIdFromTags(updated.tags ?? []);
      if (eventId) {
        const resolvedOutcome = updated.outcomes.find((o) => o.id === resolvedOutcomeId);
        const resolvedOutcomeIndex = resolvedOutcome
          ? updated.outcomes.indexOf(resolvedOutcome)
          : -1;
        
        if (resolvedOutcomeIndex >= 0) {
          try {
            await this.topShotRewardService.processSettlement({
              marketId: marketRecord.id,
              eventId,
              resolvedOutcomeId,
              outcomeIndex: resolvedOutcomeIndex,
            });
          } catch (error) {
            this.logger.error(
              `Top Shot reward processing failed for market ${marketRecord.id}: ${(error as Error).message}`
            );
          }
        }
      }
    }

    return result;
  }

  async overrideSettlement(
    marketId: string,
    payload: OverrideSettlementRequestDto
  ): Promise<MarketTransactionResult> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    if (!marketRecord.settlement) {
      throw new BadRequestException(
        `Market ${marketRecord.id} has no existing settlement to override`
      );
    }

    const outcomeId = this.parsePositiveInteger(payload.outcomeId, "outcomeId");
    const resolvedOutcomeId = this.ensureNonEmptyString(
      payload.resolvedOutcomeId,
      "resolvedOutcomeId"
    );
    if (!marketRecord.outcomes.some((outcome) => outcome.id === resolvedOutcomeId)) {
      throw new BadRequestException(
        `Outcome ${resolvedOutcomeId} does not belong to market ${marketRecord.id}`
      );
    }

    const txHash = this.ensureNonEmptyString(payload.txHash, "txHash");
    const reason = this.ensureNonEmptyString(payload.reason, "reason");
    const notes = this.sanitizeOptionalString(payload.notes);

    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: parsedMarketId.toString() },
      { type: "UInt64", value: outcomeId.toString() },
      { type: "String", value: txHash },
      this.buildOptionalStringArgument(notes),
      { type: "String", value: reason },
    ];

    const { signer, network } = this.resolveSignerAndNetwork(payload.signer, payload.network);

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.overrideSettlementTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const now = new Date();
    const updated = await this.prisma.market.update({
      where: { id: marketRecord.id },
      data: {
        state: toPrismaState("settled"),
        settlement: {
          upsert: {
            create: {
              resolvedOutcomeId,
              txId: txHash,
              settledAt: now,
              notes: notes ?? undefined,
              overrideReason: reason,
            },
            update: {
              resolvedOutcomeId,
              txId: txHash,
              settledAt: now,
              notes: notes ?? undefined,
              overrideReason: reason,
            },
          },
        },
      },
      include: includeMarketRelations,
    });

    const result: MarketTransactionResult = {
      market: toDomainMarket(updated),
      transactionPath: this.overrideSettlementTransactionPath,
      cadenceArguments,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.OVERRIDE_SETTLEMENT,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        cadenceArguments,
        outcomeId,
        resolvedOutcomeId,
        txHash,
        reason,
        notes,
      },
    });

    await this.markWorkflowActionExecuted(
      marketRecord.id,
      PrismaWorkflowActionType.SETTLE,
      {
        transactionId: transaction.transactionId,
        signer,
        network,
        extra: {
          outcomeId,
          resolvedOutcomeId,
          txHash,
          reason,
          notes,
          override: true,
        },
      }
    );

    return result;
  }

  async create(payload: CreateMarketDto): Promise<Market> {
    const signer = process.env.FLOW_TRANSACTION_SIGNER ?? "emulator-account";
    const network = process.env.FLOW_NETWORK ?? "emulator";

    const outcomeLabels = payload.outcomes.map((outcome) => outcome.label);
    if (outcomeLabels.length === 0) {
      throw new BadRequestException("Market must include at least one outcome");
    }

    const category = payload.category ?? "crypto";
    const tags = this.sanitizeTags(payload.tags);
    const oracleId = this.sanitizeOptionalString(payload.oracleId);
    const closeAtDate = this.parseIsoDate(payload.closeAt);
    const schedulePayload = payload.schedule ?? {};
    const scheduledStartAtDate = this.parseIsoDate(schedulePayload.scheduledStartAt);
    const tradingLockAtDate = this.parseIsoDate(schedulePayload.tradingLockAt);
    const freezeWindowStartAtDate = this.parseIsoDate(schedulePayload.freezeWindowStartAt);
    const freezeWindowEndAtDate = this.parseIsoDate(schedulePayload.freezeWindowEndAt);
    const patrolThresholdValue = this.parseNonNegativeNumber(
      payload.patrolThreshold,
      "patrolThreshold"
    );
    const zeroUFix64 = this.formatUFix64(0);
    const closeAtUFix64 = this.formatTimestamp(closeAtDate ?? null);
    const scheduledStartAtUFix64 = this.formatTimestamp(scheduledStartAtDate ?? null);
    const tradingLockAtUFix64 = this.formatTimestamp(tradingLockAtDate ?? null);
    const freezeWindowStartAtUFix64 = this.formatTimestamp(freezeWindowStartAtDate ?? null);
    const freezeWindowEndAtUFix64 = this.formatTimestamp(freezeWindowEndAtDate ?? null);
    const patrolThresholdUFix64 =
      patrolThresholdValue !== undefined ? this.formatUFix64(patrolThresholdValue) : undefined;
    const patrolSignalInputs = this.mapPatrolSignalPayload(payload.patrolSignals);

    const cadenceArguments: CadenceArgument[] = [
      { type: "String", value: payload.slug },
      { type: "String", value: payload.title },
      { type: "String", value: payload.description },
      { type: "String", value: category },
      { type: "String", value: oracleId ?? "" },
      { type: "Bool", value: typeof oracleId === "string" && oracleId.length > 0 },
      { type: "UFix64", value: closeAtUFix64 ?? zeroUFix64 },
      { type: "Bool", value: closeAtUFix64 !== undefined },
      { type: "UFix64", value: scheduledStartAtUFix64 ?? zeroUFix64 },
      { type: "Bool", value: scheduledStartAtUFix64 !== undefined },
      { type: "UFix64", value: tradingLockAtUFix64 ?? zeroUFix64 },
      { type: "Bool", value: tradingLockAtUFix64 !== undefined },
      { type: "UFix64", value: freezeWindowStartAtUFix64 ?? zeroUFix64 },
      { type: "Bool", value: freezeWindowStartAtUFix64 !== undefined },
      { type: "UFix64", value: freezeWindowEndAtUFix64 ?? zeroUFix64 },
      { type: "Bool", value: freezeWindowEndAtUFix64 !== undefined },
      { type: "UFix64", value: patrolThresholdUFix64 ?? zeroUFix64 },
      { type: "Bool", value: patrolThresholdUFix64 !== undefined },
      {
        type: "Array",
        value: tags.map((tag) => ({ type: "String", value: tag })),
      },
      {
        type: "Array",
        value: outcomeLabels.map((label) => ({ type: "String", value: label })),
      },
    ];

    const transaction = await this.flowTransactionService.send({
      transactionPath: this.createMarketTransactionPath,
      arguments: cadenceArguments,
      signer,
      network,
    });

    const marketId = await this.flowMarketService.getMarketIdBySlug(payload.slug);
    if (marketId === null) {
      throw new ServiceUnavailableException("Unable to resolve market id after creation");
    }

    const market = await this.prisma.market.create({
      data: {
        id: marketId.toString(),
        slug: payload.slug,
        title: payload.title,
        description: payload.description,
        state: toPrismaState(payload.state ?? "draft"),
        category: toPrismaCategory(category),
        tags,
        oracleId: oracleId ?? null,
        patrolThreshold:
          patrolThresholdValue !== undefined
            ? new Prisma.Decimal(patrolThresholdValue)
            : undefined,
        closeAt: closeAtDate ?? null,
        scheduledStartAt: scheduledStartAtDate ?? null,
        tradingLockAt: tradingLockAtDate ?? null,
        freezeWindowStartAt: freezeWindowStartAtDate ?? null,
        freezeWindowEndAt: freezeWindowEndAtDate ?? null,
        liquidityPool: {
          create: {
            tokenSymbol: payload.liquidityPool.tokenSymbol,
            totalLiquidity: new Prisma.Decimal(
              payload.liquidityPool.totalLiquidity
            ),
            feeBps: payload.liquidityPool.feeBps,
            providerCount: payload.liquidityPool.providerCount,
          },
        },
        outcomes: {
          create: payload.outcomes.map((outcome) => ({
            label: outcome.label,
            status: toPrismaOutcomeStatus(outcome.status ?? "active"),
            impliedProbability: new Prisma.Decimal(outcome.impliedProbability),
            liquidity: new Prisma.Decimal(outcome.liquidity),
            metadata: toInputJson(outcome.metadata),
          })),
        },
        workflow: payload.workflow
          ? {
              create: payload.workflow.map((action) => ({
                type: toPrismaWorkflowType(action.type),
                status: toPrismaWorkflowStatus(action.status ?? "pending"),
                description: action.description,
                triggersAt: action.triggersAt
                  ? new Date(action.triggersAt)
                  : null,
                metadata: toInputJson(action.metadata),
              })),
            }
          : undefined,
        settlement: createSettlementData(payload.settlement),
        patrolSignals:
          patrolSignalInputs.length > 0
            ? {
                create: patrolSignalInputs,
              }
            : undefined,
      },
      include: includeMarketRelations,
    });

    await this.recordTransactionLog({
      marketId: market.id,
      marketSlug: market.slug,
      type: PrismaFlowTransactionType.CREATE_MARKET,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        slug: payload.slug,
        category,
        tags,
        oracleId,
        closeAt: closeAtDate?.toISOString(),
        schedule: {
          scheduledStartAt: scheduledStartAtDate?.toISOString(),
          tradingLockAt: tradingLockAtDate?.toISOString(),
          freezeWindowStartAt: freezeWindowStartAtDate?.toISOString(),
          freezeWindowEndAt: freezeWindowEndAtDate?.toISOString(),
        },
        patrolThreshold: patrolThresholdValue,
        outcomeLabels,
        cadenceArguments,
      },
    });

    await this.syncSchedulerTasksForMarket(market, {
      createdBy: signer,
    });

    try {
      this.logger.log(`Auto-creating liquidity pool for market ${market.id} with ${payload.outcomes.length} outcomes`);
      
      await this.createPool(market.id, {
        outcomeCount: payload.outcomes.length,
        liquidityParameter: DEFAULT_LIQUIDITY_PARAMETER,
        seedAmount: DEFAULT_SEED_AMOUNT,
        signer,
        network,
      });

      this.logger.log(`Successfully created liquidity pool for market ${market.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to auto-create liquidity pool for market ${market.id}: ${(error as Error).message}`,
        (error as Error).stack
      );
    }

    return toDomainMarket(market);
  }

  async update(idOrSlug: string, payload: UpdateMarketDto): Promise<Market> {
    const existing = await this.prisma.market.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });

    if (!existing) {
      throw new NotFoundException(`Market ${idOrSlug} not found`);
    }

    const tags =
      payload.tags !== undefined ? this.sanitizeTags(payload.tags) : undefined;
    const category = payload.category;
    const hasOracleId = Object.prototype.hasOwnProperty.call(payload, "oracleId");
    const oracleId = hasOracleId ? this.sanitizeOptionalString(payload.oracleId) ?? null : undefined;
    const closeAtDate = this.parseIsoDate(payload.closeAt);
    const hasSchedule = payload.schedule !== undefined;
    const schedulePayload = payload.schedule ?? {};
    const scheduledStartAtDate = hasSchedule
      ? this.parseIsoDate(schedulePayload.scheduledStartAt)
      : undefined;
    const tradingLockAtDate = hasSchedule
      ? this.parseIsoDate(schedulePayload.tradingLockAt)
      : undefined;
    const freezeWindowStartAtDate = hasSchedule
      ? this.parseIsoDate(schedulePayload.freezeWindowStartAt)
      : undefined;
    const freezeWindowEndAtDate = hasSchedule
      ? this.parseIsoDate(schedulePayload.freezeWindowEndAt)
      : undefined;
    const patrolThresholdValue = this.parseNonNegativeNumber(
      payload.patrolThreshold,
      "patrolThreshold"
    );
    const patrolSignalInputs =
      payload.patrolSignals !== undefined
        ? this.mapPatrolSignalPayload(payload.patrolSignals)
        : undefined;

    const market = await this.prisma.market.update({
      where: { id: existing.id },
      data: {
        slug: payload.slug,
        title: payload.title,
        description: payload.description,
        state: toPrismaState(payload.state ?? "draft"),
        closeAt: closeAtDate ?? null,
        category: category ? toPrismaCategory(category) : undefined,
        tags,
        oracleId,
        patrolThreshold:
          patrolThresholdValue !== undefined
            ? new Prisma.Decimal(patrolThresholdValue)
            : undefined,
        scheduledStartAt: hasSchedule ? scheduledStartAtDate ?? null : undefined,
        tradingLockAt: hasSchedule ? tradingLockAtDate ?? null : undefined,
        freezeWindowStartAt: hasSchedule ? freezeWindowStartAtDate ?? null : undefined,
        freezeWindowEndAt: hasSchedule ? freezeWindowEndAtDate ?? null : undefined,
        liquidityPool: {
          upsert: {
            update: {
              tokenSymbol: payload.liquidityPool.tokenSymbol,
              totalLiquidity: new Prisma.Decimal(
                payload.liquidityPool.totalLiquidity
              ),
              feeBps: payload.liquidityPool.feeBps,
              providerCount: payload.liquidityPool.providerCount,
            },
            create: {
              tokenSymbol: payload.liquidityPool.tokenSymbol,
              totalLiquidity: new Prisma.Decimal(
                payload.liquidityPool.totalLiquidity
              ),
              feeBps: payload.liquidityPool.feeBps,
              providerCount: payload.liquidityPool.providerCount,
            },
          },
        },
        outcomes: {
          deleteMany: {},
          create: payload.outcomes.map((outcome) => ({
            label: outcome.label,
            status: toPrismaOutcomeStatus(outcome.status ?? "active"),
            impliedProbability: new Prisma.Decimal(outcome.impliedProbability),
            liquidity: new Prisma.Decimal(outcome.liquidity),
            metadata: toInputJson(outcome.metadata),
          })),
        },
        workflow: payload.workflow
          ? {
              deleteMany: {},
              create: payload.workflow.map((action) => ({
                type: toPrismaWorkflowType(action.type),
                status: toPrismaWorkflowStatus(action.status ?? "pending"),
                description: action.description,
                triggersAt: action.triggersAt ? new Date(action.triggersAt) : null,
                metadata: toInputJson(action.metadata),
              })),
            }
          : undefined,
        settlement: payload.settlement
          ? upsertSettlementData(payload.settlement)
          : {
              delete: true,
            },
        patrolSignals:
          payload.patrolSignals !== undefined
            ? {
                deleteMany: {},
                ...(patrolSignalInputs && patrolSignalInputs.length > 0
                  ? { create: patrolSignalInputs }
                  : {}),
              }
            : undefined,
      },
      include: includeMarketRelations,
    });

    if (hasSchedule || payload.closeAt !== undefined) {
      await this.syncSchedulerTasksForMarket(market);
    }

    return toDomainMarket(market);
  }

  async getTransactionLogs(
    marketId: string,
    limit = 50
  ): Promise<PrismaMarketTransactionLog[]> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : 50;

    return this.prisma.marketTransactionLog.findMany({
      where: { marketId: marketRecord.id },
      orderBy: { createdAt: "desc" },
      take: normalizedLimit,
    });
  }

  async getTrades(marketId: string, limit = 50): Promise<PrismaMarketTrade[]> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : 50;

    return this.prisma.marketTrade.findMany({
      where: { marketId: marketRecord.id },
      orderBy: { createdAt: "desc" },
      take: normalizedLimit,
    });
  }

  async getAnalytics(
    marketId: string,
    options: {
      interval?: string;
      outcomeIndex?: number;
      from?: string;
      to?: string;
      limit?: number;
    } = {}
  ): Promise<MarketAnalyticsSnapshotDto[]> {
    const marketRecord = await this.getMarketRecordByIdOrSlug(marketId);
    const interval = this.resolveAnalyticsInterval(options.interval);
    const normalizedOutcomeIndex =
      typeof options.outcomeIndex === "number" &&
      Number.isInteger(options.outcomeIndex) &&
      options.outcomeIndex >= 0
        ? options.outcomeIndex
        : undefined;
    const from = this.parseIsoDate(options.from);
    const to = this.parseIsoDate(options.to);
    const limit =
      typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : undefined;

    const snapshots = await this.analyticsService.getSnapshots({
      marketId: marketRecord.id,
      interval,
      outcomeIndex: normalizedOutcomeIndex,
      from,
      to,
      limit,
    });

    return snapshots.map(toMarketAnalyticsDto);
  }

  async quoteTrade(
    marketId: string,
    payload: QuoteTradeRequestDto
  ): Promise<QuoteTradeResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const request = this.normalizeTradeRequest(payload);
    const calculated = await this.calculateTradeQuote(parsedMarketId, request, {
      marketRecord,
    });

    const response: QuoteTradeResponseDto = {
      flowAmount: calculated.flowAmount,
      outcomeAmount: calculated.outcomeAmount,
      newBVector: calculated.newBVector,
      newTotalLiquidity: calculated.newTotalLiquidity,
      newOutcomeSupply: calculated.newOutcomeSupply,
      probabilities: calculated.probabilities,
      cadenceArguments: calculated.cadenceArguments,
      transactionPath: this.tradeTransactionPath,
    };

    if (request.isBuy && payload.signer) {
      try {
        const userAddress = normalizeFlowAddress(payload.signer);
        const currentPosition = await this.getUserCurrentPosition(marketRecord.id, userAddress);
        const proposedAmount = Number(calculated.flowAmount);
        const newPosition = currentPosition + proposedAmount;

        response.userPositionInfo = {
          currentPosition: Math.round(currentPosition * 100) / 100,
          maxPosition: MAX_USER_POSITION_PER_MARKET,
          remainingCapacity: Math.round((MAX_USER_POSITION_PER_MARKET - currentPosition) * 100) / 100,
          wouldExceedLimit: newPosition > MAX_USER_POSITION_PER_MARKET,
        };
      } catch (error) {
        this.logger.warn(`Failed to calculate position info: ${(error as Error).message}`);
      }
    }

    return response;
  }

  async executeTrade(
    marketId: string,
    payload: ExecuteTradeRequestDto
  ): Promise<ExecuteTradeResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const market = await this.getMarketRecord(parsedMarketId);
    const request = this.normalizeTradeRequest(payload);
    const targetOutcome = market.outcomes[request.outcomeIndex];
    if (!targetOutcome) {
      throw new BadRequestException(
        `Outcome index ${request.outcomeIndex} is out of bounds for market ${market.id}`
      );
    }
    const calculated = await this.calculateTradeQuote(parsedMarketId, request, {
      marketRecord: market,
    });

    if (
      typeof payload.maxFlowAmount === "number" &&
      calculated.quote.flowAmount > payload.maxFlowAmount
    ) {
      throw new BadRequestException("Flow amount exceeds maxFlowAmount tolerance");
    }

    if (request.isBuy && payload.signer) {
      const userAddress = normalizeFlowAddress(payload.signer);
      const currentPosition = await this.getUserCurrentPosition(market.id, userAddress);
      const newPosition = currentPosition + calculated.quote.flowAmount;
      
      if (newPosition > MAX_USER_POSITION_PER_MARKET) {
        throw new BadRequestException(
          `Position limit exceeded. Your current position: ${currentPosition.toFixed(2)} FLOW. ` +
          `Maximum allowed: ${MAX_USER_POSITION_PER_MARKET} FLOW. ` +
          `This trade would result in: ${newPosition.toFixed(2)} FLOW.`
        );
      }
    }

    const userSigner = payload.signer;
    const signer = userSigner ?? process.env.FLOW_TRANSACTION_SIGNER ?? "emulator-account";
    const network = payload.network ?? process.env.FLOW_NETWORK ?? "emulator";

    const topShotSelection = Object.prototype.hasOwnProperty.call(payload, "topShotSelection")
      ? payload.topShotSelection ?? null
      : undefined;

    let lockedMomentId: string | null = null;
    let topShotAddress: string | null = null;

    if (topShotSelection !== undefined) {
      if (!userSigner) {
        throw new BadRequestException("Signer address is required for Top Shot selections");
      }
      topShotAddress = normalizeFlowAddress(userSigner, "signer");

      if (market.category !== PrismaMarketCategory.SPORTS) {
        throw new BadRequestException("Top Shot bonuses are available only for sports markets");
      }

      if (!request.isBuy && topShotSelection !== null) {
        throw new BadRequestException("Top Shot bonus requires a buy trade on the selected outcome");
      }

      if (topShotSelection === null) {
        await this.topShotLockService.releaseLock(market.id, topShotAddress, PrismaMomentLockStatus.CANCELLED);
      } else if (topShotSelection.momentId) {
        if (!this.topShotService.isEnabled()) {
          throw new BadRequestException("Top Shot integration is currently disabled");
        }
        const lock = await this.topShotLockService.lockMoment({
          marketId: market.id,
          userAddress: topShotAddress,
          momentId: topShotSelection.momentId,
          estimatedReward: topShotSelection.estimatedReward,
        });
        lockedMomentId = lock.momentId;
      }
    }

    let transaction;
    try {
      transaction = await this.flowTransactionService.send({
        transactionPath: this.tradeTransactionPath,
        arguments: calculated.cadenceArguments,
        signer,
        network,
      });
    } catch (error) {
      if (lockedMomentId && topShotAddress) {
        await this.topShotLockService.releaseLock(market.id, topShotAddress, PrismaMomentLockStatus.CANCELLED);
      }
      throw error;
    }

    const updatedState = await this.poolStateService.applyQuote(
      parsedMarketId,
      market.id,
      calculated.state,
      calculated.quote
    );

    const response: ExecuteTradeResponseDto = {
      flowAmount: calculated.flowAmount,
      outcomeAmount: calculated.outcomeAmount,
      newBVector: calculated.newBVector,
      newTotalLiquidity: calculated.newTotalLiquidity,
      newOutcomeSupply: calculated.newOutcomeSupply,
      probabilities: calculated.probabilities,
      cadenceArguments: calculated.cadenceArguments,
      transactionPath: this.tradeTransactionPath,
      transactionId: transaction.transactionId,
      signer,
      network,
    };

    await this.recordTransactionLog({
      marketId: market.id,
      marketSlug: market.slug,
      type: PrismaFlowTransactionType.EXECUTE_TRADE,
      transactionId: transaction.transactionId,
      signer,
      network,
      payload: {
        request,
        quote: calculated.quote,
        maxFlowAmount: payload.maxFlowAmount,
      },
    });

    await this.recordTrade({
      marketId: market.id,
      marketSlug: market.slug,
      outcomeId: targetOutcome.id,
      outcomeLabel: targetOutcome.label,
      outcomeIndex: request.outcomeIndex,
      shares: request.shares,
      flowAmount: calculated.quote.flowAmount,
      isBuy: request.isBuy,
      probabilities: calculated.quote.probabilities,
      maxFlowAmount: payload.maxFlowAmount ?? null,
      transactionId: transaction.transactionId,
      signer,
      network,
    });

    const pointsAward = Math.abs(calculated.quote.flowAmount);
    if (pointsAward > 0) {
      await this.pointsService.recordEvent({
        address: signer,
        amount: pointsAward,
        source: PrismaPointEventSource.TRADE,
        reference: transaction.transactionId,
        notes: `market:${market.slug}:outcome:${targetOutcome.label}`,
        actor: signer,
      });
    }

    await this.broadcastPoolState(parsedMarketId, { state: updatedState });

    return response;
  }

  async claimRewards(
    marketId: string,
    payload: ClaimRewardsRequestDto
  ): Promise<ClaimRewardsResponseDto> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);

    if (marketRecord.state !== PrismaMarketState.SETTLED) {
      throw new BadRequestException("Рынок должен быть в состоянии SETTLED для получения выплат");
    }

    if (!marketRecord.settlement) {
      throw new BadRequestException("У рынка отсутствуют данные урегулирования");
    }

    const targetOutcome = marketRecord.outcomes[payload.outcomeIndex];
    if (!targetOutcome) {
      throw new BadRequestException(
        `Outcome index ${payload.outcomeIndex} недоступен для рынка ${marketRecord.id}`
      );
    }

    if (targetOutcome.id !== marketRecord.settlement.resolvedOutcomeId) {
      throw new BadRequestException("Выбранный исход не является победителем урегулирования");
    }

    if (payload.shares <= 0) {
      throw new BadRequestException("Количество долей для claim должно быть положительным");
    }

    const tradeRequest: ExecuteTradeRequestDto = {
      outcomeIndex: payload.outcomeIndex,
      shares: payload.shares,
      isBuy: false,
      signer: payload.signer,
      network: payload.network,
      maxFlowAmount: payload.maxFlowAmount,
    };

    const tradeResult = await this.executeTrade(marketId, tradeRequest);

    await this.recordTransactionLog({
      marketId: marketRecord.id,
      marketSlug: marketRecord.slug,
      type: PrismaFlowTransactionType.CLAIM_REWARDS,
      transactionId: tradeResult.transactionId,
      signer: tradeResult.signer,
      network: tradeResult.network,
      payload: {
        outcomeIndex: payload.outcomeIndex,
        shares: payload.shares,
        claimAmount: tradeResult.flowAmount,
      },
    });

    const claimPoints = Math.abs(Number(tradeResult.flowAmount));
    if (claimPoints > 0) {
      await this.pointsService.recordEvent({
        address: tradeResult.signer,
        amount: claimPoints,
        source: PrismaPointEventSource.CLAIM,
        reference: tradeResult.transactionId,
        notes: `claim:${marketRecord.slug}`,
        actor: tradeResult.signer,
      });
    }

    return {
      ...tradeResult,
      claimAmount: tradeResult.flowAmount,
      claimedShares: tradeResult.outcomeAmount,
    } satisfies ClaimRewardsResponseDto;
  }

  async listTopShotOptions(
    marketId: string,
    userAddress: string,
    outcomeIndex: number
  ): Promise<TopShotProjectedBonus[]> {
    if (!this.topShotService.isEnabled()) {
      return [];
    }

    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    if (marketRecord.category !== PrismaMarketCategory.SPORTS) {
      return [];
    }

    const outcome = marketRecord.outcomes[outcomeIndex];
    if (!outcome) {
      throw new BadRequestException("Outcome index is out of bounds");
    }

    const outcomeType = this.extractOutcomeType(outcome.metadata);
    if (outcomeType !== "home" && outcomeType !== "away") {
      return [];
    }

    const eventId = this.extractEventIdFromTags(marketRecord.tags ?? []);
    if (!eventId) {
      return [];
    }

    const normalizedAddress = normalizeFlowAddress(userAddress, "address");
    const moments = await this.topShotService.getOwnerMoments(normalizedAddress, { limit: 200 });

    const projected = moments.map((moment) =>
      this.topShotLockService.buildProjectedBonus(moment, {
        marketId: marketRecord.id,
        eventId,
      })
    );

    return projected.sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
  }

  async getTopShotLock(marketId: string, userAddress: string): Promise<TopShotMomentLockDto | null> {
    const parsedMarketId = this.parseMarketId(marketId);
    const marketRecord = await this.getMarketRecord(parsedMarketId);
    const normalizedAddress = normalizeFlowAddress(userAddress, "address");
    return this.topShotLockService.getActiveLock(marketRecord.id, normalizedAddress);
  }

  private async calculateTradeQuote(
    marketId: number,
    request: QuoteTradeRequestDto,
    options: { marketRecord?: PrismaMarketWithRelations } = {}
  ): Promise<CalculatedTradeQuote> {
    const marketRecord =
      options.marketRecord ?? (await this.getMarketRecord(marketId));
    const state = await this.poolStateService.getState(marketId, marketRecord.id);
    const quote = this.lmsrService.quoteTrade(state, request);
    const formatted = this.formatTradeResult(marketId, request, quote);

    return {
      quote,
      probabilities: quote.probabilities,
      state,
      ...formatted,
    };
  }

  private formatTradeResult(
    marketId: number,
    request: QuoteTradeRequestDto,
    quote: LmsrTradeQuote
  ): FormattedTradeQuote {
    const flowAmount = this.formatUFix64(quote.flowAmount);
    const outcomeAmount = this.formatUFix64(quote.outcomeAmount);
    const newBVector = quote.newBVector.map((value) => this.formatUFix64(value));
    const newTotalLiquidity = this.formatUFix64(quote.newTotalLiquidity);
    const newOutcomeSupply = quote.newOutcomeSupply.map((value) => this.formatUFix64(value));
    const cadenceArguments: CadenceArgument[] = [
      { type: "UInt64", value: marketId.toString() },
      { type: "Int", value: request.outcomeIndex.toString() },
      { type: "UFix64", value: flowAmount },
      { type: "UFix64", value: outcomeAmount },
      {
        type: "Array",
        value: newBVector.map((value) => ({ type: "UFix64", value })),
      },
      { type: "UFix64", value: newTotalLiquidity },
      {
        type: "Array",
        value: newOutcomeSupply.map((value) => ({ type: "UFix64", value })),
      },
      { type: "Bool", value: request.isBuy },
    ];

    return {
      flowAmount,
      outcomeAmount,
      newBVector,
      newTotalLiquidity,
      newOutcomeSupply,
      cadenceArguments,
    };
  }

  private parseMarketId(value: string): number {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(value)) {
      throw new BadRequestException(
        "Market id must be a numeric on-chain ID, not a UUID. Use findOne(slug) to get the numeric ID first."
      );
    }
    
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException("Market id must be a positive number");
    }
    return parsed;
  }

  private parseOutcomeCount(value: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException("Outcome count must be a positive integer");
    }
    return parsed;
  }

  private parsePositiveInteger(value: number, field: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return parsed;
  }

  private parsePositiveNumber(value: number, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    return parsed;
  }

  private normalizeTradeRequest(payload: QuoteTradeRequestDto): QuoteTradeRequestDto {
    const outcomeIndex = Number(payload.outcomeIndex);
    const shares = Number(payload.shares);
    const isBuy = Boolean(payload.isBuy);

    if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0) {
      throw new BadRequestException("Outcome index must be a non-negative integer");
    }

    if (!Number.isFinite(shares) || shares <= 0) {
      throw new BadRequestException("Shares must be a positive number");
    }

    return { outcomeIndex, shares, isBuy };
  }

  private formatUFix64(value: number): string {
    return value.toFixed(8);
  }

  private extractEventIdFromTags(tags: string[]): string | null {
    for (const tag of tags) {
      if (tag.startsWith("event:")) {
        const [, eventId] = tag.split(":");
        if (eventId) {
          return eventId;
        }
      }
    }
    return null;
  }

  private extractOutcomeType(metadata: Prisma.JsonValue): "home" | "away" | "draw" | "cancel" | "unknown" {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return "unknown";
    }
    const record = metadata as Record<string, unknown>;
    const value = typeof record.type === "string" ? record.type.toLowerCase() : "unknown";
    if (value === "home" || value === "away" || value === "draw" || value === "cancel") {
      return value;
    }
    return "unknown";
  }

  private formatTimestamp(value?: Date | null): string | undefined {
    if (!value) {
      return undefined;
    }
    return this.formatUFix64(value.getTime() / 1000);
  }

  private parseNumberArray(values: number[], field: string): number[] {
    if (!Array.isArray(values) || values.length === 0) {
      throw new BadRequestException(`${field} must be a non-empty array`);
    }

    return values.map((entry, index) => {
      const parsed = Number(entry);
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(`${field}[${index}] must be a finite number`);
      }
      return parsed;
    });
  }

  private resolveAnalyticsInterval(value?: string): PrismaMarketAnalyticsInterval {
    if (typeof value === "string") {
      const normalized = value.trim().toUpperCase();
      if (normalized === "DAY") {
        return PrismaMarketAnalyticsInterval.DAY;
      }
      if (normalized === "HOUR") {
        return PrismaMarketAnalyticsInterval.HOUR;
      }
    }

    return PrismaMarketAnalyticsInterval.HOUR;
  }

  private parseIsoDate(value?: string): Date | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private parseScheduleTimestamp(value: string | undefined, field: string): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    const parsed = this.parseIsoDate(value);
    if (!parsed) {
      throw new BadRequestException(`${field} must be a valid ISO timestamp`);
    }

    return parsed;
  }

  private parseNonNegativeNumber(value: number | undefined, field: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }

    return parsed;
  }

  private sanitizeTags(tags?: string[]): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    return tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter((tag) => tag.length > 0);
  }

  private mapPatrolSignalPayload(
    signals?
      : Array<{
          issuer: string;
          severity: PatrolSignalSeverity;
          code: string;
          weight: number;
          notes?: string;
          expiresAt?: string;
        }>
  ): Prisma.PatrolSignalCreateWithoutMarketInput[] {
    if (!Array.isArray(signals)) {
      return [];
    }

    return signals.map((signal, index) => {
      const issuer = normalizeFlowAddress(
        this.ensureNonEmptyString(signal.issuer, `patrolSignals[${index}].issuer`)
      );
      const severity = toPrismaPatrolSeverity(signal.severity ?? "info");
      const code = this.ensureNonEmptyString(signal.code, `patrolSignals[${index}].code`);
      const weight = this.parsePositiveNumber(signal.weight, `patrolSignals[${index}].weight`);
      const notes = this.sanitizeOptionalString(signal.notes);
      const expiresAt = this.parseIsoDate(signal.expiresAt);

      return {
        issuer,
        severity,
        code,
        weight: new Prisma.Decimal(weight),
        notes: notes ?? undefined,
        expiresAt: expiresAt ?? null,
      };
    });
  }

  private async recordTransactionLog(options: {
    marketId: string;
    marketSlug: string;
    type: PrismaFlowTransactionType;
    transactionId: string;
    signer: string;
    network: string;
    payload?: Record<string, unknown>;
    status?: PrismaFlowTransactionStatus;
  }): Promise<void> {
    try {
      const created = await this.prisma.marketTransactionLog.create({
        data: {
          marketId: options.marketId,
          transactionId: options.transactionId,
          type: options.type,
          status: options.status ?? PrismaFlowTransactionStatus.SUCCESS,
          signer: options.signer,
          network: options.network,
          payload: toInputJson(options.payload),
        },
      });

      this.updatesGateway.emitTransactionLog({
        id: created.id,
        marketId: created.marketId,
        slug: options.marketSlug,
        type: created.type,
        status: created.status,
        transactionId: created.transactionId,
        signer: created.signer,
        network: created.network,
        payload: toJsonRecord(created.payload) ?? null,
        createdAt: created.createdAt.toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(
        `Failed to record transaction log for market ${options.marketId}: ${message}`
      );
    }
  }

  private async recordTrade(options: {
    marketId: string;
    marketSlug: string;
    outcomeId: string | null;
    outcomeLabel: string;
    outcomeIndex: number;
    shares: number;
    flowAmount: number;
    isBuy: boolean;
    probabilities: number[];
    maxFlowAmount?: number | null;
    transactionId: string;
    signer: string;
    network: string;
  }): Promise<void> {
    try {
      const created = await this.prisma.marketTrade.create({
        data: {
          marketId: options.marketId,
          outcomeId: options.outcomeId,
          outcomeLabel: options.outcomeLabel,
          outcomeIndex: options.outcomeIndex,
          shares: new Prisma.Decimal(options.shares),
          flowAmount: new Prisma.Decimal(options.flowAmount),
          isBuy: options.isBuy,
          probabilities: options.probabilities,
          maxFlowAmount:
            options.maxFlowAmount !== null && options.maxFlowAmount !== undefined
              ? new Prisma.Decimal(options.maxFlowAmount)
              : undefined,
          transactionId: options.transactionId,
          signer: options.signer,
          network: options.network,
        },
      });

      const probability =
        Array.isArray(options.probabilities) &&
        options.probabilities.length > options.outcomeIndex
          ? Number(options.probabilities[options.outcomeIndex])
          : null;

      if (probability !== null && Number.isFinite(probability)) {
        try {
          await this.analyticsService.recordTrade({
            tradeId: created.id,
            marketId: created.marketId,
            marketSlug: options.marketSlug,
            outcomeId: created.outcomeId ?? null,
            outcomeIndex: created.outcomeIndex,
            outcomeLabel: created.outcomeLabel,
            probability,
            shares: Number(created.shares),
            flowAmount: Number(created.flowAmount),
            isBuy: created.isBuy,
            occurredAt: created.createdAt,
          });
        } catch (analyticsError) {
          const message =
            analyticsError instanceof Error
              ? `${analyticsError.message}\n${analyticsError.stack ?? ""}`
              : String(analyticsError);
          this.logger.error(
            `Failed to update analytics for market ${options.marketId}: ${message}`
          );
        }
      }

      this.updatesGateway.emitTrade({
        id: created.id,
        marketId: created.marketId,
        slug: options.marketSlug,
        outcomeId: created.outcomeId,
        outcomeLabel: created.outcomeLabel,
        outcomeIndex: created.outcomeIndex,
        shares: created.shares.toString(),
        flowAmount: created.flowAmount.toString(),
        isBuy: created.isBuy,
        probabilities: Array.isArray(created.probabilities)
          ? (created.probabilities as number[])
          : [],
        maxFlowAmount: created.maxFlowAmount
          ? created.maxFlowAmount.toString()
          : undefined,
        transactionId: created.transactionId,
        signer: created.signer,
        network: created.network,
        createdAt: created.createdAt.toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(
        `Failed to record trade for market ${options.marketId}: ${message}`
      );
    }
  }

  private async markWorkflowActionExecuted(
    marketId: string,
    type: PrismaWorkflowActionType,
    context: {
      transactionId: string;
      signer: string;
      network: string;
      extra?: Record<string, unknown>;
      status?: PrismaWorkflowActionStatus;
    }
  ): Promise<void> {
    try {
      const actions = await this.prisma.workflowAction.findMany({
        where: {
          marketId,
          type,
          status: {
            in: [PrismaWorkflowActionStatus.PENDING, PrismaWorkflowActionStatus.SCHEDULED],
          },
        },
      });

      if (actions.length === 0) {
        return;
      }

      const executedAt = new Date().toISOString();
      await Promise.all(
        actions.map((action) => {
          const existingMetadata = toJsonRecord(action.metadata) ?? {};
          const updatedMetadata = {
            ...existingMetadata,
            executedAt,
            transactionId: context.transactionId,
            signer: context.signer,
            network: context.network,
            ...context.extra,
          } satisfies Record<string, unknown>;

          return this.prisma.workflowAction.update({
            where: { id: action.id },
            data: {
              status: context.status ?? PrismaWorkflowActionStatus.EXECUTED,
              metadata: toInputJson(updatedMetadata),
            },
          });
        })
      );
    } catch (error) {
      const message =
        error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(
        `Failed to update workflow action ${type} for market ${marketId}: ${message}`
      );
    }
  }

  private async getMarketRecord(id: number): Promise<PrismaMarketWithRelations> {
    const market = await this.prisma.market.findUnique({
      where: { id: id.toString() },
      include: includeMarketRelations,
    });

    if (!market) {
      throw new NotFoundException(`Market ${id} not found`);
    }

    return market;
  }

  private async getMarketRecordByIdOrSlug(idOrSlug: string): Promise<PrismaMarketWithRelations> {
    const market = await this.prisma.market.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: includeMarketRelations,
    });

    if (!market) {
      throw new NotFoundException(`Market ${idOrSlug} not found`);
    }

    return market;
  }

  private getNumericMarketId(market: PrismaMarketWithRelations): number {
    if (market.poolState?.flowMarketId) {
      return market.poolState.flowMarketId;
    }
    throw new BadRequestException(
      `Market ${market.slug} does not have a pool state with on-chain ID. Create liquidity pool first.`
    );
  }

  private resolveSignerAndNetwork(
    signer?: string,
    network?: string
  ): { signer: string; network: string } {
    const resolvedNetwork = network ?? process.env.FLOW_NETWORK ?? "emulator";
    const resolvedSigner =
      signer ?? process.env.FLOW_TRANSACTION_SIGNER ?? (resolvedNetwork === "emulator" ? "emulator-account" : undefined);

    if (!resolvedSigner) {
      throw new BadRequestException(
        "FLOW_TRANSACTION_SIGNER must be configured for non-emulator networks"
      );
    }

    return {
      signer: resolvedSigner,
      network: resolvedNetwork,
    };
  }

  private buildOptionalStringArgument(value?: string): CadenceArgument {
    return {
      type: "Optional",
      value: value ? { type: "String", value } : null,
    };
  }

  private sanitizeOptionalString(value?: string): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private ensureNonEmptyString(value: string | undefined, field: string): string {
    if (typeof value !== "string") {
      throw new BadRequestException(`${field} is required`);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }

    return trimmed;
  }

  private async getUserCurrentPosition(marketId: string, userAddress: string): Promise<number> {
    const trades = await this.prisma.marketTrade.findMany({
      where: {
        marketId,
        signer: userAddress.toLowerCase(),
      },
      select: {
        flowAmount: true,
        isBuy: true,
      },
    });

    let totalBuy = 0;
    let totalSell = 0;

    for (const trade of trades) {
      const amount = Number(trade.flowAmount);
      if (trade.isBuy) {
        totalBuy += amount;
      } else {
        totalSell += amount;
      }
    }

    return totalBuy - totalSell;
  }

  private async broadcastPoolState(
    marketId: number,
    options: { state?: LmsrState; refreshFromFlow?: boolean } = {}
  ): Promise<void> {
    try {
      const market = await this.getMarketRecord(marketId);
      let state: LmsrState;
      if (options.state) {
        state = options.state;
      } else if (options.refreshFromFlow) {
        state = await this.poolStateService.refreshFromFlow(marketId, market.id);
      } else {
        state = await this.poolStateService.getState(marketId, market.id);
      }

      const payload: MarketPoolStateDto = {
        liquidityParameter: state.liquidityParameter,
        totalLiquidity: state.totalLiquidity,
        bVector: state.bVector,
        outcomeSupply: state.outcomeSupply,
      };

      this.updatesGateway.emitPoolStateUpdate({
        marketId: market.id,
        slug: market.slug,
        state: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(`Failed to broadcast pool state for market ${marketId}: ${message}`);
    }
  }
}
