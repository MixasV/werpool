import { BadRequestException } from "@nestjs/common";
import { Prisma, PointEventSource, RolePurchaseStatus, RoleType } from "@prisma/client";

import { RolePurchaseService } from "./role-purchase.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { PointsService } from "../points/points.service";
import type { RolesService } from "./roles.service";

describe("RolePurchaseService", () => {
  const now = new Date("2024-06-01T10:00:00Z");
  let prismaMock: {
    roleAssignment: { findUnique: jest.Mock };
    rolePurchaseRequest: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let pointsServiceMock: jest.Mocked<PointsService>;
  let rolesServiceMock: jest.Mocked<RolesService>;
  let service: RolePurchaseService;

  beforeEach(() => {
    prismaMock = {
      roleAssignment: {
        findUnique: jest.fn(),
      },
      rolePurchaseRequest: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    pointsServiceMock = {
      getSummary: jest.fn(),
      getLedger: jest.fn(),
      awardPoints: jest.fn(),
      recordEvent: jest.fn(),
      getLeaderboard: jest.fn(),
      captureLeaderboardSnapshot: jest.fn(),
      getLeaderboardSnapshots: jest.fn(),
      spendPoints: jest.fn(),
    } as unknown as jest.Mocked<PointsService>;

    rolesServiceMock = {
      assign: jest.fn(),
    } as unknown as jest.Mocked<RolesService>;

    service = new RolePurchaseService(
      prismaMock as unknown as PrismaService,
      pointsServiceMock,
      rolesServiceMock
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createRequestRecord = (overrides: Partial<Prisma.RolePurchaseRequestUncheckedCreateInput> & { status?: RolePurchaseStatus } = {}) => ({
    id: "req-1",
    userAddress: "0xabc",
    role: RoleType.PATROL,
    pointsSpent: new Prisma.Decimal(20000),
    status: overrides.status ?? RolePurchaseStatus.PENDING,
    createdAt: now,
    processedAt: overrides.processedAt ?? null,
    processedBy: overrides.processedBy ?? null,
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? null,
  });

  it("creates a role purchase request and spends points", async () => {
    prismaMock.roleAssignment.findUnique.mockResolvedValue(null);
    prismaMock.rolePurchaseRequest.findFirst.mockResolvedValue(null);
    prismaMock.rolePurchaseRequest.create.mockResolvedValue(createRequestRecord());

    const result = await service.requestPurchase("0xABC");

    expect(pointsServiceMock.spendPoints).toHaveBeenCalledWith({
      address: "0xabc",
      amount: 20000,
      source: PointEventSource.ROLE_PURCHASE,
      reference: "role:patrol",
      notes: "Role purchase request",
    });
    expect(prismaMock.rolePurchaseRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userAddress: "0xabc",
        role: RoleType.PATROL,
        pointsSpent: 20000,
      }),
    });
    expect(result).toMatchObject({
      userAddress: "0xabc",
      role: "patrol",
      status: RolePurchaseStatus.PENDING,
      pointsSpent: 20000,
    });
  });

  it("prevents duplicate purchase when role already assigned", async () => {
    prismaMock.roleAssignment.findUnique.mockResolvedValue({ id: "role-1" });

    await expect(service.requestPurchase("0xabc")).rejects.toThrow(
      new BadRequestException("PATROL role already assigned")
    );

    expect(pointsServiceMock.spendPoints).not.toHaveBeenCalled();
  });

  it("approves pending requests and completes role assignment", async () => {
    prismaMock.rolePurchaseRequest.findUnique.mockResolvedValue(createRequestRecord());
    prismaMock.rolePurchaseRequest.update
      .mockResolvedValueOnce(createRequestRecord({ status: RolePurchaseStatus.APPROVED }))
      .mockResolvedValueOnce(createRequestRecord({ status: RolePurchaseStatus.COMPLETED }));

    const result = await service.approveRequest("req-1", { actor: "0xadmin", notes: "ok" });

    expect(rolesServiceMock.assign).toHaveBeenCalledWith({ address: "0xabc", role: "patrol" });
    expect(prismaMock.rolePurchaseRequest.update).toHaveBeenNthCalledWith(2, {
      where: { id: "req-1" },
      data: { status: RolePurchaseStatus.COMPLETED },
    });
    expect(result.status).toBe(RolePurchaseStatus.COMPLETED);
  });

  it("refunds points when approval fails to assign role", async () => {
    prismaMock.rolePurchaseRequest.findUnique.mockResolvedValue(createRequestRecord());
    prismaMock.rolePurchaseRequest.update.mockResolvedValue(createRequestRecord({ status: RolePurchaseStatus.APPROVED }));
    rolesServiceMock.assign.mockRejectedValue(new Error("cannot assign"));

    await expect(
      service.approveRequest("req-1", { actor: "0xadmin", notes: "try" })
    ).rejects.toThrow("cannot assign");

    expect(pointsServiceMock.recordEvent).toHaveBeenCalledWith({
      address: "0xabc",
      amount: 20000,
      source: PointEventSource.ROLE_PURCHASE,
      reference: "role:patrol:refund:req-1",
      notes: "Role purchase refund",
      actor: "0xadmin",
    });
    expect(prismaMock.rolePurchaseRequest.update).toHaveBeenLastCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({
        status: RolePurchaseStatus.DECLINED,
      }),
    });
  });

  it("declines requests and refunds points", async () => {
    prismaMock.rolePurchaseRequest.findUnique.mockResolvedValue(createRequestRecord());
    prismaMock.rolePurchaseRequest.update.mockResolvedValue(createRequestRecord({
      status: RolePurchaseStatus.DECLINED,
      notes: "Declined",
      processedBy: "0xadmin",
      processedAt: now,
    }));

    const result = await service.declineRequest("req-1", { actor: "0xadmin", notes: "Declined" });

    expect(pointsServiceMock.recordEvent).toHaveBeenCalledWith({
      address: "0xabc",
      amount: 20000,
      source: PointEventSource.ROLE_PURCHASE,
      reference: "role:patrol:refund:req-1",
      notes: "Role purchase refund",
      actor: "0xadmin",
    });
    expect(result.status).toBe(RolePurchaseStatus.DECLINED);
  });

  it("lists user requests", async () => {
    prismaMock.rolePurchaseRequest.findMany.mockResolvedValue([
      createRequestRecord(),
    ]);

    const result = await service.listRequests("0xabc");

    expect(prismaMock.rolePurchaseRequest.findMany).toHaveBeenCalledWith({
      where: { userAddress: "0xabc" },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toHaveLength(1);
  });

  it("filters requests by status", async () => {
    prismaMock.rolePurchaseRequest.findMany.mockResolvedValue([
      createRequestRecord({ status: RolePurchaseStatus.PENDING }),
    ]);

    await service.listAll(RolePurchaseStatus.PENDING);

    expect(prismaMock.rolePurchaseRequest.findMany).toHaveBeenCalledWith({
      where: { status: RolePurchaseStatus.PENDING },
      orderBy: { createdAt: "desc" },
    });
  });
});
