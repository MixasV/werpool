"use client";

import * as fcl from "@onflow/fcl";

import { GRANT_ROLE_TRANSACTION } from "./transactions/grant-role";
import { REVOKE_ROLE_TRANSACTION } from "./transactions/revoke-role";
import { SETUP_ROLE_STORAGE_TRANSACTION } from "./transactions/setup-role-storage";
import { CAN_RECEIVE_ROLES_SCRIPT } from "./scripts/can-receive-roles";
import { ROLES_OF_SCRIPT } from "./scripts/roles-of";

const TRANSACTION_LIMIT = Number.parseInt(process.env.NEXT_PUBLIC_FLOW_TX_LIMIT ?? "999", 10);

export type RoleIdentifier = "admin" | "operator" | "oracle" | "patrol";

const normalizeAddress = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const formatRoleArgument = (role: RoleIdentifier): string => role.toUpperCase();

export const sendSetupRoleStorage = async (): Promise<string> => {
  const txId = await fcl.mutate({
    cadence: SETUP_ROLE_STORAGE_TRANSACTION,
    limit: TRANSACTION_LIMIT,
  });

  await fcl.tx(txId).onceSealed();
  return txId;
};

export const sendGrantRole = async (role: RoleIdentifier, targetAddress: string): Promise<string> => {
  const txId = await fcl.mutate({
    cadence: GRANT_ROLE_TRANSACTION,
    limit: TRANSACTION_LIMIT,
    args: (arg, t) => [
      arg(formatRoleArgument(role), t.String),
      arg(normalizeAddress(targetAddress), t.Address),
    ],
  });

  await fcl.tx(txId).onceSealed();
  return txId;
};

export const sendRevokeRole = async (role: RoleIdentifier, targetAddress: string): Promise<string> => {
  const txId = await fcl.mutate({
    cadence: REVOKE_ROLE_TRANSACTION,
    limit: TRANSACTION_LIMIT,
    args: (arg, t) => [
      arg(formatRoleArgument(role), t.String),
      arg(normalizeAddress(targetAddress), t.Address),
    ],
  });

  await fcl.tx(txId).onceSealed();
  return txId;
};

export const canReceiveRoles = async (address: string): Promise<boolean> => {
  const result = await fcl.query({
    cadence: CAN_RECEIVE_ROLES_SCRIPT,
    args: (arg, t) => [arg(normalizeAddress(address), t.Address)],
  });
  return Boolean(result);
};

export const fetchRolesOnChain = async (address: string): Promise<RoleIdentifier[]> => {
  const raw = await fcl.query({
    cadence: ROLES_OF_SCRIPT,
    args: (arg, t) => [arg(normalizeAddress(address), t.Address)],
  });

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase() as RoleIdentifier);
};
