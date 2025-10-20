import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { RoleType } from "@prisma/client";
import { randomBytes, createHash } from "crypto";
import * as fcl from "@onflow/fcl";

import { PrismaService } from "../prisma/prisma.service";
import { normalizeFlowAddress } from "../common/flow-address.util";
import { resolveBackendFlowConfig } from "../common/flow-config.util";

type RoleTypeUpper = RoleType;

export interface CompositeSignature {
  addr: string;
  keyId: number;
  signature: string;
}

export interface FlowSessionPayload {
  sessionId: string;
  address: string;
  roles: RoleTypeUpper[];
  expiresAt: Date;
}

export interface FlowChallenge {
  address: string;
  nonce: string;
  expiresAt: Date;
}

export interface FlowSessionResult {
  token: string;
  address: string;
  roles: string[];
  expiresAt: Date;
}

@Injectable()
export class FlowAuthService {
  private configured = false;

  private readonly challengeTtlMs = Number.parseInt(
    process.env.FLOW_CHALLENGE_TTL_MS ?? "600000",
    10
  );

  private readonly sessionTtlMs = Number.parseInt(
    process.env.FLOW_SESSION_TTL_MS ?? "86400000",
    10
  );

  readonly cookieName = process.env.FLOW_SESSION_COOKIE ?? "flow_session";

  constructor(private readonly prisma: PrismaService) {
    this.configureFcl();
  }

  async issueChallenge(address: string): Promise<FlowChallenge> {
    const normalized = normalizeFlowAddress(address);
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + this.challengeTtlMs);

    const now = new Date();
    const record = await this.prisma.flowUser.upsert({
      where: { address: normalized },
      update: {
        nonce,
        nonceExpiresAt: expiresAt,
        lastSeenAt: now,
      },
      create: {
        address: normalized,
        nonce,
        nonceExpiresAt: expiresAt,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });

    return {
      address: record.address,
      nonce: record.nonce ?? nonce,
      expiresAt,
    };
  }

  async verifySignature(params: {
    address: string;
    nonce: string;
    signatures: CompositeSignature[];
  }): Promise<FlowSessionResult> {
    const normalized = normalizeFlowAddress(params.address);
    const flowUser = await this.prisma.flowUser.findUnique({
      where: { address: normalized },
      include: { roles: true },
    });

    if (!flowUser || !flowUser.nonce || !flowUser.nonceExpiresAt) {
      throw new UnauthorizedException("Challenge not found");
    }

    if (flowUser.nonce !== params.nonce) {
      throw new UnauthorizedException("Nonce mismatch");
    }

    if (flowUser.nonceExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Challenge expired");
    }

    const signatures = this.validateSignatures(params.signatures, normalized);
    const appUtils = (fcl as unknown as {
      AppUtils: {
        verifyUserSignatures: (
          message: string,
          compositeSignatures: CompositeSignature[]
        ) => Promise<boolean>;
      };
    }).AppUtils;
    const isValid = await appUtils.verifyUserSignatures(flowUser.nonce, signatures);

    if (!isValid) {
      throw new UnauthorizedException("Invalid signature");
    }

    const session = await this.createSession(flowUser.address);

    await this.prisma.flowUser.update({
      where: { address: flowUser.address },
      data: {
        nonce: null,
        nonceExpiresAt: null,
        lastSeenAt: new Date(),
      },
    });

    return {
      token: session.token,
      address: flowUser.address,
      roles: flowUser.roles.map((role) => role.role.toLowerCase()),
      expiresAt: session.expiresAt,
    };
  }

  async verifySessionToken(token: string): Promise<FlowSessionPayload> {
    if (!token) {
      throw new UnauthorizedException("Missing session token");
    }

    const hash = this.hashToken(token);
    const session = await this.prisma.flowSession.findUnique({
      where: { tokenHash: hash },
      include: {
        flowUser: {
          include: { roles: true },
        },
      },
    });

    if (!session || !session.flowUser) {
      throw new UnauthorizedException("Session not found");
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.flowSession.delete({ where: { id: session.id } }).catch(() => undefined);
      throw new UnauthorizedException("Session expired");
    }

    return {
      sessionId: session.id,
      address: session.flowUser.address,
      roles: session.flowUser.roles.map((role) => role.role),
      expiresAt: session.expiresAt,
    };
  }

  async invalidateSession(token: string): Promise<void> {
    if (!token) {
      return;
    }

    const hash = this.hashToken(token);
    await this.prisma.flowSession.delete({ where: { tokenHash: hash } }).catch(() => undefined);
  }

  async createSessionForAddress(address: string): Promise<{ token: string; expiresAt: Date }> {
    const normalized = normalizeFlowAddress(address);
    return this.createSession(normalized);
  }

  private async createSession(address: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);

    await this.prisma.flowSession.create({
      data: {
        flowUserAddress: address,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  private validateSignatures(
    signatures: CompositeSignature[] | undefined,
    address: string
  ): CompositeSignature[] {
    if (!Array.isArray(signatures) || signatures.length === 0) {
      throw new BadRequestException("signatures are required");
    }

    return signatures.map((signature) => {
      if (
        !signature ||
        typeof signature.addr !== "string" ||
        typeof signature.signature !== "string" ||
        typeof signature.keyId !== "number"
      ) {
        throw new BadRequestException("Invalid signature format");
      }

      const normalizedAddr = normalizeFlowAddress(signature.addr);
      if (normalizedAddr !== address) {
        throw new UnauthorizedException("Signature must match address");
      }

      return {
        addr: normalizedAddr,
        signature: signature.signature,
        keyId: signature.keyId,
      };
    });
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private configureFcl(): void {
    if (this.configured) {
      return;
    }

    const { accessNode, network, contracts } = resolveBackendFlowConfig();

    fcl
      .config()
      .put("accessNode.api", accessNode)
      .put("flow.network", network)
      .put("0xCoreMarketHub", contracts.coreMarketHub)
      .put("0xLMSRAmm", contracts.lmsrAmm)
      .put("0xOutcomeToken", contracts.outcomeToken);

    this.configured = true;
  }

  getSessionCookieOptions(): {
    maxAge: number;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
    path: string;
    httpOnly: boolean;
  } {
    const secure = (process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true";
    return {
      maxAge: this.sessionTtlMs / 1000,
      sameSite: "lax",
      secure,
      path: "/",
      httpOnly: true,
    };
  }
}
