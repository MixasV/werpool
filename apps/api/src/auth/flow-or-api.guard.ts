import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { Reflector } from "@nestjs/core";
import type { RoleType } from "@prisma/client";

import { AuthService } from "./auth.service";
import { FlowAuthService, FlowSessionPayload } from "./flow-auth.service";
import { FLOW_ROLES_KEY } from "./flow-roles.decorator";

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

@Injectable()
export class FlowOrApiGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly flowAuth: FlowAuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const requiredRoles = this.reflector.getAllAndOverride<RoleType[]>(FLOW_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const sessionToken = this.extractSessionToken(request);
    let sessionError: unknown = null;

    if (sessionToken) {
      try {
        const session = await this.flowAuth.verifySessionToken(sessionToken);
        if (requiredRoles && requiredRoles.length > 0) {
          const hasRole = session.roles.some((role) => requiredRoles.includes(role));
          if (!hasRole) {
            throw new ForbiddenException("Недостаточно прав");
          }
        }
        request.flowSession = session;
        return true;
      } catch (error) {
        sessionError = error;
      }
    }

    const apiToken = this.extractApiToken(request);
    if (apiToken) {
      this.authService.validateAccessToken(apiToken);
      return true;
    }

    if (sessionError) {
      throw sessionError instanceof Error
        ? sessionError
        : new UnauthorizedException("Invalid session");
    }

    throw new ForbiddenException("Требуется авторизация");
  }

  private extractSessionToken(request: Request): string | null {
    const bearer = this.extractBearerToken(request);
    if (bearer) {
      return bearer;
    }

    const cookieHeader = this.getHeaderValue(request, "cookie");
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .map((entry) => entry.split("="))
      .filter((parts): parts is [string, string] => parts.length === 2);

    for (const [name, value] of cookies) {
      if (name === this.flowAuth.cookieName) {
        return decodeURIComponent(value);
      }
    }

    return null;
  }

  private extractApiToken(request: Request): string | null {
    const headerToken = this.getHeaderValue(request, "x-api-token");
    if (headerToken) {
      return headerToken;
    }

    const bearer = this.extractBearerToken(request);
    return bearer;
  }

  private extractBearerToken(request: Request): string | null {
    const authorization = this.getHeaderValue(request, "authorization");
    if (!authorization) {
      return null;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return null;
    }

    const token = match[1]?.trim();
    return token && token.length > 0 ? token : null;
  }

  private getHeaderValue(request: Request, name: string): string | null {
    const header = request.headers[name.toLowerCase() as keyof typeof request.headers];
    if (Array.isArray(header)) {
      return header[0] ?? null;
    }
    if (typeof header === "string") {
      return header;
    }
    return null;
  }
}
