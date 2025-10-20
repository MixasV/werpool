import { promises as fs } from "fs";
import * as os from "os";
import { join } from "path";

import { LmsrService } from "../../markets/lmsr/lmsr.service";
import { MetaPredictionService } from "./meta-prediction.service";
import type { AiSportsFlowService } from "../../flow/aisports-flow.service";
import type { AiSportsTournamentStats, AiSportsUserData } from "../../types/aisports.types";

const createFlowService = (): AiSportsFlowService => {
  const stats: AiSportsTournamentStats = {
    totalParticipants: 420,
    currentPrizePool: 12500,
    averageScore: 48.5,
    activeContests: 6,
    timestamp: new Date(),
  };

  const baseUser: AiSportsUserData = {
    address: "0xuser",
    fantasyScore: 52,
    juiceBalance: 180,
    nfts: [],
    lastActivity: new Date(),
    accessLevel: "basic",
  };

  return {
    isEnabled: () => true,
    getTournamentStats: async () => stats,
    getUserData: async (address: string) => ({ ...baseUser, address }),
  } as unknown as AiSportsFlowService;
};

const createService = () => {
  const flowService = createFlowService();
  const lmsr = new LmsrService();
  return new MetaPredictionService(flowService, lmsr);
};

describe("MetaPredictionService", () => {
  const originalStorePath = process.env.AISPORTS_META_STORE_PATH;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeAll(() => {
    process.env.AISPORTS_META_STORE_PATH = "memory";
  });

  afterAll(() => {
    if (originalStorePath === undefined) {
      delete process.env.AISPORTS_META_STORE_PATH;
    } else {
      process.env.AISPORTS_META_STORE_PATH = originalStorePath;
    }
  });

  const getFirstMarketId = async (service: MetaPredictionService): Promise<string> => {
    const markets = await service.getMarkets();
    return markets[0]?.id ?? (() => {
      throw new Error("Expected at least one meta market");
    })();
  };

  it("quotes trades using LMSR state", async () => {
    const service = createService();
    const marketId = await getFirstMarketId(service);

    const quote = await service.quoteTrade(marketId, "YES", 10);

    expect(quote.flowAmount).toBeGreaterThan(0);
    expect(quote.poolState.outcomeSupply[0]).toBeCloseTo(10, 6);
    expect(quote.poolState.outcomeSupply[1]).toBeCloseTo(0, 6);
    expect(quote.price).toBeCloseTo(quote.flowAmount / quote.shares, 8);
    expect(quote.probabilities[0]).toBeGreaterThan(quote.probabilities[1]);
  });

  it("executes trades and updates market metrics", async () => {
    const service = createService();
    const marketId = await getFirstMarketId(service);

    const result = await service.executeTrade(marketId, "YES", 5, "0xaaa");

    expect(result.market.tradeCount).toBe(1);
    expect(result.market.tradeVolume).toBeCloseTo(result.trade.flowAmount, 6);
    expect(result.market.lastTradeAt).toBeInstanceOf(Date);

    const trades = await service.listTrades(marketId);
    expect(trades).toHaveLength(1);
    expect(trades[0].signer).toBe("0xaaa");
    expect(trades[0].outcome).toBe("YES");
  });

  it("returns latest trades respecting limit", async () => {
    const service = createService();
    const marketId = await getFirstMarketId(service);

    const first = await service.executeTrade(marketId, "YES", 2, "0xabc");
    jest.advanceTimersByTime(1000);
    const second = await service.executeTrade(marketId, "NO", 3, "0xdef");

    const trades = await service.listTrades(marketId, 1);

    expect(trades).toHaveLength(1);
    expect(trades[0].id).toBe(second.trade.id);
    expect(trades[0].createdAt.getTime()).toBe(second.trade.createdAt.getTime());
    expect(trades[0].outcome).toBe("NO");

    const allTrades = await service.listTrades(marketId, 10);
    expect(allTrades[0].id).toBe(first.trade.id);
    expect(allTrades[1].id).toBe(second.trade.id);
  });

  it("aggregates leaderboard by signer volume", async () => {
    const service = createService();
    const marketId = await getFirstMarketId(service);

    await service.executeTrade(marketId, "YES", 10, "0xaaa");
    jest.advanceTimersByTime(500);
    await service.executeTrade(marketId, "NO", 4, "0xbbb");

    const leaderboard = await service.getLeaderboard(5);

    expect(leaderboard.length).toBeGreaterThanOrEqual(2);
    expect(leaderboard[0].address).toBe("0xaaa");
    expect(leaderboard[0].score).toBeGreaterThan(leaderboard[1].score);
  });

  it("returns synthetic leaderboard when no trades recorded", async () => {
    const service = createService();
    const leaderboard = await service.getLeaderboard(3);

    expect(leaderboard.length).toBeGreaterThan(0);
    expect(leaderboard[0].address).toMatch(/^0xmeta/i);
  });

  it("rejects quotes with non-positive shares", async () => {
    const service = createService();
    const marketId = await getFirstMarketId(service);

    await expect(service.quoteTrade(marketId, "YES", 0)).rejects.toThrow("Shares must be a positive number");
    await expect(service.quoteTrade(marketId, "NO", -3)).rejects.toThrow("Shares must be a positive number");
  });

  it("persists meta markets and trades using configured store path", async () => {
    const tempFile = join(os.tmpdir(), `aisports-meta-${Date.now()}.json`);
    process.env.AISPORTS_META_STORE_PATH = tempFile;

    try {
      const initialService = createService();
      const marketId = await getFirstMarketId(initialService);

      await initialService.executeTrade(marketId, "YES", 3, "0x111");
      jest.advanceTimersByTime(1000);
      await initialService.executeTrade(marketId, "NO", 1, "0x222");

      const persisted = await fs.readFile(tempFile, "utf8");
      expect(persisted).toContain(marketId);

      const restoredService = createService();
      const restoredMarkets = await restoredService.getMarkets();
      const restoredMarket = restoredMarkets.find((item) => item.id === marketId);
      expect(restoredMarket?.tradeCount).toBe(2);
      expect(restoredMarket?.tradeVolume).toBeGreaterThan(0);

      const restoredTrades = await restoredService.listTrades(marketId);
      expect(restoredTrades).toHaveLength(2);
      expect(restoredTrades[0].probabilities.length).toBeGreaterThan(0);
    } finally {
      process.env.AISPORTS_META_STORE_PATH = "memory";
      await fs.rm(tempFile, { force: true });
    }
  });
});
