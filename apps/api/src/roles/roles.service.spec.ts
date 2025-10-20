import { BadRequestException, NotFoundException } from "@nestjs/common";

import { RolesService } from "./roles.service";

describe("RolesService", () => {
  let prismaMock: {
    flowUser: {
      upsert: jest.Mock;
      findMany: jest.Mock;
    };
    roleAssignment: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let flowRolesMock: {
    fetchRoleEvents: jest.Mock;
  };
  let service: RolesService;

  beforeEach(() => {
    prismaMock = {
      flowUser: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      roleAssignment: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    flowRolesMock = {
      fetchRoleEvents: jest.fn(),
    };

    service = new RolesService(prismaMock as never, flowRolesMock as never);
  });

  it("возвращает роли в порядке создания", async () => {
    prismaMock.roleAssignment.findMany.mockResolvedValue([
      {
        id: "1",
        address: "0xabc",
        role: "ADMIN",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]);

    const result = await service.list();

    expect(prismaMock.roleAssignment.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual([
      {
        id: "1",
        address: "0xabc",
        role: "admin",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("нормализует адрес, роль и метку при назначении", async () => {
    prismaMock.roleAssignment.upsert.mockImplementation((args) => ({
      id: "id-1",
      address: args.create.address,
      role: args.create.role,
      createdAt: new Date("2024-02-02T00:00:00Z"),
    }));

    const result = await service.assign({ address: "abcDEF", role: "operator", label: "QA" });

    expect(prismaMock.flowUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: "0xabcdef" },
        update: expect.objectContaining({ label: "QA" }),
        create: expect.objectContaining({ label: "QA" }),
      })
    );
    expect(prismaMock.roleAssignment.upsert).toHaveBeenCalledWith({
      where: { address_role: { address: "0xabcdef", role: "OPERATOR" } },
      update: {},
      create: { address: "0xabcdef", role: "OPERATOR" },
    });
    expect(result.role).toBe("operator");
  });

  it("поддерживает назначение роли patrol", async () => {
    prismaMock.roleAssignment.upsert.mockImplementation((args) => ({
      id: "id-2",
      address: args.create.address,
      role: args.create.role,
      createdAt: new Date("2024-02-02T00:00:00Z"),
    }));

    const result = await service.assign({ address: "0x1234", role: "patrol" });

    expect(prismaMock.roleAssignment.upsert).toHaveBeenCalledWith({
      where: { address_role: { address: "0x1234", role: "PATROL" } },
      update: {},
      create: { address: "0x1234", role: "PATROL" },
    });
    expect(result.role).toBe("patrol");
  });

  it("возвращает справочник Flow-адресов", async () => {
    const now = new Date("2024-05-05T00:00:00Z");
    prismaMock.flowUser.findMany.mockResolvedValue([
      {
        address: "0xabc",
        label: "Admin",
        firstSeenAt: now,
        lastSeenAt: now,
        nonce: null,
        nonceExpiresAt: null,
        createdAt: now,
        updatedAt: now,
        roles: [
          {
            id: "role-1",
            address: "0xabc",
            role: "ADMIN",
            createdAt: now,
            flowUserAddress: "0xabc",
          },
        ],
      },
    ]);

    const directory = await service.directory();

    expect(prismaMock.flowUser.findMany).toHaveBeenCalled();
    expect(directory).toEqual([
      {
        address: "0xabc",
        label: "Admin",
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        roles: [
          {
            id: "role-1",
            address: "0xabc",
            role: "admin",
            createdAt: now.toISOString(),
          },
        ],
      },
    ]);
  });

  it("выбрасывает ошибку для неизвестной роли", async () => {
    await expect(service.assign({ address: "0x1234567890abcdef", role: "viewer" as never })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("удаляет роль по идентификатору", async () => {
    prismaMock.roleAssignment.delete.mockResolvedValue({});

    await service.revoke("id-1");

    expect(prismaMock.roleAssignment.delete).toHaveBeenCalledWith({ where: { id: "id-1" } });
  });

  it("генерирует NotFound при отсутствии записи", async () => {
    prismaMock.roleAssignment.delete.mockRejectedValue({ code: "P2025" });

    await expect(service.revoke("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("синхронизирует роль по событию grant", async () => {
    flowRolesMock.fetchRoleEvents.mockResolvedValue([
      {
        type: "grant",
        address: "0x01",
        role: "ADMIN",
        transactionId: "abc",
      },
    ]);

    prismaMock.roleAssignment.upsert.mockResolvedValue({
      id: "role-1",
      address: "0x01",
      role: "ADMIN",
      createdAt: new Date("2024-03-03T00:00:00Z"),
    });

    const result = await service.grantOnchain({ transactionId: "abc", label: "Ops" });

    expect(flowRolesMock.fetchRoleEvents).toHaveBeenCalledWith("abc");
    expect(prismaMock.flowUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ label: "Ops" }),
        create: expect.objectContaining({ label: "Ops" }),
      })
    );
    expect(prismaMock.roleAssignment.upsert).toHaveBeenCalledWith({
      where: { address_role: { address: "0x01", role: "ADMIN" } },
      update: {},
      create: { address: "0x01", role: "ADMIN" },
    });
    expect(result).toEqual({
      id: "role-1",
      address: "0x01",
      role: "admin",
      createdAt: "2024-03-03T00:00:00.000Z",
    });
  });

  it("синхронизирует отзыв роли по событию revoke", async () => {
    flowRolesMock.fetchRoleEvents.mockResolvedValue([
      {
        type: "revoke",
        address: "0x02",
        role: "OPERATOR",
        transactionId: "tx",
      },
    ]);

    prismaMock.roleAssignment.findUnique.mockResolvedValue({
      id: "role-2",
      address: "0x02",
      role: "OPERATOR",
      createdAt: new Date("2024-04-04T00:00:00Z"),
    });

    prismaMock.roleAssignment.delete.mockResolvedValue({});

    const result = await service.revokeOnchain({ transactionId: "tx" });

    expect(prismaMock.roleAssignment.findUnique).toHaveBeenCalledWith({
      where: { address_role: { address: "0x02", role: "OPERATOR" } },
    });
    expect(prismaMock.roleAssignment.delete).toHaveBeenCalledWith({ where: { id: "role-2" } });
    expect(result).toEqual({
      id: "role-2",
      address: "0x02",
      role: "operator",
      createdAt: "2024-04-04T00:00:00.000Z",
    });
  });

  it("выбрасывает ошибку, если транзакция без событий назначения", async () => {
    flowRolesMock.fetchRoleEvents.mockResolvedValue([
      { type: "revoke", address: "0x01", role: "ADMIN", transactionId: "abc" },
    ]);

    await expect(service.grantOnchain({ transactionId: "abc" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("выбрасывает NotFound, если отзыв не найден в базе", async () => {
    flowRolesMock.fetchRoleEvents.mockResolvedValue([
      { type: "revoke", address: "0x03", role: "ORACLE", transactionId: "tx" },
    ]);
    prismaMock.roleAssignment.findUnique.mockResolvedValue(null);

    await expect(service.revokeOnchain({ transactionId: "tx" })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
