import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { MarketsService } from "./markets.service";
import { MarketDto, MarketSummaryDto, toMarketDto, toMarketSummaryDto } from "./dto/market.dto";
import { CreateMarketDto, UpdateMarketDto } from "./dto/create-market.dto";
import { QuoteTradeRequestDto, QuoteTradeResponseDto } from "./dto/quote-trade.dto";
import { ExecuteTradeRequestDto, ExecuteTradeResponseDto } from "./dto/execute-trade.dto";
import { ClaimRewardsRequestDto, ClaimRewardsResponseDto } from "./dto/claim-rewards.dto";
import { MarketPoolStateDto } from "./dto/market-pool-state.dto";
import { MarketBalanceDto } from "./dto/market-balance.dto";
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
  MarketActionResponseDto,
  OverrideSettlementRequestDto,
  RecordPatrolSignalRequestDto,
  SettleMarketRequestDto,
  SuspendMarketRequestDto,
  UpdateMarketScheduleRequestDto,
  UpdatePatrolThresholdRequestDto,
  VoidMarketRequestDto,
} from "./dto/market-action.dto";
import { MarketTradeDto, toMarketTradeDto } from "./dto/market-trade.dto";
import {
  MarketTransactionDto,
  toMarketTransactionDto,
} from "./dto/market-transaction.dto";
import { MarketAnalyticsSnapshotDto } from "./dto/market-analytics.dto";
import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";

type MarketTransactionResult = Awaited<ReturnType<MarketsService["activateMarket"]>>;

