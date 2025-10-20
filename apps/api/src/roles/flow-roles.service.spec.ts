import { BadRequestException } from "@nestjs/common";

import { FlowRolesService } from "./flow-roles.service";

jest.mock("@onflow/fcl", () => {
  const put = jest.fn().mockReturnThis();
  const config = jest.fn(() => ({ put }));
  const tx = jest.fn();

  return {
    __esModule: true,
    config,
    tx,
  };
});

const { tx, config } = jest.requireMock("@onflow/fcl") as {
  tx: jest.Mock;
  config: jest.Mock;
};

describe("FlowRolesService", () => {
  let service: FlowRolesService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FLOW_NETWORK;
    delete process.env.FLOW_ACCESS_NODE;
    delete process.env.FLOW_CORE_MARKET_HUB_ADDRESS;
    delete process.env.FLOW_LMSR_AMM_ADDRESS;
    delete process.env.FLOW_OUTCOME_TOKEN_ADDRESS;
    Reflect.set(FlowRolesService as unknown as Record<string, unknown>, "configured", false);
    service = new FlowRolesService();
  });

  it("конфигурирует FCL с адресами контрактов", () => {
    expect(config).toHaveBeenCalledTimes(1);
    const instance = config.mock.results[0]?.value as { put: jest.Mock } | undefined;
    expect(instance?.put).toHaveBeenCalledWith("0xCoreMarketHub", "0x0000000000000001");
    expect(instance?.put).toHaveBeenCalledWith("0xLMSRAmm", "0x0000000000000001");
    expect(instance?.put).toHaveBeenCalledWith("0xOutcomeToken", "0x0000000000000001");
  });

  it("поддерживает события роли patrol", async () => {
    const onceSealed = jest.fn().mockResolvedValue({
      status: 4,
      statusCode: 0,
      events: [
        {
          type: "A.1f93.CoreMarketHub.RoleGranted",
          data: {
            address: "0xCAFE",
            role: "PATROL",
          },
        },
      ],
    });
    tx.mockReturnValue({ onceSealed });

    const events = await service.fetchRoleEvents("0xpatrol");

    expect(events).toEqual([
      {
        type: "grant",
        address: "0xcafe",
        role: "PATROL",
        transactionId: "0xpatrol",
      },
    ]);
  });

  it("возвращает события назначения и отзыва", async () => {
    const onceSealed = jest.fn().mockResolvedValue({
      status: 4,
      statusCode: 0,
      events: [
        {
          type: "A.1f93.CoreMarketHub.RoleGranted",
          data: {
            address: "0xABC",
            role: "ADMIN",
          },
        },
        {
          type: "A.1f93.CoreMarketHub.RoleRevoked",
          data: {
            address: "0xABC",
            role: "ADMIN",
          },
        },
      ],
    });
    tx.mockReturnValue({ onceSealed });

    const events = await service.fetchRoleEvents("0x123");

    expect(onceSealed).toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: "grant",
        address: "0xabc",
        role: "ADMIN",
        transactionId: "0x123",
      },
      {
        type: "revoke",
        address: "0xabc",
        role: "ADMIN",
        transactionId: "0x123",
      },
    ]);
  });

  it("поддерживает строковые payload события", async () => {
    const payload = JSON.stringify({
      value: {
        fields: [
          { name: "address", value: { value: "0xDEF" } },
          { name: "role", value: { value: "OPERATOR" } },
        ],
      },
    });

    const onceSealed = jest.fn().mockResolvedValue({
      status: 4,
      statusCode: 0,
      events: [
        {
          type: "A.Core.CoreMarketHub.RoleGranted",
          data: payload,
        },
      ],
    });
    tx.mockReturnValue({ onceSealed });

    const events = await service.fetchRoleEvents("tx-1");

    expect(events).toEqual([
      {
        type: "grant",
        address: "0xdef",
        role: "OPERATOR",
        transactionId: "tx-1",
      },
    ]);
  });

  it("выбрасывает ошибку если транзакция не содержит роль", async () => {
    const onceSealed = jest.fn().mockResolvedValue({
      status: 4,
      statusCode: 0,
      events: [],
    });
    tx.mockReturnValue({ onceSealed });

    await expect(service.fetchRoleEvents("no-events")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("выбрасывает ошибку если транзакция не запечатана", async () => {
    const onceSealed = jest.fn().mockResolvedValue({ status: 2, statusCode: 0 });
    tx.mockReturnValue({ onceSealed });

    await expect(service.fetchRoleEvents("pending")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("выбрасывает ошибку если транзакция завершилась с кодом ошибки", async () => {
    const onceSealed = jest.fn().mockResolvedValue({
      status: 4,
      statusCode: 1,
      errorMessage: "boom",
    });
    tx.mockReturnValue({ onceSealed });

    await expect(service.fetchRoleEvents("failed")).rejects.toBeInstanceOf(BadRequestException);
  });
});
