import { SetMetadata } from "@nestjs/common";
import type { RoleType } from "@prisma/client";

export const FLOW_ROLES_KEY = "flow:roles";

export const RequireFlowRoles = (...roles: RoleType[]) => SetMetadata(FLOW_ROLES_KEY, roles);
