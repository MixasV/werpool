import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { parse as parseUrl } from "node:url";
import type { AddressInfo } from "node:net";

type MarketCategory = "crypto" | "sports" | "esports" | "custom";
type PatrolSignalSeverity = "info" | "warning" | "critical";

interface MarketScheduleRecord {
  scheduledStartAt: string | null;
  tradingLockAt: string | null;
  freezeWindowStartAt: string | null;
  freezeWindowEndAt: string | null;
}

interface PatrolSignalRecord {
  id: string;
  issuer: string;
  severity: PatrolSignalSeverity;
  code: string;
  weight: number;
  createdAt: string;
  expiresAt?: string;
  notes?: string;
}

interface CreateMarketPayload {
  slug: string;
  title: string;
  description: string;
  state: string;
  category?: MarketCategory;
  tags?: string[];
  oracleId?: string;
  closeAt?: string;
  patrolThreshold?: number;
  schedule?: Partial<MarketScheduleRecord>;
  patrolSignals?: Array<{
    issuer?: string;
    severity: PatrolSignalSeverity;
    code: string;
    weight: number;
    expiresAt?: string;
    notes?: string;
  }>;
  liquidityPool: {
    tokenSymbol: string;
    totalLiquidity: number;
    feeBps: number;
    providerCount: number;
  };
  outcomes: Array<{
    label: string;
    impliedProbability: number;
    liquidity: number;
  }>;
}

interface MarketRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  state: string;
  category: MarketCategory;
  tags: string[];
  oracleId: string | null;
  createdAt: string;
  closeAt: string | null;
  patrolThreshold: number;
  schedule: MarketScheduleRecord;
  patrolSignals: PatrolSignalRecord[];
  liquidityPool: CreateMarketPayload["liquidityPool"];
  outcomes: Array<{
    id: string;
    label: string;
    status: "active" | "suspended" | "settled";
    impliedProbability: number;
    liquidity: number;
  }>;
  workflow: WorkflowEntry[];
  settlement: SettlementRecord | null;
}

interface WorkflowEntry {
  id: string;
  type: "open" | "suspend" | "settle" | "void" | "distribute" | "custom";
  status: "pending" | "scheduled" | "executed" | "failed";
  description: string;
  triggersAt?: string;
  metadata?: Record<string, unknown>;
}

interface SettlementRecord {
  id: string;
  resolvedOutcomeId: string;
  txId: string;
  settledAt: string;
  notes?: string;
  overrideReason?: string;
}

interface MarketStorageRecord {
  marketId: string;
  slug: string;
  liquidityPoolPath: string;
  outcomeVaultPath: string;
  liquidityReceiverPath: string;
  liquidityProviderPath: string;
  outcomeReceiverPath: string;
  outcomeBalancePath: string;
  outcomeProviderPath: string;
  owner: string;
}

interface MarketPoolStateRecord {
  liquidityParameter: number;
  totalLiquidity: number;
  outcomeSupply: number[];
  bVector: number[];
}

type MarketTradeRecord = {
  id: string;
  marketId: string;
  outcomeId: string | null;
  outcomeLabel: string;
  outcomeIndex: number;
  shares: string;
  flowAmount: string;
  isBuy: boolean;
  probabilities: number[];
  maxFlowAmount?: string | null;
  transactionId: string;
  signer: string;
  network: string;
  createdAt: string;
};

type FlowTransactionType =
  | "CREATE_MARKET"
  | "CREATE_POOL"
  | "MINT_OUTCOME"
  | "BURN_OUTCOME"
  | "SYNC_POOL"
  | "ACTIVATE"
  | "SUSPEND"
  | "VOID"
  | "SETTLE"
  | "OVERRIDE_SETTLEMENT"
  | "EXECUTE_TRADE"
  | "CLOSE"
  | "UPDATE_SCHEDULE"
  | "UPDATE_PATROL_THRESHOLD"
  | "RECORD_PATROL_SIGNAL"
  | "CLEAR_PATROL_SIGNAL"
  | "CLAIM_REWARDS";

type FlowTransactionStatus = "PENDING" | "SUCCESS" | "FAILED";

