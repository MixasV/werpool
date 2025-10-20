import { LmsrService } from "./lmsr.service";
import { LmsrState } from "./lmsr.types";

describe("LmsrService", () => {
  let service: LmsrService;

  beforeEach(() => {
    service = new LmsrService();
  });

  it("calculates quote for a buy order", () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    const quote = service.quoteTrade(state, {
      outcomeIndex: 0,
      shares: 5,
      isBuy: true,
    });

    expect(quote.flowAmount).toBeCloseTo(2.80929804, 8);
    expect(quote.outcomeAmount).toBeCloseTo(5, 8);
    expect(quote.newTotalLiquidity).toBeCloseTo(102.80929804, 8);
    expect(quote.newBVector).toEqual([5, 0]);
    expect(quote.newOutcomeSupply).toEqual([5, 0]);
    expect(quote.probabilities[0]).toBeCloseTo(0.62245933, 8);
    expect(quote.probabilities[1]).toBeCloseTo(0.37754067, 8);
  });

  it("calculates quote for a sell order", () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 102.80929804,
      bVector: [5, 0],
      outcomeSupply: [5, 0],
    };

    const quote = service.quoteTrade(state, {
      outcomeIndex: 0,
      shares: 3,
      isBuy: false,
    });

    expect(quote.flowAmount).toBeCloseTo(1.75938115, 8);
    expect(quote.outcomeAmount).toBeCloseTo(3, 8);
    expect(quote.newTotalLiquidity).toBeCloseTo(101.04991689, 8);
    expect(quote.newBVector).toEqual([2, 0]);
    expect(quote.newOutcomeSupply).toEqual([2, 0]);
    expect(quote.probabilities[0]).toBeCloseTo(0.549834, 8);
    expect(quote.probabilities[1]).toBeCloseTo(0.450166, 8);
  });

  it("throws when liquidity parameter is non-positive", () => {
    const state: LmsrState = {
      liquidityParameter: 0,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    expect(() =>
      service.quoteTrade(state, { outcomeIndex: 0, shares: 1, isBuy: true })
    ).toThrow("Liquidity parameter must be positive");
  });

  it("throws when selling more than available supply", () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [1, 0],
      outcomeSupply: [1, 0],
    };

    expect(() =>
      service.quoteTrade(state, { outcomeIndex: 0, shares: 2, isBuy: false })
    ).toThrow("Not enough outcome supply to sell the requested amount");
  });

  it("throws when outcome index is out of bounds", () => {
    const state: LmsrState = {
      liquidityParameter: 10,
      totalLiquidity: 100,
      bVector: [0, 0],
      outcomeSupply: [0, 0],
    };

    expect(() =>
      service.quoteTrade(state, { outcomeIndex: 2, shares: 1, isBuy: true })
    ).toThrow("Outcome index is out of bounds");
  });
});
