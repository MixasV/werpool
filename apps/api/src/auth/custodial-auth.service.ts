import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";

import { PrismaService } from "../prisma/prisma.service";
import { FlowAuthService } from "./flow-auth.service";
import { normalizeFlowAddress } from "../common/flow-address.util";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

interface CustodialLoginRequest {
  address: string;
  verificationToken: string;
  expiresAt: Date;
  isNewUser: boolean;
}

interface CustodialLoginVerification {
  token: string;
  address: string;
  roles: string[];
  expiresAt: Date;
  isNewUser: boolean;
}

@Injectable()
export class CustodialAuthService {
  private readonly verificationTtlMs = Number.parseInt(
    process.env.CUSTODIAL_VERIFICATION_TTL_MS ?? "900000",
    10
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowAuth: FlowAuthService
  ) {}

  async requestLogin(email: string): Promise<CustodialLoginRequest> {
    const normalizedEmail = this.normalizeEmail(email);
    const now = new Date();
    const address = this.deriveCustodialAddress(normalizedEmail);

    const existingByEmail = await this.prisma.flowUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail && existingByEmail.address !== address) {
      throw new BadRequestException("Email уже привязан к другому Flow-аккаунту");
    }

    const verificationToken = this.generateToken();
    const expiresAt = new Date(Date.now() + this.verificationTtlMs);

    const result = await this.prisma.flowUser.upsert({
      where: { address },
      update: {
        email: normalizedEmail,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: expiresAt,
        emailVerifiedAt: null,
        lastSeenAt: now,
        label: existingByEmail?.label ?? "Custodial User",
      },
      create: {
        address,
        email: normalizedEmail,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: expiresAt,
        profileVisibility: "PRIVATE",
        tradeHistoryVisibility: "PRIVATE",
        firstSeenAt: now,
        lastSeenAt: now,
        label: "Custodial User",
      },
    });

    return {
      address: result.address,
      verificationToken,
      expiresAt,
      isNewUser: !existingByEmail,
    } satisfies CustodialLoginRequest;
  }

  async verifyLogin(email: string, token: string): Promise<CustodialLoginVerification> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prisma.flowUser.findUnique({
      where: { email: normalizedEmail },
      include: { roles: true },
    });

    if (!user) {
      throw new UnauthorizedException("Custodial аккаунт не найден");
    }

    if (!user.emailVerificationToken || !user.emailVerificationExpiresAt) {
      throw new UnauthorizedException("Для email не запрошено подтверждение");
    }

    if (user.emailVerificationToken !== token) {
      throw new UnauthorizedException("Неверный токен подтверждения");
    }

    if (user.emailVerificationExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Срок действия токена истёк");
    }

    const updated = await this.prisma.flowUser.update({
      where: { address: user.address },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        lastSeenAt: new Date(),
      },
      include: { roles: true },
    });

    const session = await this.flowAuth.createSessionForAddress(updated.address);

    return {
      token: session.token,
      address: updated.address,
      roles: updated.roles.map((role) => role.role.toLowerCase()),
      expiresAt: session.expiresAt,
      isNewUser: !user.emailVerifiedAt,
    } satisfies CustodialLoginVerification;
  }

  private normalizeEmail(email: string): string {
    if (typeof email !== "string" || email.trim().length === 0) {
      throw new BadRequestException("Требуется адрес email");
    }

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      throw new BadRequestException("Некорректный формат email");
    }
    return normalized;
  }

  private deriveCustodialAddress(email: string): string {
    const digest = createHash("sha256").update(email).digest("hex");
    const suffix = digest.slice(0, 16);
    return normalizeFlowAddress(`0x${suffix}`);
  }

  private generateToken(): string {
    return randomBytes(12).toString("hex");
  }
}