interface MarketTransactionRecord {
  id: string;
  marketId: string;
  type: FlowTransactionType;
  status: FlowTransactionStatus;
  transactionId: string;
  signer: string;
  network: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

type RoleType = "admin" | "operator" | "oracle" | "patrol";

interface RoleRecord {
  id: string;
  address: string;
  role: RoleType;
  createdAt: string;
}

interface FlowUserRecord {
  address: string;
  label: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
}

interface MonitoringState {
  counters: Array<{ name: string; count: number }>;
  summaries: Array<{ name: string; count: number; sum: number; min: number; max: number; avg: number }>;
  errors: Array<{ metric: string; lastMessage: string; occurrences: number }>;
  timestamp: string;
  alertCount: number;
}

interface PointLedgerEntryRecord {
  id: string;
  address: string;
  source: string;
  amount: number;
  reference?: string;
  notes?: string;
  createdAt: string;
}

interface LeaderboardSnapshotRecord {
  capturedAt: string;
  entries: Array<{
    address: string;
    total: number;
    rank: number;
  }>;
}

type SchedulerTaskType =
  | "MARKET_OPEN"
  | "MARKET_LOCK"
  | "MARKET_CLOSE"
  | "MARKET_SETTLE"
  | "PATROL_SCAN"
  | "LEADERBOARD_SNAPSHOT"
  | "CUSTOM";

type SchedulerTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

interface SchedulerTaskRecord {
  id: string;
  marketId: string | null;
  type: SchedulerTaskType;
  status: SchedulerTaskStatus;
  scheduledFor: string;
  description: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface TaskExecutionEffectRecord {
  marketId?: string;
  stateChangedTo?: string;
  workflowAction?: string;
  notes?: string;
  leaderboardSnapshot?: {
    capturedAt: string;
    entries: Array<{
      address: string;
      total: number;
      rank: number;
    }>;
  };
}

interface TaskExecutionResultRecord {
  task: SchedulerTaskRecord;
  effect?: TaskExecutionEffectRecord;
}

const marketsBySlug = new Map<string, MarketRecord>();
const marketsById = new Map<string, MarketRecord>();
const marketStorageBySlug = new Map<string, MarketStorageRecord>();
const marketStorageById = new Map<string, MarketStorageRecord>();
const marketPoolStateById = new Map<string, MarketPoolStateRecord>();
const marketTradesById = new Map<string, MarketTradeRecord[]>();
const marketTransactionsById = new Map<string, MarketTransactionRecord[]>();
const roles = new Map<string, RoleRecord>();
const flowUsers = new Map<string, FlowUserRecord>();
const ALLOWED_ROLES: RoleType[] = ["admin", "operator", "oracle", "patrol"];

const userPoints = new Map<string, number>();
const pointsLedgerByAddress = new Map<string, PointLedgerEntryRecord[]>();
const leaderboardSnapshots: LeaderboardSnapshotRecord[] = [];
const schedulerTasks: SchedulerTaskRecord[] = [];

const normalizeAddress = (value: string): string => value.trim().toLowerCase();

const touchFlowUser = (
  address: string,
  options: { label?: string | null; seenAt?: string } = {}
): FlowUserRecord => {
  const normalized = normalizeAddress(address);
  const timestamp = options.seenAt ?? new Date().toISOString();
  const existing = flowUsers.get(normalized);

  if (existing) {
    if (options.label !== undefined) {
      existing.label = options.label;
    }
    existing.lastSeenAt = timestamp;
    flowUsers.set(normalized, existing);
    return existing;
  }

  const record: FlowUserRecord = {
    address: normalized,
    label: options.label ?? null,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };

  flowUsers.set(normalized, record);
  return record;
};

const getAssignmentsForAddress = (address: string): RoleRecord[] => {
  const normalized = normalizeAddress(address);
  return Array.from(roles.values())
    .filter((entry) => normalizeAddress(entry.address) === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const buildRoleDirectory = () => {
  const addressKeys = new Set<string>();

  for (const user of Array.from(flowUsers.values())) {
    addressKeys.add(user.address);
  }

  for (const assignment of Array.from(roles.values())) {
    addressKeys.add(normalizeAddress(assignment.address));
  }

  const entries = Array.from(addressKeys).map((key) => {
    const assignments = getAssignmentsForAddress(key);
    const baselineSeenAt =
      assignments.length > 0
        ? assignments[assignments.length - 1].createdAt
        : new Date().toISOString();

    const user = flowUsers.get(key) ?? touchFlowUser(key, { seenAt: baselineSeenAt });

    const latestAssignment = assignments[0]?.createdAt;
    if (
      latestAssignment &&
      (!user.lastSeenAt || latestAssignment.localeCompare(user.lastSeenAt) > 0)
    ) {
      touchFlowUser(user.address, { seenAt: latestAssignment });
    }

    const refreshed = flowUsers.get(user.address)!;

    return {
      address: refreshed.address,
      label: refreshed.label,
      firstSeenAt: refreshed.firstSeenAt,
      lastSeenAt: refreshed.lastSeenAt,
      roles: assignments,
    };
  });

  entries.sort((a, b) => {
    const left = a.lastSeenAt ?? a.firstSeenAt;
    const right = b.lastSeenAt ?? b.firstSeenAt;
    return right.localeCompare(left);
  });

  return entries;
};

const createDefaultMonitoringState = (): MonitoringState => ({
  counters: [
    { name: "api.markets.list", count: 128 },
    { name: "api.markets.detail", count: 94 },
    { name: "api.admin.roles", count: 42 },
  ],
  summaries: [
    { name: "api.markets.duration", count: 128, sum: 5120, min: 12, max: 132, avg: 40 },
    { name: "api.trades.quote.duration", count: 56, sum: 1960, min: 18, max: 92, avg: 35 },
  ],
  errors: [
    {
      metric: "api.sync.lmsr",
      lastMessage: "Flow sync lag detected",
      occurrences: 2,
    },
  ],
  timestamp: new Date().toISOString(),
  alertCount: 0,
});

const monitoringState: MonitoringState = createDefaultMonitoringState();

const createInitialRoles = (): RoleRecord[] => {
  const adminCreatedAt = new Date(Date.now() - 1000 * 60 * 60).toISOString();
  const patrolCreatedAt = new Date(Date.now() - 1000 * 30).toISOString();

  touchFlowUser("0xadmin", { seenAt: adminCreatedAt });
  touchFlowUser("0xpatrol", { seenAt: patrolCreatedAt });

  return [
    {
      id: randomUUID(),
      address: normalizeAddress("0xadmin"),
      role: "admin",
      createdAt: adminCreatedAt,
    },
    {
      id: randomUUID(),
      address: normalizeAddress("0xpatrol"),
      role: "patrol",
      createdAt: patrolCreatedAt,
    },
  ];
};

const createDefaultSchedulerTasks = (): SchedulerTaskRecord[] => {
  const now = Date.now();
  return [
    {
      id: randomUUID(),
      marketId: null,
      type: "LEADERBOARD_SNAPSHOT",
      status: "PENDING",
      scheduledFor: new Date(now + 5 * 60 * 1000).toISOString(),
      description: "Capture hourly leaderboard snapshot",
      payload: null,
      attempts: 0,
      lastError: null,
      lastAttemptAt: null,
      completedAt: null,
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      createdBy: "system",
    },
    {
      id: randomUUID(),
      marketId: "market-live",
      type: "MARKET_CLOSE",
      status: "PENDING",
      scheduledFor: new Date(now + 30 * 60 * 1000).toISOString(),
      description: "Close market admin-dashboard-e2e",
      payload: { slug: "admin-dashboard-e2e" },
      attempts: 0,
      lastError: null,
      lastAttemptAt: null,
      completedAt: null,
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
      createdBy: "scheduler",
    },
    {
      id: randomUUID(),
      marketId: "market-scan",
      type: "PATROL_SCAN",
      status: "PENDING",
      scheduledFor: new Date(now + 15 * 60 * 1000).toISOString(),
      description: "Patrol scan for anomalous odds",
      payload: { severity: "warning" },
      attempts: 0,
      lastError: null,
      lastAttemptAt: null,
      completedAt: null,
      createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 2 * 60 * 1000).toISOString(),
      createdBy: "scheduler",
    },
  ];
};

const cloneTask = (task: SchedulerTaskRecord): SchedulerTaskRecord => ({
  ...task,
  payload: task.payload ? { ...task.payload } : null,
});

const completeTask = (task: SchedulerTaskRecord): TaskExecutionResultRecord => {
  const timestamp = new Date().toISOString();
  task.status = "COMPLETED";
  task.lastAttemptAt = timestamp;
  task.completedAt = timestamp;
  task.attempts += 1;
  task.updatedAt = timestamp;

  const effect: TaskExecutionEffectRecord = {};
  if (task.marketId) {
    effect.marketId = task.marketId;
    effect.stateChangedTo =
      task.type === "MARKET_OPEN"
        ? "live"
        : task.type === "MARKET_CLOSE"
        ? "closed"
        : task.type === "MARKET_SETTLE"
        ? "settled"
        : undefined;
    if (effect.stateChangedTo) {
      effect.workflowAction = effect.stateChangedTo;
    }
  }

  if (task.type === "LEADERBOARD_SNAPSHOT") {
    effect.leaderboardSnapshot = {
      capturedAt: timestamp,
      entries: getLeaderboardEntries(10).map((entry) => ({ ...entry })),
    };
  }

  return {
    task: cloneTask(task),
    effect: Object.keys(effect).length > 0 ? effect : undefined,
  };
};

const upsertLedgerEntry = (entry: PointLedgerEntryRecord) => {
  const existing = pointsLedgerByAddress.get(entry.address) ?? [];
  existing.unshift(entry);
  pointsLedgerByAddress.set(entry.address, existing);
};

const getLeaderboardEntries = (limit = 20): LeaderboardSnapshotRecord["entries"] => {
  const normalizedLimit = Math.min(Math.max(limit, 1), 100);
  const entries = Array.from(userPoints.entries())
    .map(([address, total]) => ({ address, total }))
    .sort((a, b) => {
      if (b.total === a.total) {
        return a.address.localeCompare(b.address);
      }
      return b.total - a.total;
    })
    .slice(0, normalizedLimit)
    .map((entry, index) => ({
      address: entry.address,
      total: entry.total,
      rank: index + 1,
    }));

  return entries;
};

const captureSnapshot = (
  limit = 20,
  capturedAt = new Date().toISOString()
): LeaderboardSnapshotRecord => {
  const timestamp = new Date(capturedAt).toISOString();
  const snapshot: LeaderboardSnapshotRecord = {
    capturedAt: timestamp,
    entries: getLeaderboardEntries(limit).map((entry) => ({ ...entry })),
  };

  leaderboardSnapshots.push(snapshot);
  leaderboardSnapshots.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return snapshot;
};

const seedPointsState = () => {
  userPoints.clear();
  pointsLedgerByAddress.clear();
  leaderboardSnapshots.length = 0;

  const seedEntries: Array<{ address: string; total: number }> = [
    { address: "0xalpha", total: 320 },
    { address: "0xbravo", total: 210 },
    { address: "0xcharlie", total: 125 },
  ];

  const now = new Date().toISOString();
  for (const seed of seedEntries) {
    const normalized = normalizeAddress(seed.address);
    touchFlowUser(normalized, { seenAt: now });
    userPoints.set(normalized, seed.total);
    upsertLedgerEntry({
      id: randomUUID(),
      address: normalized,
      source: "BONUS",
      amount: seed.total,
      reference: "seed",
      notes: "Initial seed",
      createdAt: now,
    });
  }

  captureSnapshot(10, now);
};

const awardPointsInternal = (
  address: string,
  amount: number,
  source: string,
  options: { reference?: string; notes?: string } = {}
): PointLedgerEntryRecord => {
  const normalized = normalizeAddress(address);
  touchFlowUser(normalized);

  const current = userPoints.get(normalized) ?? 0;
  userPoints.set(normalized, current + amount);

  const createdAt = new Date().toISOString();
  const entry: PointLedgerEntryRecord = {
    id: randomUUID(),
    address: normalized,
    source,
    amount,
    reference: options.reference,
    notes: options.notes,
    createdAt,
  };

  upsertLedgerEntry(entry);
  return entry;
};

const getPrimaryPointsAddress = (): string => {
  const iterator = userPoints.keys().next();
  if (!iterator.done) {
    return iterator.value;
  }
  return "0xalpha";
};

const roundPoints = (value: number): number => Math.round(value * 1e4) / 1e4;

const buildPointsSummary = (address: string) => {
  const normalized = normalizeAddress(address);
  const total = roundPoints(userPoints.get(normalized) ?? 0);
  return {
    address: normalized,
    total,
    updatedAt: new Date().toISOString(),
  };
};

const getLedgerEntriesForAddress = (address: string): PointLedgerEntryRecord[] => {
  const normalized = normalizeAddress(address);
  return pointsLedgerByAddress.get(normalized) ?? [];
};

const resetState = () => {
  marketsBySlug.clear();
  marketsById.clear();
  marketStorageBySlug.clear();
  marketStorageById.clear();
  marketPoolStateById.clear();
  marketTradesById.clear();
  marketTransactionsById.clear();

  flowUsers.clear();
  roles.clear();
  schedulerTasks.length = 0;
  schedulerTasks.push(...createDefaultSchedulerTasks());
  for (const entry of createInitialRoles()) {
    roles.set(entry.id, entry);
  }

  const nextMonitoring = createDefaultMonitoringState();
  monitoringState.counters = nextMonitoring.counters;
  monitoringState.summaries = nextMonitoring.summaries;
  monitoringState.errors = nextMonitoring.errors;
  monitoringState.timestamp = nextMonitoring.timestamp;
  monitoringState.alertCount = nextMonitoring.alertCount;

  seedPointsState();
};

resetState();

const incrementCounter = (name: string, amount = 1) => {
  const counter = monitoringState.counters.find((entry) => entry.name === name);
  if (counter) {
    counter.count += amount;
  } else {
    monitoringState.counters.push({ name, count: amount });
  }
};

const getTradeList = (marketId: string) => {
  if (!marketTradesById.has(marketId)) {
    marketTradesById.set(marketId, []);
  }
  return marketTradesById.get(marketId)!;
};

const getTransactionList = (marketId: string) => {
  if (!marketTransactionsById.has(marketId)) {
    marketTransactionsById.set(marketId, []);
  }
  return marketTransactionsById.get(marketId)!;
};

const recordTransaction = (
  market: MarketRecord,
  type: FlowTransactionType,
  options: Partial<Pick<MarketTransactionRecord, "status" | "signer" | "network" | "payload" | "transactionId" | "createdAt">> = {}
) => {
  const list = getTransactionList(market.id);
  const entry: MarketTransactionRecord = {
    id: randomUUID(),
    marketId: market.id,
    type,
    status: options.status ?? "SUCCESS",
    transactionId: options.transactionId ?? randomUUID(),
    signer: options.signer ?? "0xsystem",
    network: options.network ?? "emulator",
    payload: options.payload ?? null,
    createdAt: options.createdAt ?? new Date().toISOString(),
  };

  list.unshift(entry);
  if (list.length > 50) {
    list.length = 50;
  }
  return entry;
};

const recordTrade = (market: MarketRecord, trade: Omit<MarketTradeRecord, "id" | "marketId" | "transactionId" | "createdAt">) => {
  const list = getTradeList(market.id);
  const entry: MarketTradeRecord = {
    id: randomUUID(),
    marketId: market.id,
    transactionId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...trade,
  };

  list.unshift(entry);
  if (list.length > 100) {
    list.length = 100;
  }
  return entry;
};

const readBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
};

const sendJson = (response: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  response.end(body);
};

const sendEmpty = (response: ServerResponse, status: number): void => {
  response.writeHead(status, {
    "Content-Length": 0,
    "Access-Control-Allow-Origin": "*",
  });
  response.end();
};

const notFound = (response: ServerResponse): void => {
  sendJson(response, 404, { message: "Not Found" });
};

const methodNotAllowed = (response: ServerResponse): void => {
  sendJson(response, 405, { message: "Method Not Allowed" });
};

const normalizeKey = (key: string): string => {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
};

const findMarket = (key: string): MarketRecord | undefined => {
  const normalized = normalizeKey(key);
  return (
    marketsBySlug.get(normalized) ??
    marketsBySlug.get(key) ??
    marketsById.get(normalized) ??
    marketsById.get(key)
  );
};

const toIsoOrNull = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const sanitizeSchedule = (schedule?: Partial<MarketScheduleRecord>): MarketScheduleRecord => ({
  scheduledStartAt: toIsoOrNull(schedule?.scheduledStartAt ?? null),
  tradingLockAt: toIsoOrNull(schedule?.tradingLockAt ?? null),
  freezeWindowStartAt: toIsoOrNull(schedule?.freezeWindowStartAt ?? null),
  freezeWindowEndAt: toIsoOrNull(schedule?.freezeWindowEndAt ?? null),
});

const createPatrolSignals = (
  marketId: string,
  signals?: CreateMarketPayload["patrolSignals"]
): PatrolSignalRecord[] => {
  if (!signals || signals.length === 0) {
    return [];
  }

  return signals.map((signal) => ({
    id: `${marketId}-signal-${randomUUID()}`,
    issuer: signal.issuer ?? "0xpatrol",
    severity: signal.severity,
    code: signal.code,
    weight: signal.weight,
    createdAt: new Date().toISOString(),
    expiresAt: toIsoOrNull(signal.expiresAt ?? null) ?? undefined,
    notes: signal.notes,
  }));
};

const buildScheduleResponse = (schedule: MarketScheduleRecord) => ({
  ...(schedule.scheduledStartAt ? { scheduledStartAt: schedule.scheduledStartAt } : {}),
  ...(schedule.tradingLockAt ? { tradingLockAt: schedule.tradingLockAt } : {}),
  ...(schedule.freezeWindowStartAt ? { freezeWindowStartAt: schedule.freezeWindowStartAt } : {}),
  ...(schedule.freezeWindowEndAt ? { freezeWindowEndAt: schedule.freezeWindowEndAt } : {}),
});

const buildMarketDetail = (market: MarketRecord) => {
  const primaryOutcomeId = market.outcomes[0]?.id ?? null;
  const poolState = marketPoolStateById.get(market.id);

  return {
    id: market.id,
    slug: market.slug,
    title: market.title,
    description: market.description,
    state: market.state,
    category: market.category,
    tags: market.tags,
    createdAt: market.createdAt,
    closeAt: market.closeAt,
    oracleId: market.oracleId ?? undefined,
    patrolThreshold: market.patrolThreshold,
    schedule: buildScheduleResponse(market.schedule),
    primaryOutcomeId,
    totalLiquidity: poolState?.totalLiquidity ?? market.liquidityPool.totalLiquidity,
    liquidityPool: {
      id: `pool-${market.id}`,
      ...market.liquidityPool,
      totalLiquidity: poolState?.totalLiquidity ?? market.liquidityPool.totalLiquidity,
    },
    outcomes: market.outcomes,
    workflow: market.workflow,
    settlement: market.settlement,
    patrolSignals: market.patrolSignals,
  };
};

const buildMarketSummary = (market: MarketRecord) => {
  const poolState = marketPoolStateById.get(market.id);

  return {
    id: market.id,
    slug: market.slug,
    title: market.title,
    state: market.state,
    createdAt: market.createdAt,
    category: market.category,
    tags: market.tags,
    closeAt: market.closeAt,
    primaryOutcomeId: market.outcomes[0]?.id ?? null,
    totalLiquidity: poolState?.totalLiquidity ?? market.liquidityPool.totalLiquidity,
  };
};

const buildActionResult = (
  market: MarketRecord,
  options: { signer?: string; network?: string } = {}
) => {
  const { signer = "0xsystem", network = "emulator" } = options;

  return {
    market: buildMarketDetail(market),
    transactionPath: `/transactions/mock/${randomUUID()}`,
    cadenceArguments: [],
    transactionId: randomUUID(),
    signer,
    network,
  };
};

const appendWorkflow = (market: MarketRecord, entry: Omit<WorkflowEntry, "id">) => {
  const record: WorkflowEntry = {
    id: randomUUID(),
    ...entry,
  };

  market.workflow = [record, ...market.workflow].slice(0, 20);
  return record;
};

const requireMarket = (key: string, response: ServerResponse): MarketRecord | null => {
  const market = findMarket(key);
  if (!market) {
    notFound(response);
    return null;
  }
  return market;
};

const handleCreateMarket = async (request: IncomingMessage, response: ServerResponse) => {
  const payload = await readBody<CreateMarketPayload>(request);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const normalizedCategory = payload.category ?? "custom";
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
    : [];
  const schedule = sanitizeSchedule(payload.schedule);
  const patrolThreshold = Number.isFinite(Number(payload.patrolThreshold))
    ? Number(payload.patrolThreshold)
    : 0;
  const closeAt = toIsoOrNull(payload.closeAt ?? null);
  const outcomes = payload.outcomes.map((outcome, index) => ({
    id: `${payload.slug}-outcome-${index + 1}`,
    label: outcome.label,
    status: "active" as const,
    impliedProbability: outcome.impliedProbability,
    liquidity: outcome.liquidity,
  }));

  const record: MarketRecord = {
    id,
    slug: payload.slug,
    title: payload.title,
    description: payload.description,
    state: payload.state,
    category: normalizedCategory,
    tags,
    oracleId: payload.oracleId ?? null,
    createdAt,
    closeAt,
    patrolThreshold,
    schedule,
    patrolSignals: createPatrolSignals(id, payload.patrolSignals),
    liquidityPool: payload.liquidityPool,
    outcomes,
    workflow: [],
    settlement: null,
  };

  marketsBySlug.set(record.slug, record);
  marketsById.set(record.id, record);

  const storageRecord: MarketStorageRecord = {
    marketId: record.id,
    slug: record.slug,
    liquidityPoolPath: `/storage/fortePool_${record.slug}`,
    outcomeVaultPath: `/storage/forteOutcomeVault_${record.slug}`,
    liquidityReceiverPath: `/public/fortePoolReceiver_${record.slug}`,
    liquidityProviderPath: `/private/fortePoolProvider_${record.slug}`,
    outcomeReceiverPath: `/public/forteOutcomeReceiver_${record.slug}`,
    outcomeBalancePath: `/public/forteOutcomeBalance_${record.slug}`,
    outcomeProviderPath: `/private/forteOutcomeProvider_${record.slug}`,
    owner: "0xcoremarket",
  };

  marketStorageBySlug.set(record.slug, storageRecord);
  marketStorageById.set(record.id, storageRecord);

  const defaultPoolState: MarketPoolStateRecord = {
    liquidityParameter: 1,
    totalLiquidity: record.liquidityPool.totalLiquidity,
    outcomeSupply: record.outcomes.map((outcome) => outcome.liquidity),
    bVector: record.outcomes.map((outcome) => Math.log(outcome.impliedProbability || 0.01)),
  };

  marketPoolStateById.set(record.id, defaultPoolState);
  marketTradesById.set(record.id, []);
  marketTransactionsById.set(record.id, []);

  const baseProbabilities = record.outcomes.map((outcome) =>
    Math.max(0, Math.min(1, outcome.impliedProbability))
  );

  record.outcomes.forEach((outcome, index) => {
    recordTrade(record, {
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      outcomeIndex: index,
      shares: (outcome.liquidity / 10).toFixed(2),
      flowAmount: (outcome.liquidity / 20).toFixed(2),
      isBuy: index % 2 === 0,
      probabilities: baseProbabilities,
      maxFlowAmount: null,
      signer: "0xpreview",
      network: "emulator",
    });
  });

  recordTransaction(record, "CREATE_MARKET", {
    signer: "0xadmin",
    payload: { slug: record.slug, title: record.title },
  });
  recordTransaction(record, "CREATE_POOL", {
    signer: "0xoperator",
    payload: { totalLiquidity: record.liquidityPool.totalLiquidity },
  });

  incrementCounter("api.markets.create");

  sendJson(response, 201, buildMarketDetail(record));
};

const handleListMarkets = (_request: IncomingMessage, response: ServerResponse) => {
  const list = Array.from(marketsById.values()).map((market) => buildMarketSummary(market));
  sendJson(response, 200, list);
};

const handleGetMarket = (_request: IncomingMessage, response: ServerResponse, key: string) => {
  const market = findMarket(key);
  if (!market) {
    notFound(response);
    return;
  }

  sendJson(response, 200, buildMarketDetail(market));
};

const handleGetPoolState = (_request: IncomingMessage, response: ServerResponse, key: string) => {
  const market = findMarket(key);
  if (!market) {
    notFound(response);
    return;
  }

  const storedState = marketPoolStateById.get(market.id);

  if (storedState) {
    sendJson(response, 200, {
      liquidityParameter: storedState.liquidityParameter,
      totalLiquidity: storedState.totalLiquidity,
      bVector: storedState.bVector,
      outcomeSupply: storedState.outcomeSupply,
    });
    return;
  }

  const probabilities = market.outcomes.map((outcome) => outcome.impliedProbability);
  const bVector = probabilities.map((probability) => Math.log(probability || 0.01));
  const outcomeSupply = market.outcomes.map((outcome) => outcome.liquidity);

  sendJson(response, 200, {
    liquidityParameter: 1,
    totalLiquidity: market.liquidityPool.totalLiquidity,
    bVector,
    outcomeSupply,
  });
};

const handleQuoteTrade = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = findMarket(key);
  if (!market) {
    notFound(response);
    return;
  }

