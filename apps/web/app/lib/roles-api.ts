import { API_BASE_URL, parseJson, withAuthHeaders, type AuthOptions } from "./api-client";

export type RoleType = "admin" | "operator" | "oracle" | "patrol";

export interface RoleAssignment {
  id: string;
  address: string;
  role: RoleType;
  createdAt: string;
}

export interface FlowUser {
  address: string;
  label: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  roles: RoleAssignment[];
}

export const fetchRoleAssignments = async (
  auth?: AuthOptions
): Promise<RoleAssignment[]> => {
  const response = await fetch(
    `${API_BASE_URL}/admin/roles`,
    withAuthHeaders({ cache: "no-store" }, auth)
  );
  return parseJson<RoleAssignment[]>(response);
};

export const fetchRoleDirectory = async (
  auth?: AuthOptions
): Promise<FlowUser[]> => {
  const response = await fetch(
    `${API_BASE_URL}/admin/roles/directory`,
    withAuthHeaders({ cache: "no-store" }, auth)
  );

  return parseJson<FlowUser[]>(response);
};

export const assignRole = async (payload: {
  address: string;
  role: RoleType;
  label?: string | null;
}, auth?: AuthOptions): Promise<RoleAssignment> => {
  const response = await fetch(
    `${API_BASE_URL}/admin/roles`,
    withAuthHeaders(
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      auth
    )
  );

  return parseJson<RoleAssignment>(response);
};

export const revokeRole = async (id: string, auth?: AuthOptions): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/admin/roles/${encodeURIComponent(id)}`,
    withAuthHeaders({ method: "DELETE" }, auth)
  );

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`API ${response.status}: ${reason}`);
  }
};

export const grantRoleOnchain = async (
  payload: { transactionId: string; label?: string | null },
  auth?: AuthOptions
): Promise<RoleAssignment> => {
  const response = await fetch(
    `${API_BASE_URL}/admin/roles/grant`,
    withAuthHeaders(
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      auth
    )
  );

  return parseJson<RoleAssignment>(response);
};

export const revokeRoleOnchain = async (
  payload: { transactionId: string },
  auth?: AuthOptions
): Promise<RoleAssignment> => {
  const response = await fetch(
    `${API_BASE_URL}/admin/roles/revoke`,
    withAuthHeaders(
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      auth
    )
  );

  return parseJson<RoleAssignment>(response);
};
