import type { FlowUser, RoleAssignment } from "@prisma/client";

import { toRoleDto, type RoleDto } from "./assign-role.dto";

export interface FlowUserDto {
  address: string;
  label: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  roles: RoleDto[];
}

export const toFlowUserDto = (
  record: FlowUser & { roles: RoleAssignment[] }
): FlowUserDto => ({
  address: record.address,
  label: record.label ?? null,
  firstSeenAt: record.firstSeenAt.toISOString(),
  lastSeenAt: record.lastSeenAt ? record.lastSeenAt.toISOString() : null,
  roles: record.roles
    .map((role) => toRoleDto(role))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
});
