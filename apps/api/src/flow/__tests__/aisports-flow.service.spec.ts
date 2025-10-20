import { AiSportsFlowService } from "../aisports-flow.service";

const putMock = jest.fn().mockReturnThis();

jest.mock("@onflow/fcl", () => ({
  config: jest.fn(() => ({ put: putMock })),
  query: jest.fn(),
}));

const { query } = jest.requireMock("@onflow/fcl") as { query: jest.Mock };

describe("AiSportsFlowService", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.AISPORTS_MINTER_ADDRESS = "0xabe5a2bf47ce5bf3";
    process.env.AISPORTS_JUICE_ADDRESS = "0x9db94c9564243ba7";
    process.env.AISPORTS_ESCROW_ADDRESS = "0x4fdb077419808080";
    process.env.AISPORTS_FLOW_NETWORK = "testnet";
    process.env.AISPORTS_INTEGRATION_ENABLED = "true";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns fallback values when integration disabled", async () => {
    process.env.AISPORTS_INTEGRATION_ENABLED = "false";
    const service = new AiSportsFlowService();

    const score = await service.getUserFantasyScore("0x1234");
    const juice = await service.getJuiceBalance("0x1234");
    const nfts = await service.getUserNfts("0x1234");
    const user = await service.getUserData("0x1234");

    expect(score).toBe(0);
    expect(juice).toBe(0);
    expect(nfts).toEqual([]);
    expect(user.accessLevel).toBe("none");
    expect(query).not.toHaveBeenCalled();
  });

  it("caches fantasy score responses", async () => {
    query.mockImplementation(async ({ cadence }: { cadence: string }) => {
      if (cadence.includes("getUserTotalScore")) {
        return "42.50";
      }
      return null;
    });

    const service = new AiSportsFlowService();

    const first = await service.getUserFantasyScore("0x0001");
    const second = await service.getUserFantasyScore("0x0001");

    expect(first).toBeCloseTo(42.5);
    expect(second).toBeCloseTo(42.5);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("calculates premium access level for strong users", async () => {
    query.mockImplementation(async ({ cadence }: { cadence: string }) => {
      if (cadence.includes("getUserTotalScore")) {
        return "81.25";
      }
      if (cadence.includes("FungibleToken")) {
        return "215.40";
      }
      if (cadence.includes("NFTInfo")) {
        return [
          { id: 1, rarity: "Legendary", type: "Forward", metadata: { player: "MVP" } },
        ];
      }
      if (cadence.includes("aiSportsEscrow")) {
        return {
          totalParticipants: "250",
          currentPrizePool: "500.0",
          averageScore: "75.5",
          activeContests: "12",
        };
      }
      return null;
    });

    const service = new AiSportsFlowService();
    const user = await service.getUserData("0x9999");
    const nftCall = query.mock.calls.find(([payload]: [{ cadence: string }]) =>
      payload.cadence.includes("NFTInfo")
    );

    expect(nftCall).toBeDefined();
    expect(user.fantasyScore).toBeCloseTo(81.25);
    expect(user.juiceBalance).toBeCloseTo(215.4);
    expect(user.accessLevel).toBe("premium");
  });
});
