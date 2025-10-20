import { Injectable } from "@nestjs/common";

import { LmsrState, LmsrTradeInput, LmsrTradeQuote } from "./lmsr.types";

@Injectable()
export class LmsrService {
  quoteTrade(state: LmsrState, input: LmsrTradeInput): LmsrTradeQuote {
    this.assertState(state);
    this.assertInput(state, input);

    const direction = input.isBuy ? input.shares : -input.shares;
    const nextBVector = [...state.bVector];
    nextBVector[input.outcomeIndex] = this.round(
      nextBVector[input.outcomeIndex] + direction
    );

    const lseBefore = this.logSumExp(state.bVector, state.liquidityParameter);
    const lseAfter = this.logSumExp(nextBVector, state.liquidityParameter);

    const flowAmountRaw = state.liquidityParameter * (lseAfter - lseBefore);
    const flowAmount = this.round(Math.abs(flowAmountRaw));

    const nextTotalLiquidity = input.isBuy
      ? this.round(state.totalLiquidity + flowAmount)
      : this.round(state.totalLiquidity - flowAmount);

    const nextOutcomeSupply = [...state.outcomeSupply];
    nextOutcomeSupply[input.outcomeIndex] = this.round(
      nextOutcomeSupply[input.outcomeIndex] + direction
    );

    const probabilities = this.softmax(nextBVector, state.liquidityParameter);

    return {
      flowAmount,
      outcomeAmount: this.round(input.shares),
      newBVector: nextBVector.map((value) => this.round(value)),
      newTotalLiquidity: nextTotalLiquidity,
      newOutcomeSupply: nextOutcomeSupply.map((value) => this.round(value)),
      probabilities,
    };
  }

  private assertState(state: LmsrState): void {
    if (state.liquidityParameter <= 0) {
      throw new Error("Liquidity parameter must be positive");
    }

    if (state.bVector.length === 0) {
      throw new Error("B vector must not be empty");
    }

    if (state.bVector.length !== state.outcomeSupply.length) {
      throw new Error("B vector and outcome supply must have the same length");
    }
  }

  private assertInput(state: LmsrState, input: LmsrTradeInput): void {
    if (!Number.isFinite(input.shares) || input.shares <= 0) {
      throw new Error("Shares must be a positive number");
    }

    if (
      input.outcomeIndex < 0 ||
      input.outcomeIndex >= state.bVector.length ||
      !Number.isInteger(input.outcomeIndex)
    ) {
      throw new Error("Outcome index is out of bounds");
    }

    if (!input.isBuy) {
      const availableShares = state.outcomeSupply[input.outcomeIndex];
      if (availableShares < input.shares) {
        throw new Error("Not enough outcome supply to sell the requested amount");
      }
    }
  }

  private logSumExp(values: number[], liquidityParameter: number): number {
    const scaled = values.map((value) => value / liquidityParameter);
    const max = Math.max(...scaled);
    const sum = scaled
      .map((value) => Math.exp(value - max))
      .reduce((acc, current) => acc + current, 0);
    return max + Math.log(sum);
  }

  private softmax(values: number[], liquidityParameter: number): number[] {
    const scaled = values.map((value) => value / liquidityParameter);
    const max = Math.max(...scaled);
    const exps = scaled.map((value) => Math.exp(value - max));
    const sum = exps.reduce((acc, current) => acc + current, 0);
    return exps.map((value) => this.round(value / sum));
  }

  private round(value: number): number {
    return Math.round(value * 1e8) / 1e8;
  }
}