@Controller("markets")
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  async getMarkets(): Promise<MarketSummaryDto[]> {
    const markets = await this.marketsService.findAll();
    return markets.map(toMarketSummaryDto);
  }

  @Get(":id")
  async getMarket(@Param("id") id: string): Promise<MarketDto> {
    const market = await this.marketsService.findOne(id);
    return toMarketDto(market);
  }

  @Get(":id/pool")
  async getPoolState(@Param("id") id: string): Promise<MarketPoolStateDto> {
    return this.marketsService.getPoolState(id);
  }

  @Get(":id/storage")
  async getMarketStorage(@Param("id") id: string): Promise<MarketStorageMetadataDto> {
    return this.marketsService.getMarketStorage(id);
  }

  @Get(":id/balances/:address")
  async getAccountBalances(
    @Param("id") id: string,
    @Param("address") address: string
  ): Promise<MarketBalanceDto> {
    return this.marketsService.getAccountBalances(id, address);
  }

  @Get(":id/trades")
  async getTrades(
    @Param("id") id: string,
    @Query("limit") limit?: string
  ): Promise<MarketTradeDto[]> {
    const parsedLimit = limit ? Number(limit) : undefined;
    const normalizedLimit =
      parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : undefined;
    const trades = await this.marketsService.getTrades(id, normalizedLimit);
    return trades.map(toMarketTradeDto);
  }

  @Get(":id/transactions")
  async getTransactions(
    @Param("id") id: string,
    @Query("limit") limit?: string
  ): Promise<MarketTransactionDto[]> {
    const parsedLimit = limit ? Number(limit) : undefined;
    const normalizedLimit =
      parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : undefined;
    const logs = await this.marketsService.getTransactionLogs(id, normalizedLimit);
    return logs.map(toMarketTransactionDto);
  }

  @Get(":id/analytics")
  async getAnalytics(
    @Param("id") id: string,
    @Query("interval") interval?: string,
    @Query("outcomeIndex") outcomeIndex?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string
  ): Promise<MarketAnalyticsSnapshotDto[]> {
    const parsedOutcomeIndex =
      typeof outcomeIndex === "string" ? Number(outcomeIndex) : undefined;
    const normalizedOutcomeIndex =
      parsedOutcomeIndex !== undefined &&
      Number.isInteger(parsedOutcomeIndex) &&
      parsedOutcomeIndex >= 0
        ? parsedOutcomeIndex
        : undefined;
    const parsedLimit = typeof limit === "string" ? Number(limit) : undefined;
    const normalizedLimit =
      parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : undefined;

    return this.marketsService.getAnalytics(id, {
      interval,
      outcomeIndex: normalizedOutcomeIndex,
      from,
      to,
      limit: normalizedLimit,
    });
  }

  @Get(":id/topshot/options")
  async getTopShotOptions(
    @Param("id") id: string,
    @Query("address") address?: string,
    @Query("outcomeIndex") outcomeIndex?: string
  ) {
    if (!address) {
      throw new BadRequestException("address query parameter is required");
    }
    const parsedOutcomeIndex = outcomeIndex !== undefined ? Number(outcomeIndex) : 0;
    if (!Number.isInteger(parsedOutcomeIndex) || parsedOutcomeIndex < 0) {
      throw new BadRequestException("outcomeIndex must be a non-negative integer");
    }

    return this.marketsService.listTopShotOptions(id, address, parsedOutcomeIndex);
  }

  @Get(":id/topshot/lock")
  async getTopShotLock(
    @Param("id") id: string,
    @Query("address") address?: string
  ) {
    if (!address) {
      throw new BadRequestException("address query parameter is required");
    }

    return this.marketsService.getTopShotLock(id, address);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/pool")
  async createPool(
    @Param("id") id: string,
    @Body() payload: CreateMarketPoolRequestDto
  ): Promise<CreateMarketPoolResponseDto> {
    return this.marketsService.createPool(id, payload);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/outcomes/mint")
  async mintOutcome(
    @Param("id") id: string,
    @Body() payload: MintOutcomeRequestDto
  ): Promise<MintOutcomeResponseDto> {
    return this.marketsService.mintOutcome(id, payload);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/outcomes/burn")
  async burnOutcome(
    @Param("id") id: string,
    @Body() payload: BurnOutcomeRequestDto
  ): Promise<BurnOutcomeResponseDto> {
    return this.marketsService.burnOutcome(id, payload);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/pool/sync")
  async syncPoolState(
    @Param("id") id: string,
    @Body() payload: SyncPoolStateRequestDto
  ): Promise<SyncPoolStateResponseDto> {
    return this.marketsService.syncPoolState(id, payload);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Post(":id/activate")
  async activateMarket(
    @Param("id") id: string,
    @Body() payload: ActivateMarketRequestDto = {}
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.activateMarket(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Post(":id/suspend")
  async suspendMarket(
    @Param("id") id: string,
    @Body() payload: SuspendMarketRequestDto = {}
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.suspendMarket(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/close")
  async closeMarket(
    @Param("id") id: string,
    @Body() payload: CloseMarketRequestDto = {}
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.closeMarket(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Post(":id/void")
  async voidMarket(
    @Param("id") id: string,
    @Body() payload: VoidMarketRequestDto = {}
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.voidMarket(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/schedule")
  async updateMarketSchedule(
    @Param("id") id: string,
    @Body() payload: UpdateMarketScheduleRequestDto = {}
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.updateMarketSchedule(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/patrol/threshold")
  async updatePatrolThreshold(
    @Param("id") id: string,
    @Body() payload: UpdatePatrolThresholdRequestDto
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.updatePatrolThreshold(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("PATROL")
  @Post(":id/patrol/signals")
  async recordPatrolSignal(
    @Param("id") id: string,
    @Body() payload: RecordPatrolSignalRequestDto
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.recordPatrolSignal(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("PATROL", "OPERATOR", "ADMIN")
  @Post(":id/patrol/signals/clear")
  async clearPatrolSignal(
    @Param("id") id: string,
    @Body() payload: ClearPatrolSignalRequestDto
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.clearPatrolSignal(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Post(":id/settle")
  async settleMarket(
    @Param("id") id: string,
    @Body() payload: SettleMarketRequestDto
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.settleMarket(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Post(":id/settlement/override")
  async overrideSettlement(
    @Param("id") id: string,
    @Body() payload: OverrideSettlementRequestDto
  ): Promise<MarketActionResponseDto> {
    const result = await this.marketsService.overrideSettlement(id, payload);
    return this.mapMarketTransactionResult(result);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Post()
  async createMarket(@Body() payload: CreateMarketDto): Promise<MarketDto> {
    const market = await this.marketsService.create(payload);
    return toMarketDto(market);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ADMIN")
  @Patch(":id")
  async updateMarket(
    @Param("id") id: string,
    @Body() payload: UpdateMarketDto
  ): Promise<MarketDto> {
    const market = await this.marketsService.update(id, payload);
    return toMarketDto(market);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/trade/quote")
  async quoteTrade(
    @Param("id") id: string,
    @Body() payload: QuoteTradeRequestDto
  ): Promise<QuoteTradeResponseDto> {
    return this.marketsService.quoteTrade(id, payload);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("OPERATOR", "ADMIN")
  @Post(":id/trade/execute")
  async executeTrade(
    @Param("id") id: string,
    @Body() payload: ExecuteTradeRequestDto
  ): Promise<ExecuteTradeResponseDto> {
    return this.marketsService.executeTrade(id, payload);
  }

  @UseGuards(FlowOrApiGuard)
  @Post(":id/claim")
  async claimRewards(
    @Param("id") id: string,
    @Body() payload: ClaimRewardsRequestDto
  ): Promise<ClaimRewardsResponseDto> {
    return this.marketsService.claimRewards(id, payload);
  }

  private mapMarketTransactionResult(
    result: MarketTransactionResult
  ): MarketActionResponseDto {
    return {
      market: toMarketDto(result.market),
      transactionPath: result.transactionPath,
      cadenceArguments: result.cadenceArguments,
      transactionId: result.transactionId,
      signer: result.signer,
      network: result.network,
    };
  }
}
