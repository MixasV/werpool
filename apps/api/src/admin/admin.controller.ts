import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AdminService } from "./admin.service";
import { FlowOrApiGuard } from "../auth/flow-or-api.guard";
import { RequireFlowRoles } from "../auth/flow-roles.decorator";
import { CreateWorkflowActionDto } from "./dto/create-workflow-action.dto";
import { UpdateWorkflowActionDto } from "./dto/update-workflow-action.dto";

@Controller("admin")
@UseGuards(FlowOrApiGuard)
@RequireFlowRoles("ADMIN")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("workflows")
  async listWorkflows(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("marketId") marketId?: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.adminService.listWorkflowActions({ status, type, marketId, limit: parsedLimit });
  }

  @Post("workflows")
  async createWorkflow(@Body() payload: CreateWorkflowActionDto) {
    return this.adminService.createWorkflowAction(payload);
  }

  @Patch("workflows/:id")
  async updateWorkflow(
    @Param("id") id: string,
    @Body() payload: UpdateWorkflowActionDto
  ) {
    return this.adminService.updateWorkflowAction(id, payload);
  }

  @Post("workflows/:id/execute")
  async executeWorkflow(
    @Param("id") id: string,
    @Body("metadata") metadata?: Record<string, unknown>
  ) {
    return this.adminService.executeWorkflowAction(id, metadata);
  }

  @Delete("workflows/:id")
  async deleteWorkflow(@Param("id") id: string) {
    await this.adminService.deleteWorkflowAction(id);
    return { success: true } as const;
  }

  @Get("patrol/signals")
  async listPatrolSignals(
    @Query("marketId") marketId?: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.adminService.listPatrolSignals({ marketId, limit: parsedLimit });
  }
}
