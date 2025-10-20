import { Body, Controller, Post } from "@nestjs/common";

import { CustodialAuthService } from "./custodial-auth.service";

interface CustodialRequestDto {
  email: string;
}

interface CustodialVerifyDto {
  email: string;
  token: string;
}

@Controller("auth/custodial")
export class CustodialAuthController {
  constructor(private readonly custodialAuth: CustodialAuthService) {}

  @Post("request")
  async request(@Body() body: CustodialRequestDto) {
    const result = await this.custodialAuth.requestLogin(body.email);
    return {
      address: result.address,
      verificationToken: result.verificationToken,
      expiresAt: result.expiresAt.toISOString(),
      isNewUser: result.isNewUser,
    };
  }

  @Post("verify")
  async verify(@Body() body: CustodialVerifyDto) {
    const result = await this.custodialAuth.verifyLogin(body.email, body.token);
    return {
      token: result.token,
      address: result.address,
      roles: result.roles,
      expiresAt: result.expiresAt.toISOString(),
      isNewUser: result.isNewUser,
    };
  }
}
