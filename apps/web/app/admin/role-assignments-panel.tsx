"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useFlowWallet } from "../providers/flow-wallet-provider";
import {
  grantRoleOnchain,
  revokeRoleOnchain,
  type RoleAssignment,
  type FlowUser,
} from "../lib/roles-api";
import {
  canReceiveRoles,
  fetchRolesOnChain,
  sendGrantRole,
  sendRevokeRole,
  sendSetupRoleStorage,
  type RoleIdentifier,
} from "../flow/roles-client";

interface RoleAssignmentsPanelProps {
  initialRoles: RoleAssignment[];
  directory: FlowUser[];
}

const AVAILABLE_ROLES: RoleIdentifier[] = ["admin", "operator", "oracle", "patrol"];

const getRoleLabel = (role: RoleIdentifier | RoleAssignment["role"]): string => {
  switch (role) {
    case "admin":
      return "Admin";
    case "operator":
      return "Operator";
    case "oracle":
      return "Oracle";
    case "patrol":
      return "Patrol";
    default:
      return role;
  }
};

const normalizeAddressInput = (value: string): string => value.trim();

const formatDateTime = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export const RoleAssignmentsPanel = ({ initialRoles, directory }: RoleAssignmentsPanelProps) => {
  const router = useRouter();
  const {
    addr,
    loggedIn,
    sessionToken,
    isReady,
    isAuthenticating,
  } = useFlowWallet();

  const [assignments, setAssignments] = useState<RoleAssignment[]>(initialRoles);
  const [flowDirectory, setFlowDirectory] = useState<FlowUser[]>(directory);
  const [addressInput, setAddressInput] = useState("0x");
  const [labelInput, setLabelInput] = useState("");
  const [roleInput, setRoleInput] = useState<RoleIdentifier>("operator");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasRoleStorage, setHasRoleStorage] = useState<boolean | null>(null);
  const [isSettingUp, setSettingUp] = useState(false);
  const [isGranting, setGranting] = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [isSyncingRoles, startSyncTransition] = useTransition();

  const authOptions = useMemo(
    () => ({ token: sessionToken, allowApiTokenFallback: false as const }),
    [sessionToken]
  );

  useEffect(() => {
    let cancelled = false;

    if (!addr) {
      setHasRoleStorage(null);
      return () => {
        cancelled = true;
      };
    }

    canReceiveRoles(addr)
      .then((result) => {
        if (!cancelled) {
          setHasRoleStorage(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasRoleStorage(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addr]);

  useEffect(() => {
    setAssignments(initialRoles);
  }, [initialRoles]);

  useEffect(() => {
    setFlowDirectory(directory);
  }, [directory]);

  const handleSetupRoleStorage = async () => {
    if (!loggedIn) {
      setError("Connect your wallet to configure role storage");
      return;
    }

    setError(null);
    setStatus("Configuring role storage…");
    setSettingUp(true);

    try {
      await sendSetupRoleStorage();
      setStatus("Role storage configured");
      setHasRoleStorage(true);
      router.refresh();
    } catch (setupError) {
      const message =
        setupError instanceof Error ? setupError.message : "Failed to configure role storage";
      setError(message);
    } finally {
      setSettingUp(false);
    }
  };

  const handleGrantRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const targetAddress = normalizeAddressInput(addressInput);
    const normalizedLabel = labelInput.trim().length > 0 ? labelInput.trim() : null;
    if (!targetAddress) {
      setError("Enter a Flow account address");
      return;
    }

    setError(null);
    setStatus("Signing role grant transaction…");
    setGranting(true);

    try {
      const txId = await sendGrantRole(roleInput, targetAddress);
      setStatus("Syncing role assignment with backend…");
      const assignment = await grantRoleOnchain({ transactionId: txId, label: normalizedLabel }, authOptions);
      setAssignments((prev) => {
        const next = prev.filter((item) => item.id !== assignment.id);
        return [assignment, ...next];
      });
      setFlowDirectory((prev) => {
        const existing = prev.find((item) => item.address.toLowerCase() === assignment.address.toLowerCase());
        const updatedRole = assignment;
        if (!existing) {
          return [
            {
              address: assignment.address,
              label: normalizedLabel,
              firstSeenAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
              roles: [updatedRole],
            },
            ...prev,
          ];
        }

        const nextRoles = existing.roles.filter((role) => role.id !== updatedRole.id);
        nextRoles.unshift(updatedRole);

        return prev
          .map((item) =>
            item.address.toLowerCase() === assignment.address.toLowerCase()
              ? {
                  ...item,
                  lastSeenAt: new Date().toISOString(),
                  label: normalizedLabel ?? item.label,
                  roles: nextRoles,
                }
              : item
          )
          .sort((a, b) => (b.lastSeenAt ?? b.firstSeenAt).localeCompare(a.lastSeenAt ?? a.firstSeenAt));
      });
      setStatus("Role granted successfully");
      router.refresh();
      setLabelInput("");
    } catch (grantError) {
      const message =
        grantError instanceof Error ? grantError.message : "Failed to grant role";
      setError(message);
    } finally {
      setGranting(false);
    }
  };

  const handleRevokeRole = async (assignment: RoleAssignment) => {
    setError(null);
    setStatus("Signing role revoke transaction…");
    setPendingRevokeId(assignment.id);

    try {
      const txId = await sendRevokeRole(assignment.role as RoleIdentifier, assignment.address);
      setStatus("Removing role from system…");
      const removed = await revokeRoleOnchain({ transactionId: txId }, authOptions);
      setAssignments((prev) => prev.filter((item) => item.id !== removed.id));
      setFlowDirectory((prev) =>
        prev.map((item) =>
          item.address.toLowerCase() === removed.address.toLowerCase()
            ? {
                ...item,
                roles: item.roles.filter((role) => role.id !== removed.id),
              }
            : item
        )
      );
      setStatus("Role revoked");
      router.refresh();
    } catch (revokeError) {
      const message =
        revokeError instanceof Error ? revokeError.message : "Failed to revoke role";
      setError(message);
    } finally {
      setPendingRevokeId(null);
    }
  };

  const syncCurrentRoles = () => {
    if (!addr) {
      return;
    }
    startSyncTransition(async () => {
      try {
        const result = await fetchRolesOnChain(addr);
        const owned = result.length > 0 ? result.join(", ") : null;
        setStatus(
          owned ? `Roles on your account: ${owned}` : "Account has no active roles"
        );
      } catch (syncError) {
        const message =
          syncError instanceof Error ? syncError.message : "Failed to fetch on-chain roles";
        setError(message);
      }
    });
  };

  return (
    <>
      <form className="admin-form" onSubmit={handleGrantRole}>
        <div className="admin-form__grid">
          <label>
            <span>Flow address</span>
            <input
              name="address"
              type="text"
              placeholder="0xabc..."
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Account label</span>
            <input
              name="label"
              type="text"
              placeholder="Admin wallet"
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
            />
          </label>
          <label>
            <span>Role</span>
            <select
              name="role"
              value={roleInput}
              onChange={(event) => setRoleInput(event.target.value as RoleIdentifier)}
              required
            >
              {AVAILABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-form__actions">
          <button
            type="submit"
            className="button primary"
            disabled={isGranting || !loggedIn || isAuthenticating}
          >
            {isGranting ? "Granting…" : "Grant role"}
          </button>
        </div>
      </form>

      <div className="admin-hint">
        <p className="muted">
          The target address must set up role storage beforehand. They can do it via the button
          below after connecting their wallet.
        </p>
        <div className="admin-hint__actions">
          <button
            type="button"
            className="button tertiary"
            onClick={handleSetupRoleStorage}
            disabled={!loggedIn || isSettingUp || isAuthenticating || !isReady}
          >
            {isSettingUp ? "Configuring…" : "Set up role storage"}
          </button>
          <button
            type="button"
            className="button tertiary"
            onClick={syncCurrentRoles}
            disabled={!loggedIn || isSyncingRoles}
          >
            {isSyncingRoles ? "Syncing…" : "Check wallet roles"}
          </button>
        </div>
        {loggedIn && hasRoleStorage === false && (
          <p className="error-text">Role storage has not been set up for this account yet.</p>
        )}
      </div>

      {status && <p className="status-text">{status}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="admin-table">
        <div className="admin-table__header">
          <span>Address</span>
          <span>Role</span>
          <span>Assigned</span>
          <span aria-hidden />
        </div>
        {assignments.length === 0 ? (
          <p className="muted">No roles assigned yet.</p>
        ) : (
          assignments.map((assignment) => (
            <div key={assignment.id} className="admin-table__row">
              <span>{assignment.address}</span>
              <span className="admin-badge">{getRoleLabel(assignment.role)}</span>
              <span>{formatDateTime(assignment.createdAt)}</span>
              <button
                type="button"
                className="button tertiary"
                onClick={() => handleRevokeRole(assignment)}
                disabled={pendingRevokeId === assignment.id}
              >
                {pendingRevokeId === assignment.id ? "Revoking…" : "Revoke"}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="admin-table admin-table--directory">
        <div className="admin-table__header">
          <span>Address</span>
          <span>Label</span>
          <span>Roles</span>
          <span>Last activity</span>
        </div>
        {flowDirectory.length === 0 ? (
          <p className="muted">No Flow accounts have been registered yet.</p>
        ) : (
          flowDirectory.map((user) => (
            <div key={user.address} className="admin-table__row admin-table__row--directory">
              <span>{user.address}</span>
              <span className={user.label ? "" : "admin-table__roles--muted"}>
                {user.label ?? "—"}
              </span>
              <span className="admin-table__roles-list">
                {user.roles.length === 0 ? (
                  <span className="admin-table__roles-empty">No roles</span>
                ) : (
                  user.roles.map((role) => (
                    <span key={role.id} className="admin-badge">
                      {getRoleLabel(role.role)}
                    </span>
                  ))
                )}
              </span>
              <span>{formatDateTime(user.lastSeenAt ?? user.firstSeenAt)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
};
