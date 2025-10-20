import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";

import { AuthService } from "./auth.service";

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const headerToken = this.getHeaderValue(request, "x-api-token");
    const bearerToken = this.getHeaderValue(request, "authorization");

    const token = headerToken ?? bearerToken?.replace(/^Bearer\s+/i, "");
    this.authService.validateAccessToken(token);
    return true;
  }

  private getHeaderValue(request: Request, name: string): string | undefined {
    const headers = request.headers;
    const key = name.toLowerCase() as keyof typeof headers;
    const value = headers[key];

    if (Array.isArray(value)) {
      return value[0];
    }

    if (typeof value === "string") {
      return value;
    }

    return undefined;
  }
}