  const payload = await readBody<{
    outcomeIndex: number;
    shares: number;
    isBuy: boolean;
  }>(request);

  const shares = Number.isFinite(payload.shares) ? payload.shares : 0;
  const flowAmount = (shares * 12.5).toFixed(2);
  const outcomeAmount = shares.toFixed(2);
  const probabilities = market.outcomes.map((outcome) => outcome.impliedProbability);
  const normalizedProbabilities = probabilities.map((probability) =>
    Math.max(0, Math.min(1, probability))
  );

  sendJson(response, 200, {
    flowAmount,
    outcomeAmount,
    newBVector: normalizedProbabilities.map((probability) => probability.toFixed(4)),
    newTotalLiquidity: (market.liquidityPool.totalLiquidity + shares * 2).toFixed(2),
    newOutcomeSupply: market.outcomes.map((outcome) => (outcome.liquidity + shares).toFixed(2)),
    probabilities: normalizedProbabilities,
    cadenceArguments: [],
    transactionPath: `/transactions/mock/${randomUUID()}`,
  });
};

const handleBalances = (_request: IncomingMessage, response: ServerResponse) => {
  sendJson(response, 200, {
    flowBalance: "1000.00",
    outcomeBalance: "50.00",
  });
};

const normalizeLimit = (value: unknown): number | undefined => {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    return normalizeLimit(value[0]);
  }
  return undefined;
};

