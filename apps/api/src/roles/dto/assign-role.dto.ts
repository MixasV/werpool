export interface AssignRoleDto {
  address: string;
  role: "admin" | "operator" | "oracle" | "patrol";
  label?: string | null;
}

export interface OnchainRoleDto {
  transactionId: string;
  label?: string | null;
}

export interface RoleDto {
  id: string;
  address: string;
  role: "admin" | "operator" | "oracle" | "patrol";
  createdAt: string;
}

export const toRoleDto = (record: {
  id: string;
  address: string;
  role: string;
  createdAt: Date;
}): RoleDto => ({
  id: record.id,
  address: record.address,
  role: record.role.toLowerCase() as RoleDto["role"],
  createdAt: record.createdAt.toISOString(),
});
