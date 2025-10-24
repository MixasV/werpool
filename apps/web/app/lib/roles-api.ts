/**
 * API Client for Role Purchase
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface RolePurchaseRequest {
  id: string;
  userAddress: string;
  role: string;
  pointsSpent: number;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'COMPLETED';
  createdAt: string;
  processedAt?: string | null;
  processedBy?: string | null;
  notes?: string | null;
}

/**
 * Request a PATROL role purchase for 20,000 points
 */
export async function requestRolePurchase(): Promise<RolePurchaseRequest> {
  const response = await fetch(`${API_BASE_URL}/roles/purchase`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to request role purchase');
  }

  return response.json();
}

/**
 * Get user's role purchase requests
 */
export async function getUserRolePurchases(): Promise<RolePurchaseRequest[]> {
  const response = await fetch(`${API_BASE_URL}/roles/purchase`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch role purchases');
  }

  return response.json();
}

/**
 * Get user's role purchase requests (alias)
 */
export async function fetchMyRolePurchaseRequests(): Promise<RolePurchaseRequest[]> {
  return getUserRolePurchases();
}

/**
 * Get all role purchase requests (admin only)
 */
export async function getAllRolePurchases(status?: string): Promise<RolePurchaseRequest[]> {
  const url = new URL(`${API_BASE_URL}/admin/role-purchase`);
  if (status) {
    url.searchParams.set('status', status);
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch all role purchases');
  }

  return response.json();
}

/**
 * Approve a role purchase request (admin only)
 */
export async function approveRolePurchase(id: string, notes?: string): Promise<RolePurchaseRequest> {
  const response = await fetch(`${API_BASE_URL}/admin/role-purchase/${id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to approve request');
  }

  return response.json();
}

/**
 * Decline a role purchase request (admin only)
 */
export async function declineRolePurchase(id: string, notes?: string): Promise<RolePurchaseRequest> {
  const response = await fetch(`${API_BASE_URL}/admin/role-purchase/${id}/decline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to decline request');
  }

  return response.json();
}

// Types for role assignments
export type RoleType = 'ADMIN' | 'PATROL' | 'ORACLE' | 'MARKET_MAKER';

export interface FlowUser {
  address: string;
  roles: RoleType[];
}

export interface RoleAssignment {
  id: string;
  address: string;
  role: RoleType;
  grantedAt: string;
  grantedBy: string;
  createdAt?: string;
}

/**
 * Fetch role assignments (admin only)
 */
export async function fetchRoleAssignments(): Promise<RoleAssignment[]> {
  const response = await fetch(`${API_BASE_URL}/roles/assignments`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch role assignments');
  }

  return response.json();
}

/**
 * Fetch role directory (admin only)
 */
export async function fetchRoleDirectory(): Promise<FlowUser[]> {
  const response = await fetch(`${API_BASE_URL}/roles/directory`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch role directory');
  }

  return response.json();
}

/**
 * Assign a role to a user (admin only)
 */
export async function assignRole(address: string, role: RoleType): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/roles/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address, role }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to assign role');
  }
}

/**
 * Revoke a role from a user (admin only)
 */
export async function revokeRole(address: string, role: RoleType): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/roles/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address, role }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to revoke role');
  }
}

/**
 * Grant role onchain (admin only)
 */
export async function grantRoleOnchain(data: { transactionId: string; label?: string | null }, authOptions?: any): Promise<RoleAssignment> {
  const response = await fetch(`${API_BASE_URL}/roles/grant-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to grant role onchain');
  }

  return response.json();
}

/**
 * Revoke role onchain (admin only)
 */
export async function revokeRoleOnchain(data: { transactionId: string }, authOptions?: any): Promise<RoleAssignment> {
  const response = await fetch(`${API_BASE_URL}/roles/revoke-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to revoke role onchain');
  }

  return response.json();
}
