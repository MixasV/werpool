import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";

import {
  CompositeSignature,
  FlowAuthService,
  FlowChallenge,
  FlowSessionResult,
} from "./flow-auth.service";

interface ChallengeRequestBody {
  address: string;
}

interface VerifyRequestBody {
  address: string;
  nonce: string;
  signatures: CompositeSignature[];
}

@Controller("auth/flow")
export class FlowAuthController {
  constructor(private readonly flowAuth: FlowAuthService) {}

  @Post("challenge")
  async challenge(@Body() body: ChallengeRequestBody): Promise<FlowChallenge> {
    return this.flowAuth.issueChallenge(body.address);
  }

  @Post("verify")
  async verify(
    @Body() body: VerifyRequestBody,
    @Res({ passthrough: true }) res: Response
  ): Promise<FlowSessionResult> {
    const result = await this.flowAuth.verifySignature(body);

    res.cookie(this.flowAuth.cookieName, result.token, {
      ...this.flowAuth.getSessionCookieOptions(),
    });

    return result;
  }

  @Get("me")
  async me(@Req() req: Request): Promise<Omit<FlowSessionResult, "token">> {
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException("Missing session token");
    }

    const session = await this.flowAuth.verifySessionToken(token);

    return {
      address: session.address,
      roles: session.roles.map((role) => role.toLowerCase()),
      expiresAt: session.expiresAt,
    };
  }

  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ success: true }> {
    const token = this.extractToken(req);
    if (token) {
      await this.flowAuth.invalidateSession(token);
    }

    res.cookie(this.flowAuth.cookieName, "", {
      ...this.flowAuth.getSessionCookieOptions(),
      maxAge: 0,
    });

    return { success: true } as const;
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (typeof authorization === "string") {
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    const cookiesHeader = request.headers.cookie;
    if (typeof cookiesHeader === "string") {
      const tokens = cookiesHeader
        .split(";")
        .map((entry) => entry.trim())
        .map((entry) => entry.split("="))
        .filter((parts): parts is [string, string] => parts.length === 2);

      for (const [name, value] of tokens) {
        if (name === this.flowAuth.cookieName) {
          const decoded = decodeURIComponent(value);
          if (decoded.trim().length > 0) {
            return decoded;
          }
        }
      }
    }

    return null;
  }
}
