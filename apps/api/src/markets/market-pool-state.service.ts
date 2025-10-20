import { Injectable, Logger } from "@nestjs/common";
import { Prisma, MarketPoolState as PrismaMarketPoolState } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { FlowMarketService } from "./flow/flow-market.service";
import { LmsrState, LmsrTradeQuote } from "./lmsr/lmsr.types";

const VECTOR_PRECISION = 1e8;

@Injectable()
export class MarketPoolStateService {
  private readonly logger = new Logger(MarketPoolStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowMarketService: FlowMarketService
  ) {}

  async getState(flowMarketId: number, marketId?: string): Promise<LmsrState> {
    const record = await this.prisma.marketPoolState.findUnique({
      where: { flowMarketId },
    });

    if (record) {
      return this.toState(record);
    }

    return this.refreshFromFlow(flowMarketId, marketId);
  }

  async refreshFromFlow(flowMarketId: number, marketId?: string): Promise<LmsrState> {
    const state = await this.flowMarketService.getPoolState(flowMarketId);
    const resolvedMarketId = await this.resolveMarketId(flowMarketId, marketId);

    await this.saveState(resolvedMarketId, flowMarketId, state);
    return state;
  }

  async syncState(flowMarketId: number, marketId: string, state: LmsrState): Promise<LmsrState> {
    await this.saveState(marketId, flowMarketId, state);
    return state;
  }

  async applyQuote(
    flowMarketId: number,
    marketId: string,
    currentState: LmsrState,
    quote: LmsrTradeQuote
  ): Promise<LmsrState> {
    const updated: LmsrState = {
      liquidityParameter: currentState.liquidityParameter,
      totalLiquidity: quote.newTotalLiquidity,
      bVector: quote.newBVector,
      outcomeSupply: quote.newOutcomeSupply,
    };

    await this.saveState(marketId, flowMarketId, updated);
    return updated;
  }

  private async resolveMarketId(flowMarketId: number, marketId?: string): Promise<string> {
    if (marketId && marketId.length > 0) {
      return marketId;
    }

    const resolved = await this.prisma.market.findUnique({
      where: { id: flowMarketId.toString() },
      select: { id: true },
    });

    if (!resolved) {
      throw new Error(`Market ${flowMarketId} not found for pool state synchronization`);
    }

    return resolved.id;
  }

  private async saveState(marketId: string, flowMarketId: number, state: LmsrState): Promise<void> {
    try {
      const payload = this.mapStateToPersistence(marketId, flowMarketId, state);

      await this.prisma.marketPoolState.upsert({
        where: { flowMarketId },
        update: {
          marketId: payload.marketId,
          liquidityParameter: payload.liquidityParameter,
          totalLiquidity: payload.totalLiquidity,
          bVector: payload.bVector,
          outcomeSupply: payload.outcomeSupply,
        },
        create: payload,
      });
    } catch (error) {
      const message =
        error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
      this.logger.error(
        `Failed to persist pool state for market ${marketId} (${flowMarketId}): ${message}`
      );
      throw error;
    }
  }

  private mapStateToPersistence(
    marketId: string,
    flowMarketId: number,
    state: LmsrState
  ) {
    return {
      marketId,
      flowMarketId,
      liquidityParameter: new Prisma.Decimal(state.liquidityParameter),
      totalLiquidity: new Prisma.Decimal(state.totalLiquidity),
      bVector: this.encodeVector(state.bVector),
      outcomeSupply: this.encodeVector(state.outcomeSupply),
    } satisfies Prisma.MarketPoolStateUpsertArgs["create"];
  }

  private encodeVector(values: number[]): Prisma.InputJsonValue {
    return values.map((value, index) => {
      if (!Number.isFinite(value)) {
        throw new Error(`Pool state vector value at index ${index} is not finite`);
      }
      return Math.round(value * VECTOR_PRECISION) / VECTOR_PRECISION;
    });
  }

  private toState(record: PrismaMarketPoolState): LmsrState {
    return {
      liquidityParameter: Number(record.liquidityParameter),
      totalLiquidity: Number(record.totalLiquidity),
      bVector: this.decodeVector(record.bVector, "bVector"),
      outcomeSupply: this.decodeVector(record.outcomeSupply, "outcomeSupply"),
    };
  }

  private decodeVector(value: Prisma.JsonValue, field: string): number[] {
    if (!Array.isArray(value)) {
      throw new Error(`Stored ${field} payload is not an array`);
    }

    return value.map((entry, index) => {
      if (typeof entry !== "number") {
        throw new Error(`Stored ${field}[${index}] is not a number`);
      }
      return entry;
    });
  }
}
