import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  ProfileVisibility,
  TradeHistoryVisibility,
  RoleType,
} from "@prisma/client";
import { randomBytes } from "crypto";

import { PrismaService } from "../prisma/prisma.service";
import { normalizeFlowAddress } from "../common/flow-address.util";
import { toUserProfileDto, type UserProfileDto } from "./dto/user-profile.dto";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";
import { UpdatePrivacySettingsDto } from "./dto/update-privacy.dto";
import type { FlowSessionPayload } from "../auth/flow-auth.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class UsersService {
  private readonly emailVerificationTtlMs = Number.parseInt(
    process.env.EMAIL_VERIFICATION_TTL_MS ?? "86400000",
    10
  );

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(address: string): Promise<UserProfileDto> {
    const record = await this.findUserWithRoles(address);
    return toUserProfileDto(record);
  }

  async getProfileForAddress(
    targetAddress: string,
    session?: FlowSessionPayload | null
  ): Promise<UserProfileDto> {
    const record = await this.findUserWithRoles(targetAddress);
    const viewerAddress = session ? normalizeFlowAddress(session.address) : null;
    const isAdmin = (session?.roles ?? []).includes("ADMIN" as RoleType);
    const isSelf = viewerAddress === record.address;

    switch (record.profileVisibility) {
      case ProfileVisibility.PRIVATE: {
        if (!isSelf && !isAdmin) {
          throw new ForbiddenException("Профиль скрыт приватными настройками");
        }
        break;
      }
      case ProfileVisibility.NETWORK: {
        if (!session && !isAdmin) {
          throw new ForbiddenException("Просмотр доступен только авторизованным пользователям");
        }
        break;
      }
      default:
        break;
    }

    if (!isSelf) {
      // Обновляем timestamp просмотра без изменения приватных данных
      try {
        await this.touchUser(record.address);
      } catch {
        // игнорируем ошибки обновления таймстампа
      }
    }

    return toUserProfileDto(record);
  }

  async updateProfile(address: string, payload: UpdateUserProfileDto): Promise<{
    profile: UserProfileDto;
    verificationToken?: string;
  }> {
    const normalizedAddress = normalizeFlowAddress(address);
    const update: Prisma.FlowUserUpdateInput = {
      lastSeenAt: new Date(),
    };

    if (payload.label !== undefined) {
      const label = payload.label ? payload.label.trim() : null;
      update.label = label && label.length > 0 ? label : null;
    }

    if (payload.bio !== undefined) {
      const bio = payload.bio ? payload.bio.trim() : null;
      if (bio && bio.length > 512) {
        throw new BadRequestException("bio не должно превышать 512 символов");
      }
      update.bio = bio && bio.length > 0 ? bio : null;
    }

    if (payload.avatarUrl !== undefined) {
      const avatar = payload.avatarUrl ? payload.avatarUrl.trim() : null;
      if (avatar && !/^https?:\/\//i.test(avatar)) {
        throw new BadRequestException("avatarUrl должен быть абсолютным URL");
      }
      update.avatarUrl = avatar && avatar.length > 0 ? avatar : null;
    }

    if (payload.marketingOptIn !== undefined) {
      update.marketingOptIn = !!payload.marketingOptIn;
    }

    let verificationToken: string | undefined;

    if (payload.email !== undefined) {
      if (!payload.email || payload.email.trim().length === 0) {
        update.email = null;
        update.emailVerifiedAt = null;
        update.emailVerificationToken = null;
        update.emailVerificationExpiresAt = null;
      } else {
        const normalizedEmail = payload.email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
          throw new BadRequestException("Неверный формат email");
        }

        const { token, expiresAt } = this.generateEmailVerificationToken();
        verificationToken = token;
        update.email = normalizedEmail;
        update.emailVerifiedAt = null;
        update.emailVerificationToken = token;
        update.emailVerificationExpiresAt = expiresAt;
      }
    }

    let record;
    try {
      record = await this.prisma.flowUser.update({
        where: { address: normalizedAddress },
        data: update,
        include: { roles: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }

    if (!record) {
      throw new NotFoundException(`Пользователь ${normalizedAddress} не найден`);
    }

    return {
      profile: toUserProfileDto(record),
      verificationToken,
    };
  }

  async updatePrivacy(
    address: string,
    payload: UpdatePrivacySettingsDto
  ): Promise<UserProfileDto> {
    const normalizedAddress = normalizeFlowAddress(address);
    const update: Prisma.FlowUserUpdateInput = {
      lastSeenAt: new Date(),
    };

    if (payload.profileVisibility !== undefined) {
      const parsed = this.parseProfileVisibility(payload.profileVisibility);
      update.profileVisibility = parsed;
    }

    if (payload.tradeHistoryVisibility !== undefined) {
      const parsed = this.parseTradeHistoryVisibility(payload.tradeHistoryVisibility);
      update.tradeHistoryVisibility = parsed;
    }

    const record = await this.prisma.flowUser
      .update({
        where: { address: normalizedAddress },
        data: update,
        include: { roles: true },
      })
      .catch((error) => {
        this.handlePrismaError(error);
        return undefined;
      });

    if (!record) {
      throw new NotFoundException(`Пользователь ${normalizedAddress} не найден`);
    }

    return toUserProfileDto(record);
  }

  async requestEmailVerification(address: string): Promise<{
    verificationToken: string;
    expiresAt: string;
  }> {
    const user = await this.findUser(address);
    if (!user.email) {
      throw new BadRequestException("Сначала укажите email");
    }

    const { token, expiresAt } = this.generateEmailVerificationToken();

    await this.prisma.flowUser.update({
      where: { address: user.address },
      data: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: expiresAt,
      },
    });

    return {
      verificationToken: token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyEmail(address: string, token: string): Promise<UserProfileDto> {
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new BadRequestException("token обязателен");
    }

    const user = await this.findUserWithRoles(address);
    if (!user.emailVerificationToken) {
      throw new BadRequestException("Нет активного запроса подтверждения email");
    }

    if (user.emailVerificationToken !== token) {
      throw new ForbiddenException("Неверный токен подтверждения email");
    }

    if (
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("Срок действия токена подтверждения истёк");
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

    return toUserProfileDto(updated);
  }

  private async findUser(address: string) {
    const normalized = normalizeFlowAddress(address);
    const record = await this.prisma.flowUser.findUnique({ where: { address: normalized } });
    if (!record) {
      throw new NotFoundException(`Пользователь ${normalized} не найден`);
    }
    return record;
  }

  private async findUserWithRoles(address: string) {
    const normalized = normalizeFlowAddress(address);
    const record = await this.prisma.flowUser.findUnique({
      where: { address: normalized },
      include: { roles: true },
    });
    if (!record) {
      throw new NotFoundException(`Пользователь ${normalized} не найден`);
    }
    return record;
  }

  private parseProfileVisibility(value: string): ProfileVisibility {
    const normalized = value.trim().toUpperCase();
    if (
      normalized === "PUBLIC" ||
      normalized === "PRIVATE" ||
      normalized === "NETWORK"
    ) {
      return normalized as ProfileVisibility;
    }
    throw new BadRequestException("profileVisibility должен быть public, private или network");
  }

  private parseTradeHistoryVisibility(value: string): TradeHistoryVisibility {
    const normalized = value.trim().toUpperCase();
    if (
      normalized === "PUBLIC" ||
      normalized === "NETWORK" ||
      normalized === "PRIVATE"
    ) {
      return normalized as TradeHistoryVisibility;
    }
    throw new BadRequestException(
      "tradeHistoryVisibility должен быть public, network или private"
    );
  }

  private generateEmailVerificationToken(): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.emailVerificationTtlMs);
    return { token, expiresAt };
  }

  private handlePrismaError(error: unknown): never {
    if (this.isKnownRequestError(error)) {
      if (error.code === "P2002") {
        if (Array.isArray(error.meta?.target) && error.meta?.target.includes("email")) {
          throw new BadRequestException("Этот email уже используется другим аккаунтом");
        }
        if (
          Array.isArray(error.meta?.target) &&
          error.meta?.target.includes("emailVerificationToken")
        ) {
          throw new BadRequestException("Не удалось сгенерировать токен подтверждения, повторите попытку");
        }
      }
      if (error.code === "P2025") {
        throw new NotFoundException("Пользователь не найден");
      }
    }
    throw error instanceof Error ? error : new Error("Неизвестная ошибка базы данных");
  }

  private isKnownRequestError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError;
  }

  private async touchUser(address: string): Promise<void> {
    await this.prisma.flowUser.update({
      where: { address },
      data: { lastSeenAt: new Date() },
    });
  }
}
