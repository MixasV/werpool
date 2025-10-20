import type { FlowUser, RoleAssignment } from "@prisma/client";

export interface UserProfileDto {
  address: string;
  label: string | null;
  bio: string | null;
  avatarUrl: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  marketingOptIn: boolean;
  profileVisibility: "public" | "private" | "network";
  tradeHistoryVisibility: "private" | "network" | "public";
  firstSeenAt: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: Array<{
    id: string;
    role: "admin" | "operator" | "oracle" | "patrol";
    createdAt: string;
  }>;
  pendingEmailVerification: boolean;
}

export const toUserProfileDto = (
  record: FlowUser & { roles: RoleAssignment[] }
): UserProfileDto => ({
  address: record.address,
  label: record.label ?? null,
  bio: record.bio ?? null,
  avatarUrl: record.avatarUrl ?? null,
  email: record.email ?? null,
  emailVerifiedAt: record.emailVerifiedAt ? record.emailVerifiedAt.toISOString() : null,
  marketingOptIn: record.marketingOptIn ?? false,
  profileVisibility: record.profileVisibility.toLowerCase() as UserProfileDto["profileVisibility"],
  tradeHistoryVisibility: record.tradeHistoryVisibility.toLowerCase() as UserProfileDto["tradeHistoryVisibility"],
  firstSeenAt: record.firstSeenAt.toISOString(),
  lastSeenAt: record.lastSeenAt ? record.lastSeenAt.toISOString() : null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  roles: record.roles
    .map((role) => ({
      id: role.id,
      role: role.role.toLowerCase() as UserProfileDto["roles"][number]["role"],
      createdAt: role.createdAt.toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  pendingEmailVerification:
    !!record.emailVerificationToken &&
    (!record.emailVerificationExpiresAt || record.emailVerificationExpiresAt.getTime() > Date.now()),
});
