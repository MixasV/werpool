import { Prisma } from "@prisma/client";

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
  let service: PointsService;

  beforeEach(() => {
    const userPointsFindMany = jest.fn();
    const leaderboardDeleteMany = jest.fn();
    const leaderboardCreateMany = jest.fn();

    prismaMock = {
      $transaction: jest.fn(async (callback) =>
        callback({
          userPoints: { findMany: userPointsFindMany },
          leaderboardSnapshot: {
            deleteMany: leaderboardDeleteMany,
            createMany: leaderboardCreateMany,
          },
        })
      ),
      userPoints: {
        findMany: userPointsFindMany,
      },
      leaderboardSnapshot: {
        deleteMany: leaderboardDeleteMany,
        createMany: leaderboardCreateMany,
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };

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
    expect(prismaMock.leaderboardSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { capturedAt },
    });
    expect(prismaMock.leaderboardSnapshot.createMany).toHaveBeenCalledWith({
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

    expect(prismaMock.leaderboardSnapshot.createMany).not.toHaveBeenCalled();
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

    const snapshots = await service.getLeaderboardSnapshots({ limit: 3, after, before });

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
    expect(snapshots).toEqual([
      {
        capturedAt: firstDate.toISOString(),
        entries: [
          { address: "0xalpha", total: 320, rank: 1 },
          { address: "0xbravo", total: 180, rank: 2 },
        ],
      },
      {
        capturedAt: secondDate.toISOString(),
        entries: [{ address: "0xalpha", total: 300, rank: 1 }],
      },
    ]);
  });
});
