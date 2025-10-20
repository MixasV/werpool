import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { UsersService } from "./users.service";
import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";
import { UpdatePrivacySettingsDto } from "./dto/update-privacy.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import type { FlowSessionPayload } from "../auth/flow-auth.service";

type RequestWithSession = Request & { flowSession?: FlowSessionPayload };

@Controller("users")
@UseGuards(FlowOrApiGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async me(@Req() req: RequestWithSession) {
    const session = this.requireSession(req);
    return this.usersService.getProfile(session.address);
  }

  @Patch("me")
  async updateProfile(
    @Req() req: RequestWithSession,
    @Body() payload: UpdateUserProfileDto
  ) {
    const session = this.requireSession(req);
    return this.usersService.updateProfile(session.address, payload);
  }

  @Patch("me/privacy")
  async updatePrivacy(
    @Req() req: RequestWithSession,
    @Body() payload: UpdatePrivacySettingsDto
  ) {
    const session = this.requireSession(req);
    return this.usersService.updatePrivacy(session.address, payload);
  }

  @Post("me/email/request")
  async requestEmailVerification(@Req() req: RequestWithSession) {
    const session = this.requireSession(req);
    return this.usersService.requestEmailVerification(session.address);
  }

  @Post("me/email/verify")
  async verifyEmail(
    @Req() req: RequestWithSession,
    @Body() payload: VerifyEmailDto
  ) {
    const session = this.requireSession(req);
    return this.usersService.verifyEmail(session.address, payload.token);
  }

  @Get(":address")
  async profile(
    @Param("address") address: string,
    @Req() req: RequestWithSession
  ) {
    const session = req.flowSession ?? null;
    return this.usersService.getProfileForAddress(address, session);
  }

  private requireSession(req: RequestWithSession): FlowSessionPayload {
    if (!req.flowSession) {
      throw new UnauthorizedException("Требуется авторизация через Flow сессию");
    }
    return req.flowSession;
  }
}
