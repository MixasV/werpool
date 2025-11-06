import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  fetchMarkets,
  activateMarket,
  suspendMarket,
  closeMarket,
  voidMarket,
  settleMarket,
  overrideSettlement,
  updateMarketSchedule,
  updatePatrolThreshold,
  recordPatrolSignal,
  clearPatrolSignal,
  type MarketSummary,
  type MarketState,
  type SuspendMarketPayload,
  type SettleMarketPayload,
  type OverrideSettlementPayload,
  type CloseMarketPayload,
  type UpdateMarketSchedulePayload,
  type UpdatePatrolThresholdPayload,
  type RecordPatrolSignalPayload,
  type ClearPatrolSignalPayload,
  fetchMarketPoolState,
  createMarketPool,
  mintOutcomeTokens,
  burnOutcomeTokens,
  syncMarketPoolState,
  fetchMarketStorage,
  fetchMarketTransactions,
  type MarketPoolState,
  type MarketStorageMetadata,
  type MarketTransactionLog,
} from "../lib/markets-api";
import {
  fetchRoleAssignments,
  fetchRoleDirectory,
  assignRole,
  revokeRole,
  type RoleAssignment,
  type RoleType,
  type FlowUser,
} from "../lib/roles-api";
import {
  fetchMonitoringSnapshot,
  sendMonitoringTestAlert,
  type MonitoringSnapshot,
} from "../lib/monitoring-api";
import {
  fetchSchedulerTasks,
  runSchedulerTask,
  runDueSchedulerTasks,
  type SchedulerTask,
  type SchedulerTaskType,
} from "../lib/scheduler-api";
import {
  awardPoints,
  captureLeaderboardSnapshot,
  fetchLeaderboard,
  fetchLeaderboardSnapshots,
  type LeaderboardEntry,
  type LeaderboardSnapshot,
  type PointEventSource,
} from "../lib/points-api";
import {
  createMarketsForNewRuns,
  settleCompletedMarkets,
  fetchFastBreakMarkets,
  type FastBreakMarket,
} from "../lib/fastbreak-api";
import { RoleAssignmentsPanel } from "./role-assignments-panel";
import { RolePurchaseRequestsPanel } from "./role-purchase-requests-panel";
import { MarketTransactionLogPanel } from "../components/market-transaction-log-panel";
import { fetchMyProfile } from "../lib/users-api";

const ADMIN_PATH = "/admin";

export const dynamic = "force-dynamic";

const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";

const getSessionAuth = () => {
  const store = cookies();
  const token = store.get(sessionCookieName)?.value ?? null;
  return {
    token,
    allowApiTokenFallback: false as const,
  };
};

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

const formatNumber = (value: number): string =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        maximumFractionDigits: value < 1 ? 4 : 2,
      })
    : String(value);

const stateLabel: Record<MarketState, string> = {
  draft: "Draft",
  live: "Live",
  suspended: "Suspended",
  closed: "Closed",
  settled: "Settled",
  voided: "Voided",
};

const schedulerTypeLabel: Record<SchedulerTaskType, string> = {
  MARKET_OPEN: "Market open",
  MARKET_LOCK: "Trading lock",
  MARKET_CLOSE: "Market close",
  MARKET_SETTLE: "Settlement",
  PATROL_SCAN: "Patrol scan",
  LEADERBOARD_SNAPSHOT: "Leaderboard snapshot",
  CUSTOM: "Custom task",
};

const pointSourceOptions: PointEventSource[] = [
  "TRADE",
  "LIQUIDITY",
  "CLAIM",
  "PATROL",
  "BONUS",
  "ADMIN",
];

const pointSourceLabels: Record<PointEventSource, string> = {
  TRADE: "Trade",
  LIQUIDITY: "Liquidity",
  CLAIM: "Claim",
  PATROL: "Patrol",
  BONUS: "Bonus",
  ADMIN: "Admin grant",
};

const shouldDisableActivate = (state: MarketState): boolean =>
  !(state === "draft" || state === "suspended");

const shouldDisableSuspend = (state: MarketState): boolean => state !== "live";

const shouldDisableVoid = (state: MarketState): boolean => state === "voided";

const shouldDisableSettle = (state: MarketState): boolean =>
  !(state === "live" || state === "suspended");

const shouldDisableOverride = (state: MarketState): boolean => state !== "settled";

const getBasePayload = (formData: FormData) => {
  const payload: { signer?: string; network?: string } = {};
  const signer = formData.get("signer");
  const network = formData.get("network");

  if (typeof signer === "string" && signer.trim().length > 0) {
    payload.signer = signer.trim();
  }

  if (typeof network === "string" && network.trim().length > 0) {
    payload.network = network.trim();
  }

  return payload;
};