const handleGetTrades = (
  _request: IncomingMessage,
  response: ServerResponse,
  key: string,
  query: Record<string, unknown>
) => {
  const market = findMarket(key);
  if (!market) {
    notFound(response);
    return;
  }

  const limit = normalizeLimit(query.limit);
  const trades = getTradeList(market.id);
  const payload = typeof limit === "number" ? trades.slice(0, limit) : trades;
  sendJson(response, 200, payload);
};

const handleGetTransactions = (
  _request: IncomingMessage,
  response: ServerResponse,
  key: string,
  query: Record<string, unknown>
) => {
  const market = findMarket(key);
  if (!market) {
    notFound(response);
    return;
  }

  const limit = normalizeLimit(query.limit);
  const transactions = getTransactionList(market.id);
  const payload = typeof limit === "number" ? transactions.slice(0, limit) : transactions;
  sendJson(response, 200, payload);
};

const handleClaimRewards = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    outcomeIndex?: number;
    shares?: number;
    signer?: string;
    network?: string;
    maxFlowAmount?: number;
  }>(request);

  if (market.state !== "settled" || !market.settlement) {
    sendJson(response, 400, { message: "market must be settled before claiming" });
    return;
  }

  const outcomeIndex = Number(payload.outcomeIndex);
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0) {
    sendJson(response, 400, { message: "outcomeIndex must be a non-negative integer" });
    return;
  }

  const outcome = market.outcomes[outcomeIndex];
  if (!outcome) {
    sendJson(response, 400, { message: "outcome not found" });
    return;
  }

  if (outcome.id !== market.settlement.resolvedOutcomeId) {
    sendJson(response, 400, { message: "outcome is not the resolved result" });
    return;
  }

  const shares = Number(payload.shares);
  if (!Number.isFinite(shares) || shares <= 0) {
    sendJson(response, 400, { message: "shares must be a positive number" });
    return;
  }

  const normalizedSigner = normalizeAddress(payload.signer ?? "0xclaimer");
  const network = payload.network ?? "emulator";
  const transactionId = randomUUID();
  const flowAmount = Math.max(0.1, shares * 12.5);
  const flowAmountStr = flowAmount.toFixed(2);
  const outcomeAmountStr = shares.toFixed(2);
  const probabilities = market.outcomes.map((_, index) => (index === outcomeIndex ? 1 : 0));

  recordTransaction(market, "CLAIM_REWARDS", {
    signer: normalizedSigner,
    network,
    transactionId,
    payload: {
      outcomeIndex,
      shares,
      claimAmount: flowAmount,
    },
  });

  awardPointsInternal(normalizedSigner, flowAmount, "CLAIM", {
    reference: transactionId,
    notes: `claim:${market.slug}`,
  });

  sendJson(response, 200, {
    flowAmount: flowAmountStr,
    outcomeAmount: outcomeAmountStr,
    newBVector: probabilities.map((value) => value.toFixed(6)),
    newTotalLiquidity: market.liquidityPool.totalLiquidity.toFixed(2),
    newOutcomeSupply: market.outcomes.map((entry) => entry.liquidity.toFixed(2)),
    probabilities,
    cadenceArguments: [],
    transactionPath: `/transactions/mock/${transactionId}`,
    transactionId,
    signer: normalizedSigner,
    network,
    claimAmount: flowAmountStr,
    claimedShares: outcomeAmountStr,
  });
};

