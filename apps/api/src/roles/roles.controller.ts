import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { RolesService } from "./roles.service";
import { AssignRoleDto, OnchainRoleDto, RoleDto } from "./dto/assign-role.dto";
import { FlowUserDto } from "./dto/flow-user.dto";
import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";

@Controller("admin/roles")
@UseGuards(FlowOrApiGuard)
@RequireFlowRoles("ADMIN")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async listRoles(): Promise<RoleDto[]> {
    return this.rolesService.list();
  }

  @Get("directory")
  async listDirectory(): Promise<FlowUserDto[]> {
    return this.rolesService.directory();
  }

  @Post()
  async assignRole(@Body() payload: AssignRoleDto): Promise<RoleDto> {
    return this.rolesService.assign(payload);
  }

  @Post("grant")
  async grantRoleOnchain(@Body() payload: OnchainRoleDto): Promise<RoleDto> {
    return this.rolesService.grantOnchain(payload);
  }

  @Post("revoke")
  async revokeRoleOnchain(@Body() payload: OnchainRoleDto): Promise<RoleDto> {
    return this.rolesService.revokeOnchain(payload);
  }

  @Delete(":id")
  async revokeRole(@Param("id") id: string): Promise<{ success: true }> {
    await this.rolesService.revoke(id);
    return { success: true } as const;
  }
}