export default async function AdminPage() {
  const auth = getSessionAuth();

  // Skip protected data fetching if not authorized
  if (!auth.token) {
    return (
      <main className="container">
        <h1>Admin Panel</h1>
        <p>Authorization required. Please sign in with your Flow wallet.</p>
      </main>
    );
  }

  // Check user roles
  let userProfile;
  try {
    userProfile = await fetchMyProfile(auth);
  } catch (error) {
    return (
      <main className="container">
        <h1>Admin Panel</h1>
        <p>Failed to load user profile. Please try reconnecting your wallet.</p>
      </main>
    );
  }

  const hasAdminRole = userProfile.roles.some(r => r.role === "admin");
  const hasOperatorRole = userProfile.roles.some(r => r.role === "operator");

  if (!hasAdminRole && !hasOperatorRole) {
    return (
      <main className="container">
        <h1>Admin Panel</h1>
        <p>Access denied. You need ADMIN or OPERATOR role to access this panel.</p>
        <p>Your address: {userProfile.address}</p>
        <p>Your roles: {userProfile.roles.length > 0 ? userProfile.roles.map(r => r.role).join(", ") : "none"}</p>
      </main>
    );
  }

  const [markets, roles, directory, rolePurchaseRequests, monitoring, schedulerTasks, leaderboard, snapshots, fastBreakMarkets]: [
    MarketSummary[],
    RoleAssignment[],
    FlowUser[],
    any[], // RolePurchaseRequest[]
    MonitoringSnapshot,
    SchedulerTask[],
    LeaderboardEntry[],
    LeaderboardSnapshot[],
    FastBreakMarket[],
  ] = await Promise.all([
    fetchMarkets(),
    fetchRoleAssignments().catch(() => []),
    fetchRoleDirectory().catch(() => []),
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/admin/role-purchase`, {
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
    }).then(r => r.ok ? r.json() : []).catch(() => []),
    fetchMonitoringSnapshot(auth),
    fetchSchedulerTasks({ status: "PENDING", limit: 25, auth }),
    fetchLeaderboard(10, auth),
    fetchLeaderboardSnapshots({ limit: 5, auth }),
    fetchFastBreakMarkets().catch(() => []),
  ]);

  const topCounters = [...monitoring.counters]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topSummaries = [...monitoring.summaries]
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);

  const recentErrors = monitoring.errors.slice(0, 6);
  const rolesStrategyRaw =
    process.env.NEXT_PUBLIC_FLOW_ROLES_STRATEGY ??
    process.env.FLOW_ROLES_STRATEGY ??
    "onchain";
  const rolesStrategy = rolesStrategyRaw.toLowerCase();
  const forceLegacyRoles =
    rolesStrategy === "legacy" ||
    (process.env.NEXT_PUBLIC_FORCE_LEGACY_ROLES ?? process.env.FORCE_LEGACY_ROLES ?? "")
      .toLowerCase()
      .startsWith("true") ||
    process.env.NEXT_E2E_DISABLE_CACHE === "true";
  const useLegacyRoles = forceLegacyRoles;

  const marketSupportingData = await Promise.all(
    markets.map(async (market) => {
      const transactionsPromise = fetchMarketTransactions(market.id, 12).catch((error) => {
        console.warn(`Failed to fetch transaction log for ${market.id}`, error);
        return [] as MarketTransactionLog[];
      });

      if (market.state === "draft") {
        const transactions = await transactionsPromise;
        return {
          id: market.id,
          poolState: null as MarketPoolState | null,
          storage: null as MarketStorageMetadata | null,
          transactions,
        };
      }

      const [poolState, storage, transactions] = await Promise.all([
        fetchMarketPoolState(market.id).catch((error) => {
          console.warn(`Failed to fetch pool state for ${market.id}`, error);
          return null;
        }),
        fetchMarketStorage(market.id).catch((error) => {
          console.warn(`Failed to fetch storage metadata for ${market.id}`, error);
          return null;
        }),
        transactionsPromise,
      ]);

      return {
        id: market.id,
        poolState,
        storage: storage as MarketStorageMetadata | null,
        transactions,
      };
    })
  );

  const poolStateByMarket = marketSupportingData.reduce<Record<string, MarketPoolState | null>>(
    (acc, entry) => {
      acc[entry.id] = entry.poolState;
      return acc;
    },
    {}
  );

  const storageByMarket = marketSupportingData.reduce<
    Record<string, MarketStorageMetadata | null>
  >((acc, entry) => {
    acc[entry.id] = entry.storage;
    return acc;
  }, {});

  const transactionsByMarket = marketSupportingData.reduce<
    Record<string, MarketTransactionLog[]>
  >((acc, entry) => {
    acc[entry.id] = entry.transactions;
    return acc;
  }, {});

  const refreshMonitoringAction = async () => {
    "use server";

    revalidatePath(ADMIN_PATH);
  };

  const sendTestAlertAction = async () => {
    "use server";

    await sendMonitoringTestAlert(getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const assignRoleAction = async (formData: FormData) => {
    "use server";

    const addressRaw = formData.get("address");
    const roleRaw = formData.get("role");
    const labelRaw = formData.get("label");

    if (typeof addressRaw !== "string") {
      throw new Error("Address is required");
    }

    if (typeof roleRaw !== "string") {
      throw new Error("Role is required");
    }

    const address = addressRaw.trim();
    const role = roleRaw.trim().toLowerCase() as RoleType;

    if (!address) {
      throw new Error("Enter a Flow account address");
    }

    const upperRole = role.toUpperCase() as RoleType;
    if (upperRole !== "ADMIN" && upperRole !== "MARKET_MAKER" && upperRole !== "ORACLE" && upperRole !== "PATROL") {
      throw new Error("Unsupported role");
    }

    await assignRole(address, upperRole);
    revalidatePath(ADMIN_PATH);
  };

  const revokeRoleAction = async (formData: FormData) => {
    "use server";

    const address = formData.get("address");
    const role = formData.get("role");
    
    if (typeof address !== "string" || address.trim().length === 0) {
      throw new Error("Address is missing");
    }
    if (typeof role !== "string" || role.trim().length === 0) {
      throw new Error("Role is missing");
    }

    await revokeRole(address.trim(), role.trim() as RoleType);
    revalidatePath(ADMIN_PATH);
  };

  const activateMarketAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const payload = getBasePayload(formData);
    await activateMarket(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const suspendMarketAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const reasonRaw = formData.get("reason");
    const payload: SuspendMarketPayload = {
      ...getBasePayload(formData),
    };

    if (typeof reasonRaw === "string" && reasonRaw.trim().length > 0) {
      payload.reason = reasonRaw.trim();
    }

    await suspendMarket(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const closeMarketAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const payload: CloseMarketPayload = {
      ...getBasePayload(formData),
    };

    const reason = formData.get("reason");
    if (typeof reason === "string" && reason.trim().length > 0) {
      payload.reason = reason.trim();
    }

    const closedAt = formData.get("closedAt");
    if (typeof closedAt === "string" && closedAt.trim().length > 0) {
      const parsed = new Date(closedAt);
      if (Number.isNaN(parsed.getTime())) {
      throw new Error("Closing date is invalid");
      }
      payload.closedAt = parsed.toISOString();
    }

    await closeMarket(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const updateScheduleAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const toIso = (value: FormDataEntryValue | null, field: string): string | undefined => {
      if (typeof value !== "string" || value.trim().length === 0) {
        return undefined;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${field} contains an invalid date`);
      }
      return parsed.toISOString();
    };

    const payload: UpdateMarketSchedulePayload = {
      ...getBasePayload(formData),
    };

    const scheduled = toIso(formData.get("scheduledStartAt"), "Scheduled start");
    const lock = toIso(formData.get("tradingLockAt"), "Trading lock");
    const freezeStart = toIso(formData.get("freezeWindowStartAt"), "Freeze window start");
    const freezeEnd = toIso(formData.get("freezeWindowEndAt"), "Freeze window end");

    if (scheduled) {
      payload.scheduledStartAt = scheduled;
    }
    if (lock) {
      payload.tradingLockAt = lock;
    }
    if (freezeStart) {
      payload.freezeWindowStartAt = freezeStart;
    }
    if (freezeEnd) {
      payload.freezeWindowEndAt = freezeEnd;
    }

    if (!scheduled && !lock && !freezeStart && !freezeEnd) {
      throw new Error("Provide at least one schedule value");
    }

    await updateMarketSchedule(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const updatePatrolThresholdAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const thresholdValue = formData.get("patrolThreshold");
    const threshold = Number.parseFloat(String(thresholdValue ?? ""));
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error("Patrol threshold must be a non-negative number");
    }

    const payload: UpdatePatrolThresholdPayload = {
      ...getBasePayload(formData),
      patrolThreshold: threshold,
    };

    await updatePatrolThreshold(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const recordPatrolSignalAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const severity = formData.get("severity");
    const code = formData.get("code");
    const weightValue = formData.get("weight");

    if (typeof severity !== "string" || severity.trim().length === 0) {
      throw new Error("Select a signal severity");
    }

    if (typeof code !== "string" || code.trim().length === 0) {
      throw new Error("Enter a signal code");
    }

    const weight = Number.parseFloat(String(weightValue ?? ""));
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error("Signal weight must be a positive number");
    }

    const payload: RecordPatrolSignalPayload = {
      ...getBasePayload(formData),
      severity: severity.trim() as RecordPatrolSignalPayload["severity"],
      code: code.trim(),
      weight,
    };

    const issuer = formData.get("issuer");
    if (typeof issuer === "string" && issuer.trim().length > 0) {
      payload.issuer = issuer.trim();
    }

    const notes = formData.get("notes");
    if (typeof notes === "string" && notes.trim().length > 0) {
      payload.notes = notes.trim();
    }

    const expiresAt = formData.get("expiresAt");
    if (typeof expiresAt === "string" && expiresAt.trim().length > 0) {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Signal expiration date is invalid");
      }
      payload.expiresAt = parsed.toISOString();
    }

    await recordPatrolSignal(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const clearPatrolSignalAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const patrolAddress = formData.get("patrolAddress");
    if (typeof patrolAddress !== "string" || patrolAddress.trim().length === 0) {
      throw new Error("Enter a patrol address");
    }

    const payload: ClearPatrolSignalPayload = {
      ...getBasePayload(formData),
      patrolAddress: patrolAddress.trim(),
    };

    await clearPatrolSignal(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const voidMarketAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const payload = getBasePayload(formData);
    await voidMarket(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const settleMarketAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const outcomeIdValue = formData.get("outcomeId");
    const resolvedOutcomeId = formData.get("resolvedOutcomeId");
    const txHash = formData.get("txHash");
    const notes = formData.get("notes");

    if (typeof resolvedOutcomeId !== "string" || resolvedOutcomeId.trim().length === 0) {
      throw new Error("Provide the winning outcome identifier");
    }

    if (typeof txHash !== "string" || txHash.trim().length === 0) {
      throw new Error("Provide the settlement transaction hash");
    }

    const outcomeId = Number.parseInt(String(outcomeIdValue), 10);
    if (!Number.isInteger(outcomeId) || outcomeId < 0) {
      throw new Error("Enter a numeric outcome index");
    }

    const payload: SettleMarketPayload = {
      ...getBasePayload(formData),
      outcomeId,
      resolvedOutcomeId: resolvedOutcomeId.trim(),
      txHash: txHash.trim(),
    };

    if (typeof notes === "string" && notes.trim().length > 0) {
      payload.notes = notes.trim();
    }

    await settleMarket(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const overrideSettlementAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    if (typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Market identifier is missing");
    }

    const outcomeIdValue = formData.get("outcomeId");
    const resolvedOutcomeId = formData.get("resolvedOutcomeId");
    const txHash = formData.get("txHash");
    const notes = formData.get("notes");
    const reason = formData.get("reason");

    if (typeof resolvedOutcomeId !== "string" || resolvedOutcomeId.trim().length === 0) {
      throw new Error("Provide the winning outcome identifier");
    }

    if (typeof txHash !== "string" || txHash.trim().length === 0) {
      throw new Error("Provide the settlement transaction hash");
    }

    if (typeof reason !== "string" || reason.trim().length === 0) {
      throw new Error("Provide a reason for the override");
    }

    const outcomeId = Number.parseInt(String(outcomeIdValue), 10);
    if (!Number.isInteger(outcomeId) || outcomeId < 0) {
      throw new Error("Enter a numeric outcome index");
    }

    const payload: OverrideSettlementPayload = {
      ...getBasePayload(formData),
      outcomeId,
      resolvedOutcomeId: resolvedOutcomeId.trim(),
      txHash: txHash.trim(),
      reason: reason.trim(),
    };

    if (typeof notes === "string" && notes.trim().length > 0) {
      payload.notes = notes.trim();
    }

    await overrideSettlement(marketId.trim(), payload, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const createPoolAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    const outcomeCountValue = formData.get("outcomeCount");
    const liquidityValue = formData.get("liquidityParameter");
    const seedAmountValue = formData.get("seedAmount");

    if (!marketId || typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Select a market");
    }

    const outcomeCount = Number.parseInt(String(outcomeCountValue ?? ""), 10);
    if (!Number.isInteger(outcomeCount) || outcomeCount <= 0) {
      throw new Error("Outcome count must be a positive integer");
    }

    const liquidityParameter = Number.parseFloat(String(liquidityValue ?? ""));
    if (!Number.isFinite(liquidityParameter) || liquidityParameter <= 0) {
      throw new Error("Liquidity parameter must be a positive number");
    }

    const seedAmount = Number.parseFloat(String(seedAmountValue ?? ""));
    if (!Number.isFinite(seedAmount) || seedAmount < 0) {
      throw new Error("Seed amount must be a non-negative number");
    }

    const signer = formData.get("signer");
    const network = formData.get("network");

    await createMarketPool(marketId.trim(), {
      outcomeCount,
      liquidityParameter,
      seedAmount,
      signer: typeof signer === "string" && signer.trim().length > 0 ? signer.trim() : undefined,
      network: typeof network === "string" && network.trim().length > 0 ? network.trim() : undefined,
    }, getSessionAuth());

    revalidatePath(ADMIN_PATH);
  };

  const mintOutcomeAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    const amountValue = formData.get("amount");

    if (!marketId || typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Select a market");
    }

    const amount = Number.parseFloat(String(amountValue ?? ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Token amount must be a positive number");
    }

    const signer = formData.get("signer");
    const network = formData.get("network");

    await mintOutcomeTokens(marketId.trim(), {
      amount,
      signer: typeof signer === "string" && signer.trim().length > 0 ? signer.trim() : undefined,
      network: typeof network === "string" && network.trim().length > 0 ? network.trim() : undefined,
    }, getSessionAuth());

    revalidatePath(ADMIN_PATH);
  };

  const burnOutcomeAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    const amountValue = formData.get("amount");

    if (!marketId || typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Select a market");
    }

    const amount = Number.parseFloat(String(amountValue ?? ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Token amount must be a positive number");
    }

    const signer = formData.get("signer");
    const network = formData.get("network");

    await burnOutcomeTokens(marketId.trim(), {
      amount,
      signer: typeof signer === "string" && signer.trim().length > 0 ? signer.trim() : undefined,
      network: typeof network === "string" && network.trim().length > 0 ? network.trim() : undefined,
    }, getSessionAuth());

    revalidatePath(ADMIN_PATH);
  };

  const syncPoolAction = async (formData: FormData) => {
    "use server";

    const marketId = formData.get("marketId");
    const bVectorValue = formData.get("bVector");
    const totalLiquidityValue = formData.get("totalLiquidity");
    const outcomeSupplyValue = formData.get("outcomeSupply");

    if (!marketId || typeof marketId !== "string" || marketId.trim().length === 0) {
      throw new Error("Select a market");
    }

    const parseNumberList = (raw: FormDataEntryValue | null, field: string): number[] => {
      if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
        throw new Error(`${field} must contain at least one value`);
      }

      const parts = raw
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => Number.parseFloat(part));

      if (parts.length === 0 || parts.some((value) => !Number.isFinite(value))) {
        throw new Error(`${field} contains invalid values`);
      }

      return parts;
    };

    const bVector = parseNumberList(bVectorValue, "B-vector");

    const totalLiquidity = Number.parseFloat(String(totalLiquidityValue ?? ""));
    if (!Number.isFinite(totalLiquidity) || totalLiquidity < 0) {
      throw new Error("Total liquidity must be a non-negative number");
    }

    const outcomeSupply = parseNumberList(outcomeSupplyValue, "Outcome supply");

    const signer = formData.get("signer");
    const network = formData.get("network");

    await syncMarketPoolState(marketId.trim(), {
      bVector,
      totalLiquidity,
      outcomeSupply,
      signer: typeof signer === "string" && signer.trim().length > 0 ? signer.trim() : undefined,
      network: typeof network === "string" && network.trim().length > 0 ? network.trim() : undefined,
    }, getSessionAuth());

    revalidatePath(ADMIN_PATH);
  };

  const runSchedulerTaskAction = async (formData: FormData) => {
    "use server";

    const taskId = formData.get("taskId");
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      throw new Error("Task identifier is missing");
    }

    await runSchedulerTask(taskId.trim(), getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const runDueSchedulerTasksAction = async (formData: FormData) => {
    "use server";

    const limitRaw = formData.get("limit");
    let limit: number | undefined;
    if (typeof limitRaw === "string" && limitRaw.trim().length > 0) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Task limit must be a positive number");
      }
      limit = parsed;
    }

    await runDueSchedulerTasks(limit, getSessionAuth());
    revalidatePath(ADMIN_PATH);
  };

  const awardPointsAction = async (formData: FormData) => {
    "use server";

    const addressRaw = formData.get("address");
    if (typeof addressRaw !== "string" || addressRaw.trim().length === 0) {
      throw new Error("Enter a recipient address");
    }

    const amountRaw = formData.get("amount");
    const amount = Number.parseFloat(String(amountRaw ?? ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Award amount must be a positive number");
    }

    const sourceRaw = formData.get("source");
    if (typeof sourceRaw !== "string" || sourceRaw.trim().length === 0) {
      throw new Error("Select an award source");
    }

    const normalizedSource = sourceRaw.trim().toUpperCase() as PointEventSource;
    if (!pointSourceOptions.includes(normalizedSource)) {
      throw new Error("Unsupported award source");
    }

    const referenceRaw = formData.get("reference");
    const notesRaw = formData.get("notes");

    await awardPoints(
      {
        address: addressRaw.trim(),
        amount,
        source: normalizedSource,
        reference:
          typeof referenceRaw === "string" && referenceRaw.trim().length > 0
            ? referenceRaw.trim()
            : undefined,
        notes:
          typeof notesRaw === "string" && notesRaw.trim().length > 0
            ? notesRaw.trim()
            : undefined,
      },
      getSessionAuth()
    );

    revalidatePath(ADMIN_PATH);
  };

  const captureSnapshotAction = async (formData: FormData) => {
    "use server";

    const limitRaw = formData.get("limit");
    let limit: number | undefined;
    if (typeof limitRaw === "string" && limitRaw.trim().length > 0) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
        throw new Error("Snapshot limit must be between 1 and 100");
      }
      limit = parsed;
    }

    const capturedAtRaw = formData.get("capturedAt");
    let capturedAt: string | undefined;
    if (typeof capturedAtRaw === "string" && capturedAtRaw.trim().length > 0) {
      const parsed = new Date(capturedAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Snapshot date is invalid");
      }
      capturedAt = parsed.toISOString();
    }

    await captureLeaderboardSnapshot(
      {
        ...(limit ? { limit } : {}),
        ...(capturedAt ? { capturedAt } : {}),
      },
      getSessionAuth()
    );

    revalidatePath(ADMIN_PATH);
  };

  const createFastBreakMarketsAction = async () => {
    "use server";

    await createMarketsForNewRuns();
    revalidatePath(ADMIN_PATH);
  };

  const settleFastBreakMarketsAction = async () => {
    "use server";

    await settleCompletedMarkets();
    revalidatePath(ADMIN_PATH);
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header__content">
          <p className="eyebrow">Administration</p>
          <h1>Platform control panel</h1>
          <p className="muted">
            Manage roles, markets, monitoring, and system operations.
          </p>
        </div>
      </header>

      <nav className="admin-nav">
        <a href="#roles" className="admin-nav__link">Roles & Users</a>
        <a href="#monitoring" className="admin-nav__link">Monitoring</a>
        <a href="#scheduler" className="admin-nav__link">Scheduler</a>
        <a href="#points" className="admin-nav__link">Points</a>
        <a href="#markets" className="admin-nav__link">Markets</a>
        <a href="#liquidity" className="admin-nav__link">Liquidity</a>
        <a href="#fastbreak" className="admin-nav__link">FastBreak</a>
      </nav>

      <section id="roles" className="admin-section">

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h2>Roles</h2>
              <p className="muted">Grant or revoke administrator, operator, patrol, and oracle permissions.</p>
            </div>
          </header>

          {useLegacyRoles ? (
            <>
              <form className="admin-form" action={assignRoleAction}>
                <div className="admin-form__grid">
                  <label>
                    <span>Flow address</span>
                    <input name="address" type="text" placeholder="0xabc..." required />
                  </label>
                  <label>
                    <span>Role</span>
                    <select name="role" defaultValue="operator" required>
                      <option value="admin">Admin</option>
                      <option value="operator">Operator</option>
                      <option value="oracle">Oracle</option>
                      <option value="patrol">Patrol</option>
                    </select>
                  </label>
                </div>
                <div className="admin-form__actions">
                  <button type="submit" className="button primary">
                    Assign role
                  </button>
                </div>
              </form>

              <div className="admin-table">
                <div className="admin-table__header">
                  <span>Address</span>
                  <span>Role</span>
                  <span>Granted</span>
                  <span aria-hidden />
                </div>
                {roles.length === 0 ? (
                  <p className="muted">No assignments yet.</p>
                ) : (
                  roles.map((assignment: RoleAssignment) => (
                    <div key={assignment.id} className="admin-table__row">
                      <span>{assignment.address}</span>
                      <span className="admin-badge">{assignment.role}</span>
                      <span>{assignment.createdAt ? formatDateTime(assignment.createdAt) : formatDateTime(assignment.grantedAt)}</span>
                      <form action={revokeRoleAction}>
                        <input type="hidden" name="address" value={assignment.address} />
                        <input type="hidden" name="role" value={assignment.role} />
                        <button type="submit" className="button tertiary">
                          Revoke
                        </button>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
      <RoleAssignmentsPanel initialRoles={roles} directory={directory} />
          )}
        </article>
      </section>

      <section id="role-purchases" className="admin-section">
        <header className="admin-section__header">
          <h2>Role Purchase Requests</h2>
        </header>
        <article className="admin-card">
          <RolePurchaseRequestsPanel initialRequests={rolePurchaseRequests} />
        </article>
      </section>

      <section id="monitoring" className="admin-section">
        <header className="admin-section__header">
          <div>
            <h2>Monitoring and alerts</h2>
            <p className="muted">
              Track API responsiveness, request volume, and verify webhook integrations in real time.
            </p>
          </div>
        </header>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Current state</h3>
              <p className="muted">Metrics refresh on every administrative API request.</p>
            </div>
            <div className="admin-monitoring-buttons">
              <form action={refreshMonitoringAction}>
                <button type="submit" className="button secondary">
                  Refresh data
                </button>
              </form>
              <form action={sendTestAlertAction}>
                <button type="submit" className="button tertiary">
                  Send test alert
                </button>
              </form>
            </div>
          </header>

          <div className="admin-monitoring-meta">
            <span>Last update: {formatDateTime(monitoring.timestamp)}</span>
          </div>

          <div className="admin-monitoring-grid">
            <div className="admin-monitoring-block">
              <h4>Counters</h4>
              {topCounters.length === 0 ? (
                <p className="muted">No request metrics recorded yet.</p>
              ) : (
                <ul className="admin-monitoring-list">
                  {topCounters.map((counter) => (
                    <li key={counter.name} className="admin-monitoring-item">
                      <span className="admin-monitoring-metric">{counter.name}</span>
                      <span className="admin-monitoring-value">
                        {formatNumber(counter.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="admin-monitoring-block">
              <h4>Durations</h4>
              {topSummaries.length === 0 ? (
                <p className="muted">No latency measurements available.</p>
              ) : (
                <ul className="admin-monitoring-list">
                  {topSummaries.map((summary) => {
                    const unit = summary.name.includes("duration") ? " ms" : "";

                    return (
                      <li
                        key={summary.name}
                        className="admin-monitoring-item admin-monitoring-item--summary"
                      >
                        <div className="admin-monitoring-metric-group">
                          <span className="admin-monitoring-metric">{summary.name}</span>
                          <span className="admin-monitoring-sub">
                            {formatNumber(summary.count)} samples
                          </span>
                        </div>
                        <div className="admin-monitoring-summary">
                          <span>avg {formatNumber(summary.avg)}{unit}</span>
                          <span>min {formatNumber(summary.min)}{unit}</span>
                          <span>max {formatNumber(summary.max)}{unit}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="admin-monitoring-block">
              <h4>Errors</h4>
              {recentErrors.length === 0 ? (
                <p className="muted">No active errors reported.</p>
              ) : (
                <ul className="admin-monitoring-list admin-monitoring-list--errors">
                  {recentErrors.map((error) => (
                    <li
                      key={error.metric}
                      className="admin-monitoring-item admin-monitoring-item--error"
                    >
                      <div className="admin-monitoring-metric-group">
                        <span className="admin-monitoring-metric">{error.metric}</span>
                        <span className="admin-monitoring-sub">
                          {formatNumber(error.occurrences)} occurrences
                        </span>
                      </div>
                      <p className="admin-monitoring-error-message">{error.lastMessage}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </article>
      </section>

      <section id="scheduler" className="admin-section">
        <header className="admin-section__header">
          <div>
            <h2>Task scheduler</h2>
            <p className="muted">
              Manage scheduled market operations: openings, trading locks, closures, and patrol scans.
            </p>
          </div>
        </header>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Scheduled tasks</h3>
              <p className="muted">
                Tasks are generated when market schedules are configured. You can also trigger them manually.
              </p>
            </div>
            <div className="admin-scheduler-actions">
              <form action={runDueSchedulerTasksAction} className="admin-scheduler-run-due">
                <label>
                  <span>Limit</span>
                  <input type="number" min={1} max={25} name="limit" placeholder="10" />
                </label>
                <button type="submit" className="button secondary">
                  Run overdue
                </button>
              </form>
            </div>
          </header>

          {schedulerTasks.length === 0 ? (
            <p className="muted">No pending tasks — the schedule is up to date.</p>
          ) : (
            <div className="admin-table admin-table--scheduler">
              <div className="admin-table__header">
                <span>Task</span>
                <span>Market</span>
                <span>Scheduled for</span>
                <span>Description</span>
                <span aria-hidden />
              </div>
              {schedulerTasks.map((task) => (
                <div key={task.id} className="admin-table__row">
                  <span className="admin-badge admin-badge--faded">
                    {schedulerTypeLabel[task.type] ?? task.type}
                  </span>
                  <span>{task.marketId ?? "—"}</span>
                  <span>{formatDateTime(task.scheduledFor)}</span>
                  <span>{task.description ?? "—"}</span>
                  <form action={runSchedulerTaskAction} className="admin-scheduler-run">
                    <input type="hidden" name="taskId" value={task.id} />
                    <button type="submit" className="button tertiary">
                      Run now
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section id="points" className="admin-section">
        <header className="admin-section__header">
          <div>
            <h2>Points and leaderboard</h2>
            <p className="muted">
              Track participant standings, issue manual point awards, and capture snapshots for analysis.
            </p>
          </div>
        </header>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Top participants</h3>
              <p className="muted">Current leaderboard by total points.</p>
            </div>
          </header>

          {leaderboard.length === 0 ? (
            <p className="muted">Leaderboard is empty — award points to participants to populate it.</p>
          ) : (
            <div className="admin-table admin-table--compact">
              <div className="admin-table__header">
                <span>Rank</span>
                <span>Address</span>
                <span>Total</span>
              </div>
              {leaderboard.map((entry) => (
                <div key={entry.address} className="admin-table__row">
                  <span className="admin-badge">#{entry.rank}</span>
                  <span>{entry.address}</span>
                  <span>{formatNumber(entry.total)}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Snapshot history</h3>
              <p className="muted">Recent leaderboard snapshots.</p>
            </div>
            <form action={captureSnapshotAction} className="admin-form admin-form--inline">
              <label>
                <span>Limit</span>
                <input name="limit" type="number" min={1} max={100} placeholder="20" />
              </label>
              <label>
                <span>Captured at</span>
                <input name="capturedAt" type="datetime-local" />
              </label>
              <button type="submit" className="button secondary">
                Capture snapshot
              </button>
            </form>
          </header>

          {snapshots.length === 0 ? (
            <p className="muted">No snapshots yet. Capture one manually or wait for the scheduler.</p>
          ) : (
            <ul className="admin-snapshot-list">
              {snapshots.map((snapshot) => (
                <li key={snapshot.capturedAt}>
                  <details>
                    <summary>
                      <span className="admin-badge admin-badge--faded">
                        {formatDateTime(snapshot.capturedAt)}
                      </span>
                      <span className="admin-snapshot-count">{snapshot.entries.length} entries</span>
                    </summary>
                    <div className="admin-table admin-table--compact">
                      <div className="admin-table__header">
                        <span>Rank</span>
                        <span>Address</span>
                        <span>Total</span>
                      </div>
                      {snapshot.entries.map((entry) => (
                        <div key={entry.address} className="admin-table__row">
                          <span>#{entry.rank}</span>
                          <span>{entry.address}</span>
                          <span>{formatNumber(entry.total)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Manual award</h3>
              <p className="muted">Add or adjust the balance of a specific participant.</p>
            </div>
          </header>
          <form action={awardPointsAction} className="admin-form">
            <div className="admin-form__grid">
              <label>
                <span>Address</span>
                <input name="address" type="text" placeholder="0xuser" required />
              </label>
              <label>
                <span>Amount</span>
                <input name="amount" type="number" step="0.0001" min="0.0001" placeholder="10" required />
              </label>
              <label>
                <span>Source</span>
                <select name="source" defaultValue="BONUS" required>
                  {pointSourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {pointSourceLabels[source]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Reference</span>
                <input name="reference" type="text" placeholder="optional" />
              </label>
              <label className="admin-form__span">
                <span>Notes</span>
                <textarea name="notes" rows={3} placeholder="Adjustment reason" />
              </label>
            </div>
            <div className="admin-form__actions">
              <button type="submit" className="button primary">
                Award points
              </button>
            </div>
          </form>
        </article>
      </section>

      <section id="markets" className="admin-section">
        <header className="admin-section__header">
          <div>
            <h2>Markets</h2>
            <p className="muted">
              Manage market states, pause trading, and publish settlement results.
            </p>
          </div>
        </header>

        <div className="admin-market-grid">
          {markets.length === 0 ? (
            <p className="muted">No markets available yet.</p>
          ) : (
            markets.map((market: MarketSummary) => {
              const poolState = poolStateByMarket[market.id];
              const storage = storageByMarket[market.id];
              const transactions = transactionsByMarket[market.id] ?? [];

              return (
                <article key={market.id} className="admin-market-card">
                <header className="admin-market-card__header">
                  <div>
                    <h3>{market.title}</h3>
                    <p className="muted">Slug: {market.slug}</p>
                  </div>
                  <span className={`admin-market-state admin-market-state--${market.state}`}>
                    {stateLabel[market.state]}
                  </span>
                </header>
                <dl className="admin-market-meta">
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDateTime(market.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Total liquidity</dt>
                    <dd>{market.totalLiquidity.toLocaleString("en-US")}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{market.state}</dd>
                  </div>
                </dl>

                  <div className="admin-market-insights">
                    <div>
                      <h4>Pool</h4>
                      {poolState ? (
                        <dl className="admin-market-stats">
                          <div>
                            <dt>Liquidity</dt>
                            <dd>{formatNumber(poolState.totalLiquidity)}</dd>
                          </div>
                          <div>
                            <dt>Parameter</dt>
                            <dd>{formatNumber(poolState.liquidityParameter)}</dd>
                          </div>
                          <div>
                            <dt>Outcome supply</dt>
                            <dd>
                              {poolState.outcomeSupply.map((value, index) =>
                                `#${index}: ${formatNumber(value)}`
                              ).join(", ")}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="muted">Pool has not been initialized yet.</p>
                      )}
                    </div>

                    <div>
                      <h4>Storage</h4>
                      {storage ? (
                        <dl className="admin-market-stats">
                          <div>
                            <dt>Owner</dt>
                            <dd>{storage.owner}</dd>
                          </div>
                          <div>
                            <dt>Liquidity path</dt>
                            <dd>{storage.liquidityPoolPath}</dd>
                          </div>
                          <div>
                            <dt>Outcome vault</dt>
                            <dd>{storage.outcomeVaultPath}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="muted">Flow storage has not been initialized.</p>
                      )}
                    </div>
                  </div>

                <div className="admin-actions">
                  <form action={activateMarketAction}>
                    <input type="hidden" name="marketId" value={market.id} />
                    <button
                      type="submit"
                      className="button"
                      disabled={shouldDisableActivate(market.state)}
                    >
                      Activate
                    </button>
                  </form>
                  <details>
                    <summary>Suspend</summary>
                    <form action={suspendMarketAction} className="admin-form admin-form--inline">
                      <input type="hidden" name="marketId" value={market.id} />
                      <label>
                        <span>Reason</span>
                        <input name="reason" type="text" placeholder="Technical pause" />
                      </label>
                      <label>
                        <span>Network</span>
                        <input name="network" type="text" placeholder="emulator" />
                      </label>
                      <label>
                        <span>Signer</span>
                        <input name="signer" type="text" placeholder="0xoperator" />
                      </label>
                      <button
                        type="submit"
                        className="button secondary"
                        disabled={shouldDisableSuspend(market.state)}
                      >
                        Suspend
                      </button>
                    </form>
                  </details>
                  <form action={voidMarketAction}>
                    <input type="hidden" name="marketId" value={market.id} />
                    <button
                      type="submit"
                      className="button tertiary"
                      disabled={shouldDisableVoid(market.state)}
                    >
                      Void
                    </button>
                  </form>
                </div>

                <details>
                  <summary>Close</summary>
                  <form action={closeMarketAction} className="admin-form admin-form--inline">
                    <input type="hidden" name="marketId" value={market.id} />
                    <label>
                      <span>Reason</span>
                      <input name="reason" type="text" placeholder="Trading session ended" />
                    </label>
                    <label>
                      <span>Closing date</span>
                      <input name="closedAt" type="datetime-local" />
                    </label>
                    <label>
                      <span>Network</span>
                      <input name="network" type="text" placeholder="emulator" />
                    </label>
                    <label>
                      <span>Signer</span>
                      <input name="signer" type="text" placeholder="0xoperator" />
                    </label>
                    <button type="submit" className="button">
                      Close market
                    </button>
                  </form>
                </details>

                <details>
                  <summary>Update schedule</summary>
                  <form action={updateScheduleAction} className="admin-form">
                    <input type="hidden" name="marketId" value={market.id} />
                    <div className="admin-form__grid">
                      <label>
                        <span>Scheduled start</span>
                        <input name="scheduledStartAt" type="datetime-local" />
                      </label>
                      <label>
                        <span>Trading lock</span>
                        <input name="tradingLockAt" type="datetime-local" />
                      </label>
                      <label>
                        <span>Freeze window start</span>
                        <input name="freezeWindowStartAt" type="datetime-local" />
                      </label>
                      <label>
                        <span>Freeze window end</span>
                        <input name="freezeWindowEndAt" type="datetime-local" />
                      </label>
                      <label>
                        <span>Network</span>
                        <input name="network" type="text" placeholder="emulator" />
                      </label>
                      <label>
                        <span>Signer</span>
                        <input name="signer" type="text" placeholder="0xoperator" />
                      </label>
                    </div>
                    <p className="muted">Fields left blank will remain unchanged.</p>
                    <div className="admin-form__actions">
                      <button type="submit" className="button secondary">
                        Save schedule
                      </button>
                    </div>
                  </form>
                </details>

                <details>
                  <summary>Patrol threshold</summary>
                  <form action={updatePatrolThresholdAction} className="admin-form admin-form--inline">
                    <input type="hidden" name="marketId" value={market.id} />
                    <label>
                      <span>New value</span>
                      <input
                        name="patrolThreshold"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="100"
                        required
                      />
                    </label>
                    <label>
                      <span>Network</span>
                      <input name="network" type="text" placeholder="emulator" />
                    </label>
                    <label>
                      <span>Signer</span>
                      <input name="signer" type="text" placeholder="0xoperator" />
                    </label>
                    <button type="submit" className="button tertiary">
                      Update threshold
                    </button>
                  </form>
                </details>

                <details>
                  <summary>Patrol signals</summary>
                  <form action={recordPatrolSignalAction} className="admin-form">
                    <input type="hidden" name="marketId" value={market.id} />
                    <div className="admin-form__grid">
                      <label>
                        <span>Severity</span>
                        <select name="severity" defaultValue="warning" required>
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                        </select>
                      </label>
                      <label>
                        <span>Code</span>
                        <input name="code" type="text" placeholder="ORACLE_DELAY" required />
                      </label>
                      <label>
                        <span>Weight</span>
                        <input name="weight" type="number" step="0.01" min="0.01" placeholder="1" required />
                      </label>
                      <label>
                        <span>Expires at</span>
                        <input name="expiresAt" type="datetime-local" />
                      </label>
                      <label>
                        <span>Patrol address</span>
                        <input name="issuer" type="text" placeholder="0xpatrol" />
                      </label>
                      <label>
                        <span>Network</span>
                        <input name="network" type="text" placeholder="emulator" />
                      </label>
                      <label>
                        <span>Signer</span>
                        <input name="signer" type="text" placeholder="0xpatrol" />
                      </label>
                      <label className="admin-form__span">
                        <span>Notes</span>
                        <textarea name="notes" rows={2} placeholder="Comment" />
                      </label>
                    </div>
                    <div className="admin-form__actions">
                      <button type="submit" className="button">
                        Record signal
                      </button>
                    </div>
                  </form>
                  <form action={clearPatrolSignalAction} className="admin-form admin-form--inline">
                    <input type="hidden" name="marketId" value={market.id} />
                    <label>
                      <span>Patrol address</span>
                      <input name="patrolAddress" type="text" placeholder="0xpatrol" required />
                    </label>
                    <label>
                      <span>Network</span>
                      <input name="network" type="text" placeholder="emulator" />
                    </label>
                    <label>
                      <span>Signer</span>
                      <input name="signer" type="text" placeholder="0xoperator" />
                    </label>
                    <button type="submit" className="button tertiary">
                      Clear signal
                    </button>
                  </form>
                </details>

                <details>
                  <summary>Settle</summary>
                  <form action={settleMarketAction} className="admin-form">
                    <input type="hidden" name="marketId" value={market.id} />
                    <div className="admin-form__grid">
                      <label>
                        <span>Outcome index</span>
                        <input
                          name="outcomeId"
                          type="number"
                          min="0"
                          placeholder="0"
                          required
                        />
                      </label>
                      <label>
                        <span>Winner ID</span>
                        <input name="resolvedOutcomeId" type="text" placeholder="uuid" required />
                      </label>
                      <label>
                        <span>Tx hash</span>
                        <input name="txHash" type="text" placeholder="0x..." required />
                      </label>
                      <label>
                        <span>Network</span>
                        <input name="network" type="text" placeholder="emulator" />
                      </label>
                      <label>
                        <span>Signer</span>
                        <input name="signer" type="text" placeholder="0xoracle" />
                      </label>
                      <label className="admin-form__span">
                        <span>Notes</span>
                        <textarea name="notes" rows={3} placeholder="Settlement notes" />
                      </label>
                    </div>
                    <div className="admin-form__actions">
                      <button
                        type="submit"
                        className="button"
                        disabled={shouldDisableSettle(market.state)}
                      >
                        Confirm settlement
                      </button>
                    </div>
                  </form>
                </details>

                <details>
                  <summary>Override settlement</summary>
                  <form action={overrideSettlementAction} className="admin-form">
                    <input type="hidden" name="marketId" value={market.id} />
                    <div className="admin-form__grid">
                      <label>
                        <span>Outcome index</span>
                        <input
                          name="outcomeId"
                          type="number"
                          min="0"
                          placeholder="0"
                          required
                        />
                      </label>
                      <label>
                        <span>Winner ID</span>
                        <input name="resolvedOutcomeId" type="text" placeholder="uuid" required />
                      </label>
                      <label>
                        <span>Tx hash</span>
                        <input name="txHash" type="text" placeholder="0x..." required />
                      </label>
                      <label>
                        <span>Network</span>
                        <input name="network" type="text" placeholder="emulator" />
                      </label>
                      <label>
                        <span>Signer</span>
                        <input name="signer" type="text" placeholder="0xoracle" />
                      </label>
                      <label>
                        <span>Reason</span>
                        <input name="reason" type="text" placeholder="Result dispute" required />
                      </label>
                      <label className="admin-form__span">
                        <span>Notes</span>
                        <textarea name="notes" rows={3} placeholder="Additional details" />
                      </label>
                    </div>
                    <div className="admin-form__actions">
                      <button
                        type="submit"
                        className="button secondary"
                        disabled={shouldDisableOverride(market.state)}
                      >
                        Override settlement
                      </button>
                    </div>
                  </form>
                </details>

                <div className="admin-market-transactions">
                  <MarketTransactionLogPanel
                    marketId={market.id}
                    marketSlug={market.slug}
                    initialTransactions={transactions}
                    limit={8}
                  />
                </div>
              </article>
              );
            })
          )}
        </div>
      </section>

      <section id="liquidity" className="admin-section">
        <header className="admin-section__header">
          <div>
            <h2>Liquidity and outcome tokens</h2>
            <p className="muted">
              Bootstrap pools for new markets, sync LMSR state, and manage outcome token supply.
            </p>
          </div>
        </header>

        {markets.length === 0 ? (
          <article className="admin-card">
            <p className="muted">Create at least one market before managing pools and tokens.</p>
          </article>
        ) : (
          <div className="admin-market-grid">
            <article className="admin-card">
              <header className="admin-card__header">
                <div>
                  <h3>Liquidity pools</h3>
                  <p className="muted">Create pools and manually sync LMSR parameters.</p>
                </div>
              </header>

              <form action={createPoolAction} className="admin-form">
                <div className="admin-form__grid">
                  <label>
                    <span>Market</span>
                    <select name="marketId" defaultValue={markets[0]?.id} required>
                      {markets.map((market) => (
                        <option key={market.id} value={market.id}>
                          {market.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Outcome count</span>
                    <input name="outcomeCount" type="number" min="2" placeholder="2" required />
                  </label>
                  <label>
                    <span>Liquidity parameter</span>
                    <input name="liquidityParameter" type="number" step="0.0001" min="0.0001" placeholder="10" required />
                  </label>
                  <label>
                    <span>Seed amount</span>
                    <input name="seedAmount" type="number" step="0.0001" min="0" placeholder="100" required />
                  </label>
                  <label>
                    <span>Network</span>
                    <input name="network" type="text" placeholder="emulator" />
                  </label>
                  <label>
                    <span>Signer</span>
                    <input name="signer" type="text" placeholder="0xoperator" />
                  </label>
                </div>
                <div className="admin-form__actions">
                  <button type="submit" className="button primary">
                    Create pool
                  </button>
                </div>
              </form>

              <details>
                <summary>Manual pool sync</summary>
                <form action={syncPoolAction} className="admin-form">
                  <div className="admin-form__grid">
                    <label>
                      <span>Market</span>
                      <select name="marketId" defaultValue={markets[0]?.id} required>
                        {markets.map((market) => (
                          <option key={market.id} value={market.id}>
                            {market.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-form__span">
                      <span>B-vector</span>
                      <textarea
                        name="bVector"
                        rows={3}
                        placeholder="10, 10, 10"
                        required
                      />
                    </label>
                    <label>
                      <span>Total liquidity</span>
                      <input name="totalLiquidity" type="number" step="0.0001" min="0" placeholder="100" required />
                    </label>
                    <label className="admin-form__span">
                      <span>Outcome supply</span>
                      <textarea
                        name="outcomeSupply"
                        rows={3}
                        placeholder="50, 50, 50"
                        required
                      />
                    </label>
                    <label>
                      <span>Network</span>
                      <input name="network" type="text" placeholder="emulator" />
                    </label>
                    <label>
                      <span>Signer</span>
                      <input name="signer" type="text" placeholder="0xoperator" />
                    </label>
                  </div>
                  <div className="admin-form__actions">
                    <button type="submit" className="button secondary">
                      Sync pool
                    </button>
                  </div>
                </form>
              </details>
            </article>

            <article className="admin-card">
              <header className="admin-card__header">
                <div>
                  <h3>Outcome tokens</h3>
                  <p className="muted">Mint or burn outcome tokens to balance liquidity.</p>
                </div>
              </header>

              <form action={mintOutcomeAction} className="admin-form">
                <div className="admin-form__grid">
                  <label>
                    <span>Market</span>
                    <select name="marketId" defaultValue={markets[0]?.id} required>
                      {markets.map((market) => (
                        <option key={market.id} value={market.id}>
                          {market.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Amount</span>
                    <input name="amount" type="number" step="0.0001" min="0.0001" placeholder="100" required />
                  </label>
                  <label>
                    <span>Network</span>
                    <input name="network" type="text" placeholder="emulator" />
                  </label>
                  <label>
                    <span>Signer</span>
                    <input name="signer" type="text" placeholder="0xoperator" />
                  </label>
                </div>
                <div className="admin-form__actions">
                  <button type="submit" className="button primary">
                    Mint tokens
                  </button>
                </div>
              </form>

              <form action={burnOutcomeAction} className="admin-form">
                <div className="admin-form__grid">
                  <label>
                    <span>Market</span>
                    <select name="marketId" defaultValue={markets[0]?.id} required>
                      {markets.map((market) => (
                        <option key={market.id} value={market.id}>
                          {market.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Amount</span>
                    <input name="amount" type="number" step="0.0001" min="0.0001" placeholder="100" required />
                  </label>
                  <label>
                    <span>Network</span>
                    <input name="network" type="text" placeholder="emulator" />
                  </label>
                  <label>
                    <span>Signer</span>
                    <input name="signer" type="text" placeholder="0xoperator" />
                  </label>
                </div>
                <div className="admin-form__actions">
                  <button type="submit" className="button tertiary">
                    Burn tokens
                  </button>
                </div>
              </form>
            </article>
          </div>
        )}
      </section>

      <section id="fastbreak" className="admin-section">
        <header className="admin-section__header">
          <div>
            <h2>FastBreak Prediction Markets</h2>
            <p className="muted">
              Automatically create and settle prediction markets for NBA TopShot FastBreak Runs.
            </p>
          </div>
        </header>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Market operations</h3>
              <p className="muted">
                Markets are created when new FastBreak Runs start and settled when Runs complete.
              </p>
            </div>
            <div className="admin-form__actions">
              <form action={createFastBreakMarketsAction}>
                <button type="submit" className="button primary">
                  Create markets for new runs
                </button>
              </form>
              <form action={settleFastBreakMarketsAction}>
                <button type="submit" className="button secondary">
                  Settle completed markets
                </button>
              </form>
            </div>
          </header>

          {fastBreakMarkets.length === 0 ? (
            <p className="muted">No FastBreak markets yet. Create them for active Runs.</p>
          ) : (
            <div className="admin-table">
              <div className="admin-table__header">
                <span>Run</span>
                <span>Title</span>
                <span>State</span>
                <span>Outcomes</span>
                <span>Closes</span>
                <span>Link</span>
              </div>
              {fastBreakMarkets.map((market) => (
                <div key={market.id} className="admin-table__row">
                  <span className="admin-badge admin-badge--faded">
                    {market.runName ?? market.runId?.slice(0, 8) ?? '—'}
                  </span>
                  <span>{market.title}</span>
                  <span className={`admin-market-state admin-market-state--${market.state}`}>
                    {stateLabel[market.state]}
                  </span>
                  <span>{market.tags?.filter(t => !t.startsWith('run:') && t !== 'fastbreak').length ?? 0}</span>
                  <span>{market.closeAt ? formatDateTime(market.closeAt) : '—'}</span>
                  <span>
                    <a
                      href={`/markets/${market.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button tertiary"
                    >
                      View →
                    </a>
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="admin-card">
          <header className="admin-card__header">
            <div>
              <h3>Scheduled automation</h3>
              <p className="muted">
                Background jobs run automatically on startup and periodically.
              </p>
            </div>
          </header>

          <dl className="admin-market-stats">
            <div>
              <dt>Market creation</dt>
              <dd>Every 1 hour (checks for new FastBreak Runs)</dd>
            </div>
            <div>
              <dt>Leaderboard sync</dt>
              <dd>Every 1 hour (updates top leaders data)</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>Every 24 hours (settles completed Runs)</dd>
            </div>
          </dl>

          <p className="muted">
            Note: These jobs are managed by FastBreakScheduledService and run via setInterval.
            Initial sync runs on application startup.
          </p>
        </article>
      </section>
    </div>
  );
}