const handleGetMarketStorage = (
  _request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const storage = marketStorageById.get(key) ?? marketStorageBySlug.get(key);
  if (!storage) {
    notFound(response);
    return;
  }

  sendJson(response, 200, {
    liquidityPoolPath: storage.liquidityPoolPath,
    outcomeVaultPath: storage.outcomeVaultPath,
    liquidityReceiverPath: storage.liquidityReceiverPath,
    liquidityProviderPath: storage.liquidityProviderPath,
    outcomeReceiverPath: storage.outcomeReceiverPath,
    outcomeBalancePath: storage.outcomeBalancePath,
    outcomeProviderPath: storage.outcomeProviderPath,
    owner: storage.owner,
  });
};

const handleActivateMarket = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{ signer?: string; network?: string }>(request);

  market.state = "live";
  appendWorkflow(market, {
    type: "open",
    status: "executed",
    description: "Market activated manually",
    metadata: { signer: payload.signer ?? "0xadmin" },
  });
  incrementCounter("api.markets.activate");
  recordTransaction(market, "ACTIVATE", {
    signer: payload.signer ?? "0xadmin",
    network: payload.network ?? "emulator",
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleSuspendMarket = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{ signer?: string; network?: string; reason?: string }>(request);

  market.state = "suspended";
  appendWorkflow(market, {
    type: "suspend",
    status: "executed",
    description: payload.reason?.trim() ?? "Market suspended",
    metadata: { signer: payload.signer ?? "0xoperator" },
  });
  incrementCounter("api.markets.suspend");
  recordTransaction(market, "SUSPEND", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: payload.reason ? { reason: payload.reason } : null,
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleCloseMarket = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    signer?: string;
    network?: string;
    reason?: string;
    closedAt?: string;
  }>(request);

  const closedAt = toIsoOrNull(payload.closedAt ?? null) ?? new Date().toISOString();
  market.state = "closed";
  market.closeAt = closedAt;

  appendWorkflow(market, {
    type: "custom",
    status: "executed",
    description: payload.reason?.trim()?.length
      ? `Market closed: ${payload.reason.trim()}`
      : "Market closed",
    metadata: {
      signer: payload.signer ?? "0xoperator",
      ...(payload.reason ? { reason: payload.reason.trim() } : {}),
    },
  });
  incrementCounter("api.markets.close");
  recordTransaction(market, "CLOSE", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: {
      closedAt,
      ...(payload.reason ? { reason: payload.reason.trim() } : {}),
    },
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleUpdateSchedule = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    signer?: string;
    network?: string;
    scheduledStartAt?: string;
    tradingLockAt?: string;
    freezeWindowStartAt?: string;
    freezeWindowEndAt?: string;
  }>(request);

  const normalize = (value: string | undefined): string | undefined => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    const iso = toIsoOrNull(value);
    if (!iso) {
      return undefined;
    }
    return iso;
  };

  const updates: Partial<MarketScheduleRecord> = {};
  const scheduledStartAt = normalize(payload.scheduledStartAt);
  const tradingLockAt = normalize(payload.tradingLockAt);
  const freezeWindowStartAt = normalize(payload.freezeWindowStartAt);
  const freezeWindowEndAt = normalize(payload.freezeWindowEndAt);

  if (scheduledStartAt) {
    updates.scheduledStartAt = scheduledStartAt;
  }
  if (tradingLockAt) {
    updates.tradingLockAt = tradingLockAt;
  }
  if (freezeWindowStartAt) {
    updates.freezeWindowStartAt = freezeWindowStartAt;
  }
  if (freezeWindowEndAt) {
    updates.freezeWindowEndAt = freezeWindowEndAt;
  }

  if (Object.keys(updates).length === 0) {
    sendJson(response, 400, { message: "schedule update requires at least one field" });
    return;
  }

  market.schedule = {
    ...market.schedule,
    ...updates,
  };

  appendWorkflow(market, {
    type: "custom",
    status: "executed",
    description: "Schedule updated",
    metadata: {
      signer: payload.signer ?? "0xoperator",
    },
  });
  incrementCounter("api.markets.schedule.update");
  recordTransaction(market, "UPDATE_SCHEDULE", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: updates,
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleUpdatePatrolThreshold = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{ signer?: string; network?: string; patrolThreshold?: number }>(
    request
  );

  const value = Number(payload.patrolThreshold);
  if (!Number.isFinite(value) || value < 0) {
    sendJson(response, 400, { message: "patrolThreshold must be a non-negative number" });
    return;
  }

  market.patrolThreshold = value;
  incrementCounter("api.markets.patrol.threshold");
  recordTransaction(market, "UPDATE_PATROL_THRESHOLD", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: { patrolThreshold: value },
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleRecordPatrolSignal = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    signer?: string;
    network?: string;
    severity?: PatrolSignalSeverity | string;
    code?: string;
    weight?: number;
    issuer?: string;
    notes?: string;
    expiresAt?: string;
  }>(request);

  const severity = (payload.severity ?? "warning").toString().toLowerCase() as PatrolSignalSeverity;
  if (severity !== "info" && severity !== "warning" && severity !== "critical") {
    sendJson(response, 400, { message: "invalid severity" });
    return;
  }

  if (!payload.code || typeof payload.code !== "string") {
    sendJson(response, 400, { message: "code is required" });
    return;
  }

  const weight = Number(payload.weight);
  if (!Number.isFinite(weight) || weight <= 0) {
    sendJson(response, 400, { message: "weight must be positive" });
    return;
  }

  const issuer = (payload.issuer ?? "0xpatrol").trim();
  const expiresAt = toIsoOrNull(payload.expiresAt ?? null) ?? undefined;
  const notes = payload.notes?.trim();

  const record: PatrolSignalRecord = {
    id: `${market.id}-signal-${randomUUID()}`,
    issuer,
    severity,
    code: payload.code.trim(),
    weight,
    createdAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
    ...(notes ? { notes } : {}),
  };

  market.patrolSignals = [record, ...market.patrolSignals.filter((signal) => signal.issuer !== issuer)]
    .slice(0, 20);

  incrementCounter("api.markets.patrol.record");
  recordTransaction(market, "RECORD_PATROL_SIGNAL", {
    signer: payload.signer ?? issuer,
    network: payload.network ?? "emulator",
    payload: {
      issuer,
      code: record.code,
      severity: record.severity,
      weight: record.weight,
      ...(expiresAt ? { expiresAt } : {}),
    },
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleClearPatrolSignal = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    signer?: string;
    network?: string;
    patrolAddress?: string;
  }>(request);

  if (!payload.patrolAddress || typeof payload.patrolAddress !== "string") {
    sendJson(response, 400, { message: "patrolAddress is required" });
    return;
  }

  const target = payload.patrolAddress.trim();
  market.patrolSignals = market.patrolSignals.filter((signal) => signal.issuer !== target);

  incrementCounter("api.markets.patrol.clear");
  recordTransaction(market, "CLEAR_PATROL_SIGNAL", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: { patrolAddress: target },
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleVoidMarket = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{ signer?: string; network?: string }>(request);

  market.state = "voided";
  appendWorkflow(market, {
    type: "void",
    status: "executed",
    description: "Market voided",
    metadata: { signer: payload.signer ?? "0xoperator" },
  });
  incrementCounter("api.markets.void");
  recordTransaction(market, "VOID", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleSettleMarket = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    signer?: string;
    network?: string;
    outcomeId: number;
    resolvedOutcomeId: string;
    txHash: string;
    notes?: string;
  }>(request);

  if (typeof payload.outcomeId !== "number" || Number.isNaN(payload.outcomeId)) {
    sendJson(response, 400, { message: "outcomeId is required" });
    return;
  }

  if (!payload.resolvedOutcomeId || !payload.txHash) {
    sendJson(response, 400, { message: "resolvedOutcomeId and txHash are required" });
    return;
  }

  market.state = "settled";
  market.settlement = {
    id: randomUUID(),
    resolvedOutcomeId: payload.resolvedOutcomeId,
    txId: payload.txHash,
    settledAt: new Date().toISOString(),
    notes: payload.notes,
  };

  appendWorkflow(market, {
    type: "settle",
    status: "executed",
    description: `Market settled (outcome #${payload.outcomeId})`,
    metadata: { signer: payload.signer ?? "0xoracle" },
  });
  incrementCounter("api.markets.settle");
  recordTransaction(market, "SETTLE", {
    signer: payload.signer ?? "0xoracle",
    network: payload.network ?? "emulator",
    payload: {
      outcomeId: payload.outcomeId,
      resolvedOutcomeId: payload.resolvedOutcomeId,
      txHash: payload.txHash,
    },
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleOverrideSettlement = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    signer?: string;
    network?: string;
    outcomeId: number;
    resolvedOutcomeId: string;
    txHash: string;
    reason: string;
    notes?: string;
  }>(request);

  if (!payload.reason || !payload.resolvedOutcomeId || !payload.txHash) {
    sendJson(response, 400, { message: "reason, resolvedOutcomeId and txHash are required" });
    return;
  }

  market.state = "settled";
  market.settlement = {
    id: market.settlement?.id ?? randomUUID(),
    resolvedOutcomeId: payload.resolvedOutcomeId,
    txId: payload.txHash,
    settledAt: new Date().toISOString(),
    notes: payload.notes ?? market.settlement?.notes,
    overrideReason: payload.reason,
  };

  appendWorkflow(market, {
    type: "settle",
    status: "executed",
    description: `Market settlement overridden (outcome #${payload.outcomeId})`,
    metadata: { signer: payload.signer ?? "0xoracle" },
  });
  incrementCounter("api.markets.override");
  recordTransaction(market, "OVERRIDE_SETTLEMENT", {
    signer: payload.signer ?? "0xoracle",
    network: payload.network ?? "emulator",
    payload: {
      outcomeId: payload.outcomeId,
      resolvedOutcomeId: payload.resolvedOutcomeId,
      txHash: payload.txHash,
      reason: payload.reason,
    },
  });

  sendJson(response, 200, buildActionResult(market, payload));
};

const handleCreatePool = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    outcomeCount: number;
    liquidityParameter: number;
    seedAmount: number;
    signer?: string;
    network?: string;
  }>(request);

  const normalizedOutcomeCount = Number.isFinite(Number(payload.outcomeCount))
    ? Math.max(1, Math.trunc(Number(payload.outcomeCount)))
    : market.outcomes.length;
  const normalizedSeedAmount = Number.isFinite(Number(payload.seedAmount))
    ? Number(payload.seedAmount)
    : market.liquidityPool.totalLiquidity;
  const normalizedLiquidityParameter = Number.isFinite(Number(payload.liquidityParameter))
    ? Number(payload.liquidityParameter)
    : 1;

  const distribution = Array.from({ length: normalizedOutcomeCount }, () =>
    normalizedSeedAmount > 0 ? normalizedSeedAmount / normalizedOutcomeCount : 0
  );

  marketPoolStateById.set(market.id, {
    liquidityParameter: normalizedLiquidityParameter,
    totalLiquidity: normalizedSeedAmount,
    outcomeSupply: distribution,
    bVector: distribution.map((value) =>
      Math.log((value || 0.01) / Math.max(normalizedSeedAmount || 1, 1))
    ),
  });

  market.liquidityPool.totalLiquidity = normalizedSeedAmount;
  incrementCounter("api.markets.pool.create");
  recordTransaction(market, "CREATE_POOL", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: {
      outcomeCount: normalizedOutcomeCount,
      liquidityParameter: normalizedLiquidityParameter,
      seedAmount: normalizedSeedAmount,
    },
  });

  sendJson(response, 200, {
    outcomeCount: normalizedOutcomeCount,
    liquidityParameter: normalizedLiquidityParameter.toFixed(2),
    seedAmount: normalizedSeedAmount.toFixed(2),
    transactionPath: `/transactions/mock/${randomUUID()}`,
    cadenceArguments: [],
    transactionId: randomUUID(),
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
  });
};

const handleSyncPoolState = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{
    bVector: number[];
    totalLiquidity: number;
    outcomeSupply: number[];
    signer?: string;
    network?: string;
  }>(request);

  const normalizedTotalLiquidity = Number.isFinite(Number(payload.totalLiquidity))
    ? Number(payload.totalLiquidity)
    : market.liquidityPool.totalLiquidity;
  const normalizedOutcomeSupply = Array.isArray(payload.outcomeSupply)
    ? payload.outcomeSupply.map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0))
    : [];
  const normalizedBVector = Array.isArray(payload.bVector)
    ? payload.bVector.map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0))
    : [];

  marketPoolStateById.set(market.id, {
    liquidityParameter: marketPoolStateById.get(market.id)?.liquidityParameter ?? 1,
    totalLiquidity: normalizedTotalLiquidity,
    outcomeSupply: normalizedOutcomeSupply,
    bVector: normalizedBVector,
  });

  market.liquidityPool.totalLiquidity = normalizedTotalLiquidity;

  incrementCounter("api.markets.pool.sync");
  recordTransaction(market, "SYNC_POOL", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: {
      totalLiquidity: normalizedTotalLiquidity,
    },
  });

  sendJson(response, 200, {
    bVector: normalizedBVector.map((value) => value.toFixed(4)),
    totalLiquidity: normalizedTotalLiquidity.toFixed(2),
    outcomeSupply: normalizedOutcomeSupply.map((value) => value.toFixed(2)),
    transactionPath: `/transactions/mock/${randomUUID()}`,
    cadenceArguments: [],
    transactionId: randomUUID(),
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
  });
};

