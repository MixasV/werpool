import { Module } from "@nestjs/common";

import { AuthService } from "./auth.service";
import { FlowAuthService } from "./flow-auth.service";
import { FlowAuthController } from "./flow-auth.controller";
import { CustodialAuthService } from "./custodial-auth.service";
import { CustodialAuthController } from "./custodial-auth.controller";
import { FlowOrApiGuard } from "./flow-or-api.guard";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [FlowAuthController, CustodialAuthController],
  providers: [AuthService, FlowAuthService, CustodialAuthService, FlowOrApiGuard],
  exports: [AuthService, FlowAuthService, CustodialAuthService, FlowOrApiGuard],
})
export class AuthModule {}
