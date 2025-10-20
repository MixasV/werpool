import { ForbiddenException, Injectable } from "@nestjs/common";

@Injectable()
export class AuthService {
  private readonly token = process.env.API_ACCESS_TOKEN;

  validateAccessToken(token?: string): void {
    if (!this.token) {
      return;
    }

    if (!token || token !== this.token) {
      throw new ForbiddenException("Invalid API token");
    }
  }
}