const handleMintOutcome = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{ amount: number; signer?: string; network?: string }>(request);
  const state = marketPoolStateById.get(market.id) ?? {
    liquidityParameter: 1,
    totalLiquidity: market.liquidityPool.totalLiquidity,
    outcomeSupply: market.outcomes.map((outcome) => outcome.liquidity),
    bVector: market.outcomes.map((outcome) => Math.log(outcome.impliedProbability || 0.01)),
  };

  const amount = Number.isFinite(Number(payload.amount)) ? Number(payload.amount) : 0;
  state.totalLiquidity += amount;
  if (state.outcomeSupply.length > 0) {
    state.outcomeSupply[0] = (state.outcomeSupply[0] ?? 0) + amount;
  }

  marketPoolStateById.set(market.id, state);
  market.liquidityPool.totalLiquidity = state.totalLiquidity;
  incrementCounter("api.markets.outcomes.mint");
  recordTransaction(market, "MINT_OUTCOME", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: { amount },
  });

  sendJson(response, 200, {
    amount: amount.toFixed(2),
    transactionPath: `/transactions/mock/${randomUUID()}`,
    cadenceArguments: [],
    transactionId: randomUUID(),
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
  });
};

const handleBurnOutcome = async (
  request: IncomingMessage,
  response: ServerResponse,
  key: string
) => {
  const market = requireMarket(key, response);
  if (!market) {
    return;
  }

  const payload = await readBody<{ amount: number; signer?: string; network?: string }>(request);
  const state = marketPoolStateById.get(market.id);
  if (!state) {
    sendJson(response, 400, { message: "pool not initialized" });
    return;
  }

  const amount = Number.isFinite(Number(payload.amount)) ? Number(payload.amount) : 0;
  state.totalLiquidity = Math.max(0, state.totalLiquidity - amount);
  if (state.outcomeSupply.length > 0) {
    state.outcomeSupply[0] = Math.max(0, (state.outcomeSupply[0] ?? 0) - amount);
  }

  marketPoolStateById.set(market.id, state);
  market.liquidityPool.totalLiquidity = state.totalLiquidity;
  incrementCounter("api.markets.outcomes.burn");
  recordTransaction(market, "BURN_OUTCOME", {
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
    payload: { amount },
  });

  sendJson(response, 200, {
    amount: amount.toFixed(2),
    transactionPath: `/transactions/mock/${randomUUID()}`,
    cadenceArguments: [],
    transactionId: randomUUID(),
    signer: payload.signer ?? "0xoperator",
    network: payload.network ?? "emulator",
  });
};

