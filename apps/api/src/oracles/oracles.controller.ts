import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { CryptoOracleService } from "./crypto-oracle.service";
import { SportsOracleService } from "./sports-oracle.service";
import { PublishCryptoQuoteRequestDto } from "./dto/publish-crypto.dto";
import { PublishSportsEventRequestDto } from "./dto/publish-sports.dto";
import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";
import type { FlowSessionPayload } from "../auth/flow-auth.service";
import { MetaPredictionService } from "./aisports/meta-prediction.service";
import { MetaTradeRequestDto } from "./aisports/dto/meta-trade.dto";

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

@Controller("oracles")
export class OraclesController {
  constructor(
    private readonly cryptoOracle: CryptoOracleService,
    private readonly sportsOracle: SportsOracleService,
    private readonly metaPrediction: MetaPredictionService
  ) {}

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ORACLE", "ADMIN")
  @Post("crypto/publish")
  async publishCryptoQuote(
    @Req() req: RequestWithSession,
    @Body() payload: PublishCryptoQuoteRequestDto
  ) {
    const session = req.flowSession ?? null;
    return this.cryptoOracle.publishQuote({
      ...payload,
      publishedBy: session?.address ?? null,
    });
  }

  @Get("crypto/latest")
  async latestCryptoQuote(@Query("asset") assetSymbol: string) {
    return this.cryptoOracle.getLatestQuote(assetSymbol);
  }

  @Get("crypto/history")
  async cryptoHistory(
    @Query("asset") assetSymbol: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.cryptoOracle.listQuotes(assetSymbol, parsedLimit);
  }

  @UseGuards(FlowOrApiGuard)
  @RequireFlowRoles("ORACLE", "ADMIN")
  @Post("sports/publish")
  async publishSportsEvent(
    @Req() req: RequestWithSession,
    @Body() payload: PublishSportsEventRequestDto
  ) {
    const session = req.flowSession ?? null;
    return this.sportsOracle.publishEvent({
      ...payload,
      publishedBy: session?.address ?? null,
    });
  }

  @Get("sports/:eventId/latest")
  async latestSportsEvent(@Param("eventId") eventId: string) {
    return this.sportsOracle.getLatestEvent(eventId);
  }

  @Get("sports/:eventId/history")
  async sportsHistory(
    @Param("eventId") eventId: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.sportsOracle.listEvents(eventId, parsedLimit);
  }

  @Get("sports")
  async sportsBySource(
    @Query("source") source: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    if (typeof source === "string" && source.trim().length > 0) {
      return this.sportsOracle.listBySource(source.trim(), parsedLimit);
    }
    return this.sportsOracle.listAll(parsedLimit);
  }

  @Get("aisports/meta")
  async listAiSportsMarkets(@Query("address") address?: string) {
    await this.metaPrediction.ensureSeedMarkets();
    if (address && address.trim().length > 0) {
      return this.metaPrediction.getMarketsForUser(address.trim());
    }
    return this.metaPrediction.getMarkets();
  }

  @Get("aisports/meta/:marketId")
  async getAiSportsMarket(@Param("marketId") marketId: string) {
    await this.metaPrediction.ensureSeedMarkets();
    const market = await this.metaPrediction.getMarket(marketId);
    if (!market) {
      throw new NotFoundException(`aiSports market ${marketId} not found`);
    }
    return market;
  }

  @Get("aisports/profile/:address")
  async getAiSportsProfile(@Param("address") address: string) {
    return this.metaPrediction.getUserSnapshot(address);
  }

  @Post("aisports/meta/:marketId/quote")
  async quoteAiSportsMarket(
    @Param("marketId") marketId: string,
    @Body() payload: MetaTradeRequestDto
  ) {
    return this.metaPrediction.quoteTrade(marketId, payload.outcome, payload.shares);
  }

  @UseGuards(FlowOrApiGuard)
  @Post("aisports/meta/:marketId/execute")
  async executeAiSportsTrade(
    @Param("marketId") marketId: string,
    @Body() payload: MetaTradeRequestDto,
    @Req() req: RequestWithSession
  ) {
    const session = req.flowSession ?? null;
    return this.metaPrediction.executeTrade(
      marketId,
      payload.outcome,
      payload.shares,
      session?.address ?? null
    );
  }

  @Get("aisports/meta/:marketId/trades")
  async listAiSportsTrades(
    @Param("marketId") marketId: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.metaPrediction.listTrades(marketId, parsedLimit);
  }

  @Get("aisports/leaderboard")
  async getAiSportsLeaderboard(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.metaPrediction.getLeaderboard(parsedLimit);
  }
}
