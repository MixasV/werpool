import { RolePurchaseStatus } from "@prisma/client";

export interface RolePurchaseRequestDto {
  id: string;
  userAddress: string;
  role: "patrol";
  pointsSpent: number;
  status: RolePurchaseStatus;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  notes?: string | null;
}

export const toRolePurchaseDto = (record: {
  id: string;
  userAddress: string;
  role: string;
  pointsSpent: { toNumber(): number } | number;
  status: RolePurchaseStatus;
  createdAt: Date;
  processedAt: Date | null;
  processedBy: string | null;
  notes: string | null;
}): RolePurchaseRequestDto => ({
  id: record.id,
  userAddress: record.userAddress,
  role: record.role.toLowerCase() as "patrol",
  pointsSpent:
    typeof record.pointsSpent === "number"
      ? record.pointsSpent
      : (record.pointsSpent as { toNumber(): number }).toNumber(),
  status: record.status,
  createdAt: record.createdAt.toISOString(),
  processedAt: record.processedAt?.toISOString(),
  processedBy: record.processedBy ?? undefined,
  notes: record.notes,
});
