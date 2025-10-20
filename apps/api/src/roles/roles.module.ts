import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { FlowRolesService } from "./flow-roles.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RolesController],
  providers: [RolesService, FlowRolesService],
  exports: [RolesService],
})
export class RolesModule {}