const handleListRoles = (_request: IncomingMessage, response: ServerResponse) => {
  const list = Array.from(roles.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  sendJson(response, 200, list);
};

const handleRoleDirectory = (_request: IncomingMessage, response: ServerResponse) => {
  const directory = buildRoleDirectory();
  console.log("[mock] GET /admin/roles/directory", JSON.stringify(directory, null, 2));
  sendJson(response, 200, directory);
};

const handleAssignRole = async (request: IncomingMessage, response: ServerResponse) => {
  const payload = await readBody<{ address?: string; role?: RoleType; label?: string | null }>(
    request
  );

  if (!payload.address || typeof payload.address !== "string") {
    sendJson(response, 400, { message: "address is required" });
    return;
  }

  if (!payload.role || !ALLOWED_ROLES.includes(payload.role)) {
    sendJson(response, 400, { message: "invalid role" });
    return;
  }

  const address = normalizeAddress(payload.address);
  if (!address) {
    sendJson(response, 400, { message: "address is required" });
    return;
  }

  let labelUpdate: string | null | undefined = undefined;
  if (payload.label !== undefined) {
    if (payload.label === null) {
      labelUpdate = null;
    } else if (typeof payload.label === "string") {
      const trimmed = payload.label.trim();
      labelUpdate = trimmed.length > 0 ? trimmed : null;
    }
  }

  const now = new Date().toISOString();
  touchFlowUser(address, { label: labelUpdate, seenAt: now });

  const record: RoleRecord = {
    id: randomUUID(),
    address,
    role: payload.role,
    createdAt: now,
  };

  roles.set(record.id, record);
  sendJson(response, 201, record);
};

const handleDeleteRole = (_request: IncomingMessage, response: ServerResponse, id: string) => {
  const record = roles.get(id);
  if (!record) {
    notFound(response);
    return;
  }

  roles.delete(id);
  touchFlowUser(record.address);
  sendEmpty(response, 204);
};

const handleResetState = (_request: IncomingMessage, response: ServerResponse) => {
  resetState();
  sendEmpty(response, 204);
};

const handleMonitoringMetrics = (_request: IncomingMessage, response: ServerResponse) => {
  monitoringState.timestamp = new Date().toISOString();
  sendJson(response, 200, {
    counters: monitoringState.counters,
    summaries: monitoringState.summaries,
    errors: monitoringState.errors,
    timestamp: monitoringState.timestamp,
    alertCount: monitoringState.alertCount,
  });
};

const handleGetLeaderboard = (
  _request: IncomingMessage,
  response: ServerResponse,
  query: Record<string, unknown>
) => {
  const limitRaw = query.limit;
  const limit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : undefined;
  sendJson(response, 200, getLeaderboardEntries(limit ?? 20));
};

const handleGetLeaderboardSnapshots = (
  _request: IncomingMessage,
  response: ServerResponse,
  query: Record<string, unknown>
) => {
  const limitRaw = query.limit;
  const limit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : 5;
  const after = typeof query.after === "string" ? new Date(query.after) : undefined;
  const before = typeof query.before === "string" ? new Date(query.before) : undefined;

  const filtered = leaderboardSnapshots.filter((snapshot) => {
    const timestamp = new Date(snapshot.capturedAt).getTime();
    if (Number.isNaN(timestamp)) {
      return false;
    }
    if (after && timestamp <= after.getTime()) {
      return false;
    }
    if (before && timestamp >= before.getTime()) {
      return false;
    }
    return true;
  });

  const normalizedLimit = Math.min(Math.max(limit, 1), 50);
  sendJson(
    response,
    200,
    filtered
      .slice(0, normalizedLimit)
      .map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        entries: snapshot.entries.map((entry) => ({ ...entry })),
      }))
  );
};

const handleCaptureSnapshot = async (request: IncomingMessage, response: ServerResponse) => {
  const payload = await readBody<{ limit?: number | string; capturedAt?: string }>(request);
  let limit: number | undefined;
  if (typeof payload.limit === "number") {
    limit = payload.limit;
  } else if (typeof payload.limit === "string") {
    const parsed = Number.parseInt(payload.limit, 10);
    if (Number.isFinite(parsed)) {
      limit = parsed;
    }
  }

  const capturedAt = payload.capturedAt ? new Date(payload.capturedAt).toISOString() : undefined;
  const snapshot = captureSnapshot(limit ?? 20, capturedAt ?? new Date().toISOString());
  sendJson(response, 200, snapshot);
};

const handleAwardPoints = async (request: IncomingMessage, response: ServerResponse) => {
  const payload = await readBody<{
    address?: string;
    amount?: number | string;
    source?: string;
    reference?: string;
    notes?: string;
  }>(request);

  if (!payload.address || typeof payload.address !== "string" || payload.address.trim().length === 0) {
    sendJson(response, 400, { message: "address is required" });
    return;
  }

  const amountValue =
    typeof payload.amount === "number"
      ? payload.amount
      : typeof payload.amount === "string"
        ? Number.parseFloat(payload.amount)
        : Number.NaN;

  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    sendJson(response, 400, { message: "amount must be a positive number" });
    return;
  }

  if (!payload.source || typeof payload.source !== "string" || payload.source.trim().length === 0) {
    sendJson(response, 400, { message: "source is required" });
    return;
  }

  const entry = awardPointsInternal(payload.address, amountValue, payload.source.toUpperCase(), {
    reference: payload.reference && payload.reference.trim().length > 0 ? payload.reference.trim() : undefined,
    notes: payload.notes && payload.notes.trim().length > 0 ? payload.notes.trim() : undefined,
  });

  sendJson(response, 200, {
    id: entry.id,
    address: entry.address,
    source: entry.source,
    amount: entry.amount,
    reference: entry.reference,
    notes: entry.notes,
    createdAt: entry.createdAt,
  });
};

const handleGetMyPoints = (_request: IncomingMessage, response: ServerResponse) => {
  const address = getPrimaryPointsAddress();
  sendJson(response, 200, buildPointsSummary(address));
};

const handleGetPointsLedger = (
  response: ServerResponse,
  address: string,
  query: Record<string, unknown>
) => {
  const entries = getLedgerEntriesForAddress(address);
  const limitRaw = query.limit;
  const limit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : undefined;
  const normalizedLimit = limit && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
  const payloadEntries = normalizedLimit ? entries.slice(0, normalizedLimit) : entries;

  sendJson(response, 200, {
    entries: payloadEntries.map((entry) => ({ ...entry })),
    nextCursor: undefined,
  });
};

const handleGetMyLedger = (
  _request: IncomingMessage,
  response: ServerResponse,
  query: Record<string, unknown>
) => {
  const address = getPrimaryPointsAddress();
  handleGetPointsLedger(response, address, query);
};

const handleGetPointsSummary = (
  _request: IncomingMessage,
  response: ServerResponse,
  address: string
) => {
  sendJson(response, 200, buildPointsSummary(address));
};

const handleSendMonitoringAlert = (_request: IncomingMessage, response: ServerResponse) => {
  monitoringState.alertCount += 1;
  const metricId = `monitoring.alert.${monitoringState.alertCount}`;
  monitoringState.errors.unshift({
    metric: metricId,
    lastMessage: "Test alert dispatched",
    occurrences: 1,
  });
  monitoringState.errors = monitoringState.errors.slice(0, 6);
  monitoringState.timestamp = new Date().toISOString();
  sendEmpty(response, 202);
};

const handleListSchedulerTasks = (
  _request: IncomingMessage,
  response: ServerResponse,
  query: Record<string, unknown>
) => {
  const statusRaw = typeof query.status === "string" ? query.status.toUpperCase() : undefined;
  const typeRaw = typeof query.type === "string" ? query.type.toUpperCase() : undefined;
  const limitRaw = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : undefined;

  let result = schedulerTasks.slice();
  if (statusRaw && ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"].includes(statusRaw)) {
    result = result.filter((task) => task.status === statusRaw);
  }
  if (
    typeRaw &&
    [
      "MARKET_OPEN",
      "MARKET_LOCK",
      "MARKET_CLOSE",
      "MARKET_SETTLE",
      "PATROL_SCAN",
      "LEADERBOARD_SNAPSHOT",
      "CUSTOM",
    ].includes(typeRaw)
  ) {
    result = result.filter((task) => task.type === typeRaw);
  }

  const normalizedLimit =
    limitRaw && Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : undefined;
  const payload = normalizedLimit ? result.slice(0, normalizedLimit) : result;

  sendJson(
    response,
    200,
    payload.map((task) => cloneTask(task))
  );
};

const handleRunSchedulerTaskRequest = (
  _request: IncomingMessage,
  response: ServerResponse,
  taskId: string
) => {
  const task = schedulerTasks.find((entry) => entry.id === taskId);
  if (!task) {
    notFound(response);
    return;
  }

  const result = completeTask(task);
  sendJson(response, 200, result);
};

const handleRunDueSchedulerTasks = async (
  request: IncomingMessage,
  response: ServerResponse
) => {
  const payload = await readBody<{ limit?: number | string }>(request);
  let limit: number | undefined;
  if (typeof payload.limit === "number") {
    limit = payload.limit;
  } else if (typeof payload.limit === "string") {
    const parsed = Number.parseInt(payload.limit, 10);
    if (Number.isFinite(parsed)) {
      limit = parsed;
    }
  }

  const normalizedLimit =
    limit && Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), schedulerTasks.length) : undefined;

  const pending = schedulerTasks
    .filter((task) => task.status === "PENDING")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const batch = normalizedLimit ? pending.slice(0, normalizedLimit) : pending;
  const results = batch.map((task) => completeTask(task));
  sendJson(response, 200, results);
};

