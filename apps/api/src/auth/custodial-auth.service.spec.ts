import { BadRequestException, UnauthorizedException } from "@nestjs/common";

import { CustodialAuthService } from "./custodial-auth.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { FlowAuthService } from "./flow-auth.service";

const createPrismaMock = () => ({
  flowUser: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
});

const createFlowAuthMock = () => ({
  createSessionForAddress: jest.fn(),
});

describe("CustodialAuthService", () => {
  let service: CustodialAuthService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let flowAuthMock: ReturnType<typeof createFlowAuthMock>;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    flowAuthMock = createFlowAuthMock();
    service = new CustodialAuthService(
      prismaMock as unknown as PrismaService,
      flowAuthMock as unknown as FlowAuthService
    );
    jest.useFakeTimers().setSystemTime(new Date("2024-05-01T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("creates verification token for new email", async () => {
    prismaMock.flowUser.findUnique.mockResolvedValue(null);
    prismaMock.flowUser.upsert.mockResolvedValue({ address: "0xabc", email: "user@example.com" });

    const result = await service.requestLogin("user@example.com");

    expect(result.address).toBe("0xabc");
    expect(result.isNewUser).toBe(true);
    expect(result.verificationToken).toHaveLength(24);
    expect(prismaMock.flowUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: expect.any(String) },
        create: expect.objectContaining({ email: "user@example.com" }),
      })
    );
  });

  it("throws when email is linked to another address", async () => {
    prismaMock.flowUser.findUnique.mockResolvedValue({ address: "0xanother" });

    await expect(service.requestLogin("user@example.com")).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("verifies login and issues session", async () => {
    prismaMock.flowUser.findUnique.mockResolvedValue({
      address: "0xabc",
      email: "user@example.com",
      emailVerificationToken: "token123",
      emailVerificationExpiresAt: new Date(Date.now() + 10_000),
      emailVerifiedAt: null,
      roles: [{ role: "ADMIN" }],
    });

    prismaMock.flowUser.update.mockResolvedValue({
      address: "0xabc",
      email: "user@example.com",
      roles: [{ role: "ADMIN" }],
    });

    flowAuthMock.createSessionForAddress.mockResolvedValue({
      token: "session-token",
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const result = await service.verifyLogin("user@example.com", "token123");

    expect(result.address).toBe("0xabc");
    expect(result.roles).toEqual(["admin"]);
    expect(result.token).toBe("session-token");
  });

  it("fails verification for wrong token", async () => {
    prismaMock.flowUser.findUnique.mockResolvedValue({
      address: "0xabc",
      email: "user@example.com",
      emailVerificationToken: "token123",
      emailVerificationExpiresAt: new Date(Date.now() + 10_000),
      roles: [],
    });

    await expect(service.verifyLogin("user@example.com", "wrong"))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
