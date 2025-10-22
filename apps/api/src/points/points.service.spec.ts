import { Prisma, PointEventSource } from "@prisma/client";

import { PointsService } from "./points.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("PointsService", () => {
  let prismaMock: {
    $transaction: jest.Mock;
    userPoints: {
      findMany: jest.Mock;
    };
    leaderboardSnapshot: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let txUserPointsFindMany: jest.Mock;
  let txUserPointsFindUnique: jest.Mock;
  let txUserPointsUpdate: jest.Mock;
  let txUserPointLedgerCreate: jest.Mock;
  let txLeaderboardDeleteMany: jest.Mock;
  let txLeaderboardCreateMany: jest.Mock;
  let service: PointsService;

  beforeEach(() => {
    txUserPointsFindMany = jest.fn();
    txUserPointsFindUnique = jest.fn();
    txUserPointsUpdate = jest.fn();
    txUserPointLedgerCreate = jest.fn();
    txLeaderboardDeleteMany = jest.fn();
    txLeaderboardCreateMany = jest.fn();

    prismaMock = {
      $transaction: jest.fn(async (callback) =>
        callback({
          userPoints: {
            findMany: txUserPointsFindMany,
            findUnique: txUserPointsFindUnique,
            update: txUserPointsUpdate,
          },
          userPointLedger: {
            create: txUserPointLedgerCreate,
          },
          leaderboardSnapshot: {
            deleteMany: txLeaderboardDeleteMany,
            createMany: txLeaderboardCreateMany,
          },
        })
      ),
      userPoints: {
        findMany: txUserPointsFindMany,
      },
      leaderboardSnapshot: {
        deleteMany: txLeaderboardDeleteMany,
        createMany: txLeaderboardCreateMany,
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    } as typeof prismaMock;

    service = new PointsService(prismaMock as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("captures leaderboard snapshot with top entries", async () => {
    const capturedAt = new Date("2024-05-01T10:00:00.000Z");
    prismaMock.userPoints.findMany.mockResolvedValue([
      { address: "0xalpha", total: new Prisma.Decimal(320) },
      { address: "0xbravo", total: new Prisma.Decimal(200) },
    ]);

    const snapshot = await service.captureLeaderboardSnapshot({ limit: 5, capturedAt });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txLeaderboardDeleteMany).toHaveBeenCalledWith({
      where: { capturedAt },
    });
    expect(txLeaderboardCreateMany).toHaveBeenCalledWith({
      data: [
        {
          capturedAt,
          address: "0xalpha",
          rank: 1,
          total: new Prisma.Decimal(320),
        },
        {
          capturedAt,
          address: "0xbravo",
          rank: 2,
          total: new Prisma.Decimal(200),
        },
      ],
    });

    expect(snapshot).toEqual({
      capturedAt: capturedAt.toISOString(),
      entries: [
        { address: "0xalpha", total: 320, rank: 1 },
        { address: "0xbravo", total: 200, rank: 2 },
      ],
    });
  });

  it("does not persist snapshot when there are no leaderboard entries", async () => {
    prismaMock.userPoints.findMany.mockResolvedValue([]);

    const snapshot = await service.captureLeaderboardSnapshot({ limit: 10 });

    expect(txLeaderboardCreateMany).not.toHaveBeenCalled();
    expect(snapshot).toEqual({ capturedAt: expect.any(String), entries: [] });
  });

  it("returns leaderboard snapshots within requested bounds", async () => {
    const firstDate = new Date("2024-05-10T12:00:00.000Z");
    const secondDate = new Date("2024-05-08T09:00:00.000Z");

    prismaMock.leaderboardSnapshot.groupBy.mockResolvedValue([
      { capturedAt: firstDate },
      { capturedAt: secondDate },
    ]);

    prismaMock.leaderboardSnapshot.findMany.mockImplementation(async ({ where }) => {
      const capturedAt = (where as { capturedAt: Date }).capturedAt;
      if (capturedAt.getTime() === firstDate.getTime()) {
        return [
          { address: "0xalpha", total: new Prisma.Decimal(320), rank: 1 },
          { address: "0xbravo", total: new Prisma.Decimal(180), rank: 2 },
        ];
      }
      if (capturedAt.getTime() === secondDate.getTime()) {
        return [
          { address: "0xalpha", total: new Prisma.Decimal(300), rank: 1 },
        ];
      }
      return [];
    });

    const after = new Date("2024-05-01T00:00:00.000Z").toISOString();
    const before = new Date("2024-05-30T00:00:00.000Z").toISOString();

    await service.getLeaderboardSnapshots({ limit: 3, after, before });

    expect(prismaMock.leaderboardSnapshot.groupBy).toHaveBeenCalledWith({
      by: ["capturedAt"],
      where: {
        capturedAt: {
          gt: new Date(after),
          lt: new Date(before),
        },
      },
      orderBy: { capturedAt: "desc" },
      take: 3,
    });

    expect(prismaMock.leaderboardSnapshot.findMany).toHaveBeenCalledTimes(2);
  });

  describe("spendPoints", () => {
    it("deducts balance and records ledger entry", async () => {
      const createdAt = new Date("2024-06-01T10:00:00Z");
      txUserPointsFindUnique.mockResolvedValue({
        address: "0xabc",
        total: new Prisma.Decimal(50000),
      });
      txUserPointLedgerCreate.mockResolvedValue({
        id: "ledger-1",
        address: "0xabc",
        source: PointEventSource.ROLE_PURCHASE,
        amount: new Prisma.Decimal(-20000),
        reference: "role:patrol",
        notes: "Role purchase request",
        createdAt,
      });
      txUserPointsUpdate.mockResolvedValue({});

      const result = await service.spendPoints({
        address: "0xAbC",
        amount: 20000,
        source: PointEventSource.ROLE_PURCHASE,
        reference: "role:patrol",
        notes: "Role purchase request",
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txUserPointLedgerCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: "0xabc",
          amount: expect.any(Prisma.Decimal),
        }),
      });
      const ledgerCall = txUserPointLedgerCreate.mock.calls[0][0].data as {
        amount: Prisma.Decimal;
      };
      expect(ledgerCall.amount.toNumber()).toBe(-20000);
      expect(txUserPointsUpdate).toHaveBeenCalledWith({
        where: { address: "0xabc" },
        data: {
          total: {
            decrement: new Prisma.Decimal(20000),
          },
        },
      });
      expect(result).toEqual({
        id: "ledger-1",
        address: "0xabc",
        source: PointEventSource.ROLE_PURCHASE,
        amount: -20000,
        reference: "role:patrol",
        notes: "Role purchase request",
        createdAt: createdAt.toISOString(),
      });
    });

    it("throws when balance is insufficient", async () => {
      txUserPointsFindUnique.mockResolvedValue({
        address: "0xabc",
        total: new Prisma.Decimal(15000),
      });

      await expect(
        service.spendPoints({
          address: "0xabc",
          amount: 20000,
          source: PointEventSource.ROLE_PURCHASE,
        })
      ).rejects.toThrow("Insufficient points balance");

      expect(txUserPointLedgerCreate).not.toHaveBeenCalled();
      expect(txUserPointsUpdate).not.toHaveBeenCalled();
    });
  });
});