const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
  const method = request.method ?? "GET";
  const url = request.url ?? "";
  if (url) {
    console.log(`[mock] ${method} ${url}`);
  }

  const { pathname, query } = parseUrl(url, true);

  if (!pathname) {
    notFound(response);
    return;
  }

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  if (pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (pathname === "/admin/reset" && request.method === "POST") {
    handleResetState(request, response);
    return;
  }

  if (pathname === "/admin/roles/directory" && request.method === "GET") {
    handleRoleDirectory(request, response);
    return;
  }

  if (pathname === "/admin/roles" && request.method === "GET") {
    handleListRoles(request, response);
    return;
  }

  if (pathname === "/admin/roles" && request.method === "POST") {
    await handleAssignRole(request, response);
    return;
  }

  const roleMatch = pathname.match(/^\/admin\/roles\/(.+)$/);
  if (roleMatch && request.method === "DELETE") {
    handleDeleteRole(request, response, roleMatch[1]);
    return;
  }

  if (pathname === "/monitoring/metrics" && request.method === "GET") {
    handleMonitoringMetrics(request, response);
    return;
  }

  if (pathname === "/monitoring/alerts/test" && request.method === "POST") {
    handleSendMonitoringAlert(request, response);
    return;
  }

  if (pathname === "/scheduler/tasks" && request.method === "GET") {
    handleListSchedulerTasks(request, response, query as Record<string, unknown>);
    return;
  }

  if (pathname === "/scheduler/run-due" && request.method === "POST") {
    await handleRunDueSchedulerTasks(request, response);
    return;
  }

  const schedulerRunMatch = pathname.match(/^\/scheduler\/tasks\/([^/]+)\/run$/);
  if (schedulerRunMatch && request.method === "POST") {
    handleRunSchedulerTaskRequest(request, response, schedulerRunMatch[1]);
    return;
  }

  if (pathname === "/points/leaderboard" && request.method === "GET") {
    handleGetLeaderboard(request, response, query as Record<string, unknown>);
    return;
  }

  if (pathname === "/points/leaderboard/snapshots" && request.method === "GET") {
    handleGetLeaderboardSnapshots(request, response, query as Record<string, unknown>);
    return;
  }

  if (pathname === "/points/leaderboard/snapshots" && request.method === "POST") {
    await handleCaptureSnapshot(request, response);
    return;
  }

  if (pathname === "/points/award" && request.method === "POST") {
    await handleAwardPoints(request, response);
    return;
  }

  if (pathname === "/points/me" && request.method === "GET") {
    handleGetMyPoints(request, response);
    return;
  }

  if (pathname === "/points/me/ledger" && request.method === "GET") {
    handleGetMyLedger(request, response, query as Record<string, unknown>);
    return;
  }

  const pointsLedgerMatch = pathname.match(/^\/points\/([^/]+)\/ledger$/);
  if (pointsLedgerMatch && request.method === "GET") {
    handleGetPointsLedger(response, pointsLedgerMatch[1], query as Record<string, unknown>);
    return;
  }

  const pointsSummaryMatch = pathname.match(/^\/points\/([^/]+)$/);
  if (pointsSummaryMatch && request.method === "GET") {
    handleGetPointsSummary(request, response, pointsSummaryMatch[1]);
    return;
  }

  if (pathname === "/markets" && request.method === "POST") {
    await handleCreateMarket(request, response);
    return;
  }

  if (pathname === "/markets" && request.method === "GET") {
    handleListMarkets(request, response);
    return;
  }

  const marketDetailMatch = pathname.match(/^\/markets\/(.+)$/);
  if (marketDetailMatch) {
    const slugPath = marketDetailMatch[1];

    if (slugPath.endsWith("/activate") && request.method === "POST") {
      const key = slugPath.replace(/\/activate$/, "");
      await handleActivateMarket(request, response, key);
      return;
    }

    if (slugPath.endsWith("/suspend") && request.method === "POST") {
      const key = slugPath.replace(/\/suspend$/, "");
      await handleSuspendMarket(request, response, key);
      return;
    }

    if (slugPath.endsWith("/close") && request.method === "POST") {
      const key = slugPath.replace(/\/close$/, "");
      await handleCloseMarket(request, response, key);
      return;
    }

    if (slugPath.endsWith("/schedule") && request.method === "POST") {
      const key = slugPath.replace(/\/schedule$/, "");
      await handleUpdateSchedule(request, response, key);
      return;
    }

    if (slugPath.endsWith("/patrol/threshold") && request.method === "POST") {
      const key = slugPath.replace(/\/patrol\/threshold$/, "");
      await handleUpdatePatrolThreshold(request, response, key);
      return;
    }

    if (slugPath.endsWith("/patrol/signals/clear") && request.method === "POST") {
      const key = slugPath.replace(/\/patrol\/signals\/clear$/, "");
      await handleClearPatrolSignal(request, response, key);
      return;
    }

    if (slugPath.endsWith("/patrol/signals") && request.method === "POST") {
      const key = slugPath.replace(/\/patrol\/signals$/, "");
      await handleRecordPatrolSignal(request, response, key);
      return;
    }

    if (slugPath.endsWith("/void") && request.method === "POST") {
      const key = slugPath.replace(/\/void$/, "");
      await handleVoidMarket(request, response, key);
      return;
    }

    if (slugPath.endsWith("/settle") && request.method === "POST") {
      const key = slugPath.replace(/\/settle$/, "");
      await handleSettleMarket(request, response, key);
      return;
    }

    if (slugPath.endsWith("/settlement/override") && request.method === "POST") {
      const key = slugPath.replace(/\/settlement\/override$/, "");
      await handleOverrideSettlement(request, response, key);
      return;
    }

    if (slugPath.endsWith("/claim") && request.method === "POST") {
      const key = slugPath.replace(/\/claim$/, "");
      await handleClaimRewards(request, response, key);
      return;
    }

    if (slugPath.endsWith("/pool") && request.method === "GET") {
      const key = slugPath.replace(/\/pool$/, "");
      handleGetPoolState(request, response, key);
      return;
    }

    if (slugPath.endsWith("/pool") && request.method === "POST") {
      const key = slugPath.replace(/\/pool$/, "");
      await handleCreatePool(request, response, key);
      return;
    }

    if (slugPath.endsWith("/trades") && request.method === "GET") {
      const key = slugPath.replace(/\/trades$/, "");
      handleGetTrades(request, response, key, (query ?? {}) as Record<string, unknown>);
      return;
    }

    if (slugPath.endsWith("/transactions") && request.method === "GET") {
      const key = slugPath.replace(/\/transactions$/, "");
      handleGetTransactions(
        request,
        response,
        key,
        (query ?? {}) as Record<string, unknown>
      );
      return;
    }

    if (slugPath.endsWith("/pool/sync") && request.method === "POST") {
      const key = slugPath.replace(/\/pool\/sync$/, "");
      await handleSyncPoolState(request, response, key);
      return;
    }

    if (slugPath.endsWith("/trade/quote") && request.method === "POST") {
      const key = slugPath.replace(/\/trade\/quote$/, "");
      await handleQuoteTrade(request, response, key);
      return;
    }

    if (slugPath.endsWith("/outcomes/mint") && request.method === "POST") {
      const key = slugPath.replace(/\/outcomes\/mint$/, "");
      await handleMintOutcome(request, response, key);
      return;
    }

    if (slugPath.endsWith("/outcomes/burn") && request.method === "POST") {
      const key = slugPath.replace(/\/outcomes\/burn$/, "");
      await handleBurnOutcome(request, response, key);
      return;
    }

    if (slugPath.endsWith("/storage") && request.method === "GET") {
      const key = slugPath.replace(/\/storage$/, "");
      handleGetMarketStorage(request, response, key);
      return;
    }

    const balancesMatch = slugPath.match(/^(.*)\/balances\//);
    if (balancesMatch && request.method === "GET") {
      handleBalances(request, response);
      return;
    }

    if (request.method === "GET") {
      handleGetMarket(request, response, slugPath);
      return;
    }

    methodNotAllowed(response);
    return;
  }

  notFound(response);
};

export interface MockApiServer {
  url: string;
  close: () => Promise<void>;
}

export const startMockApiServer = async (port = 0): Promise<MockApiServer> => {
  const server = createServer((request, response) => {
    void requestHandler(request, response).catch((error) => {
      console.error("Mock API server error", error);
      sendJson(response, 500, { message: "Internal Server Error" });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  const address = server.address() as AddressInfo;
  const actualPort = address.port;
  console.log(`[mock] server started on port ${actualPort}`);

  return {
    url: `http://127.0.0.1:${actualPort}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
};
