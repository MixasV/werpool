import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { PointsModule } from "../points/points.module";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { FlowRolesService } from "./flow-roles.service";
import { RolePurchaseService } from "./role-purchase.service";
import { RolePurchaseController } from "./role-purchase.controller";
import { AdminRolePurchaseController } from "./admin-role-purchase.controller";

@Module({
  imports: [PrismaModule, AuthModule, PointsModule],
  controllers: [RolesController, RolePurchaseController, AdminRolePurchaseController],
  providers: [RolesService, FlowRolesService, RolePurchaseService],
  exports: [RolesService, RolePurchaseService],
})
export class RolesModule {}
