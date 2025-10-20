import { API_BASE_URL, parseJson, withAuthHeaders, type AuthOptions } from "./api-client";

export type MarketState = "draft" | "live" | "suspended" | "closed" | "settled" | "voided";
export type MarketCategory = "crypto" | "sports" | "esports" | "custom";
export type PatrolSignalSeverity = "info" | "warning" | "critical";

export interface MarketSchedule {
  scheduledStartAt?: string;
  tradingLockAt?: string;
  freezeWindowStartAt?: string;
  freezeWindowEndAt?: string;
}

export interface MarketSummary {
  id: string;
  slug: string;
  title: string;
  state: MarketState;
  category: MarketCategory;
  tags: string[];
  createdAt: string;
  closeAt?: string;
  primaryOutcomeId: string;
  totalLiquidity: number;
}

export interface Outcome {
  id: string;
  index?: number;
  label: string;
  status: "active" | "suspended" | "settled";
  impliedProbability: number;
  liquidity: number;
  metadata?: Record<string, unknown>;
}

export interface LiquidityPool {
  id: string;
  tokenSymbol: string;
  totalLiquidity: number;
  feeBps: number;
  providerCount: number;
}

export interface WorkflowAction {
  id: string;
  type: "open" | "suspend" | "settle" | "void" | "distribute" | "custom";
  status: "pending" | "scheduled" | "executed" | "failed";
  description: string;
  scheduledAt?: string;
  executedAt?: string;
  triggersAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Settlement {
  id: string;
  resolvedOutcomeId: string;
  txId: string;
  settledAt: string;
  notes?: string;
  overrideReason?: string;
}

export interface PatrolSignal {
  id: string;
  issuer: string;
  severity: PatrolSignalSeverity;
  code: string;
  weight: number;
  createdAt: string;
  expiresAt?: string;
  notes?: string;
}

export interface MarketDetail extends MarketSummary {
  description: string;
  oracleId?: string;
  patrolThreshold: number;
  schedule: MarketSchedule;
  liquidityPool: LiquidityPool;
  outcomes: Outcome[];
  workflow: WorkflowAction[];
  settlement?: Settlement;
  patrolSignals: PatrolSignal[];
}

export interface MarketPoolState {
  liquidityParameter: number;
  totalLiquidity: number;
  bVector: number[];
  outcomeSupply: number[];
}

export interface MarketAccountBalances {
  flowBalance: string;
  outcomeBalance: string;
}

export interface MarketTrade {
  id: string;
  marketId: string;
  outcomeId: string | null;
  outcomeLabel: string;
  outcomeIndex: number;
  shares: string;
  flowAmount: string;
  isBuy: boolean;
  probabilities: number[];
  maxFlowAmount?: string;
  transactionId: string;
  signer: string;
  network: string;
  createdAt: string;
}

export type FlowTransactionType =
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
  | "CLEAR_PATROL_SIGNAL";

export type FlowTransactionStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface MarketTransactionLog {
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

export type MarketAnalyticsInterval = "hour" | "day";

export interface MarketAnalyticsPoint {
  id: string;
  marketId: string;
  outcomeId: string | null;
  outcomeIndex: number;
  outcomeLabel: string;
  interval: MarketAnalyticsInterval;
  bucketStart: string;
  bucketEnd: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  averagePrice: number;
  volumeShares: number;
  volumeFlow: number;
  netFlow: number;
  tradeCount: number;
  updatedAt: string;
}

export interface QuoteTradePayload {
  outcomeIndex: number;
  shares: number;
  isBuy: boolean;
}

export interface QuoteTradeResult {
  flowAmount: string;
  outcomeAmount: string;
  newBVector: string[];
  newTotalLiquidity: string;
  newOutcomeSupply: string[];
  probabilities: number[];
  cadenceArguments: Array<{ type: string; value: unknown }>;
  transactionPath: string;
}

export interface ExecuteTradePayload extends QuoteTradePayload {
  signer?: string;
  network?: string;
  maxFlowAmount?: number;
}

export interface ExecuteTradeResult extends QuoteTradeResult {
  transactionId: string;
  signer: string;
  network: string;
}

export interface ClaimRewardsPayload {
  outcomeIndex: number;
  shares: number;
  signer?: string;
  network?: string;
  maxFlowAmount?: number;
}

export interface ClaimRewardsResult extends ExecuteTradeResult {
  claimAmount: string;
  claimedShares: string;
}

export interface CreateMarketPayload {
  slug: string;
  title: string;
  description: string;
  state?: MarketState;
  category?: MarketCategory;
  tags?: string[];
  oracleId?: string;
  patrolThreshold?: number;
  closeAt?: string;
  schedule?: MarketSchedule;
  liquidityPool: {
    tokenSymbol: string;
    totalLiquidity: number;
    feeBps: number;
    providerCount: number;
  };
  outcomes: Array<{
    label: string;
    status?: Outcome["status"];
    impliedProbability: number;
    liquidity: number;
  }>;
  workflow?: Array<{
    type: WorkflowAction["type"];
    status?: WorkflowAction["status"];
    description: string;
    triggersAt?: string;
    scheduledAt?: string;
  }>;
  settlement?: {
    resolvedOutcomeId: string;
    txId: string;
    settledAt: string;
    notes?: string;
  };
  patrolSignals?: Array<{
    issuer: string;
    severity: PatrolSignalSeverity;
    code: string;
    weight: number;
    notes?: string;
    expiresAt?: string;
  }>;
}

export interface UpdateMarketPayload extends CreateMarketPayload {
  id?: string;
}

export interface CreatePoolPayload {
  outcomeCount: number;
  liquidityParameter: number;
  seedAmount: number;
  signer?: string;
  network?: string;
}

export interface CreatePoolResult {
  outcomeCount: number;
  liquidityParameter: string;
  seedAmount: string;
  transactionPath: string;
  cadenceArguments: Array<{ type: string; value: unknown }>;
  transactionId: string;
  signer: string;
  network: string;
}

export interface MintOutcomePayload {
  amount: number;
  signer?: string;
  network?: string;
}

export interface MintOutcomeResult {
  amount: string;
  transactionPath: string;
  cadenceArguments: Array<{ type: string; value: unknown }>;
  transactionId: string;
  signer: string;
  network: string;
}

export interface SyncPoolStatePayload {
  bVector: number[];
  totalLiquidity: number;
  outcomeSupply: number[];
  signer?: string;
  network?: string;
}

export interface SyncPoolStateResult {
  bVector: string[];
  totalLiquidity: string;
  outcomeSupply: string[];
  transactionPath: string;
  cadenceArguments: Array<{ type: string; value: unknown }>;
  transactionId: string;
  signer: string;
  network: string;
}

export interface MarketStorageMetadata {
  liquidityPoolPath: string;
  outcomeVaultPath: string;
  liquidityReceiverPath: string;
  liquidityProviderPath: string;
  outcomeReceiverPath: string;
  outcomeBalancePath: string;
  outcomeProviderPath: string;
  owner: string;
}

const disableCacheForE2E = process.env.NEXT_E2E_DISABLE_CACHE === "true";

const listFetchConfig = disableCacheForE2E
  ? { cache: "no-store" as const }
  : { next: { revalidate: 15 } };

export const fetchMarkets = async (): Promise<MarketSummary[]> => {
  const response = await fetch(`${API_BASE_URL}/markets`, listFetchConfig);

  return parseJson<MarketSummary[]>(response);
};

export const fetchMarket = async (idOrSlug: string): Promise<MarketDetail> => {
  const response = await fetch(`${API_BASE_URL}/markets/${idOrSlug}`, listFetchConfig);

  return parseJson<MarketDetail>(response);
};

export const createMarket = async (
  payload: CreateMarketPayload,
  auth?: AuthOptions
): Promise<MarketDetail> =>
  authorizedJsonRequest<MarketDetail>(
    `${API_BASE_URL}/markets`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const updateMarket = async (
  idOrSlug: string,
  payload: UpdateMarketPayload,
  auth?: AuthOptions
): Promise<MarketDetail> =>
  authorizedJsonRequest<MarketDetail>(
    `${API_BASE_URL}/markets/${idOrSlug}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const fetchMarketPoolState = async (
  idOrSlug: string
): Promise<MarketPoolState> => {
  const response = await fetch(`${API_BASE_URL}/markets/${idOrSlug}/pool`, {
    cache: "no-store",
  });

  return parseJson<MarketPoolState>(response);
};

export const quoteTrade = async (
  idOrSlug: string,
  payload: QuoteTradePayload,
  auth?: AuthOptions
): Promise<QuoteTradeResult> =>
  authorizedJsonRequest<QuoteTradeResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/trade/quote`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const executeTrade = async (
  idOrSlug: string,
  payload: ExecuteTradePayload,
  auth?: AuthOptions
): Promise<ExecuteTradeResult> =>
  authorizedJsonRequest<ExecuteTradeResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/trade/execute`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const claimRewards = async (
  idOrSlug: string,
  payload: ClaimRewardsPayload,
  auth?: AuthOptions
): Promise<ClaimRewardsResult> =>
  authorizedJsonRequest<ClaimRewardsResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/claim`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const fetchMarketBalances = async (
  idOrSlug: string,
  address: string
): Promise<MarketAccountBalances> => {
  const response = await fetch(
    `${API_BASE_URL}/markets/${idOrSlug}/balances/${encodeURIComponent(address)}`,
    {
      cache: "no-store",
    }
  );

  return parseJson<MarketAccountBalances>(response);
};

export const fetchMarketTrades = async (
  idOrSlug: string,
  limit = 50
): Promise<MarketTrade[]> => {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const encodedId = encodeURIComponent(idOrSlug);
  const response = await fetch(
    `${API_BASE_URL}/markets/${encodedId}/trades?limit=${normalizedLimit}`,
    {
      cache: "no-store",
    }
  );

  return parseJson<MarketTrade[]>(response);
};

export const fetchMarketTransactions = async (
  idOrSlug: string,
  limit = 50
): Promise<MarketTransactionLog[]> => {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const encodedId = encodeURIComponent(idOrSlug);
  const response = await fetch(
    `${API_BASE_URL}/markets/${encodedId}/transactions?limit=${normalizedLimit}`,
    {
      cache: "no-store",
    }
  );

  return parseJson<MarketTransactionLog[]>(response);
};

export const fetchMarketAnalytics = async (
  idOrSlug: string,
  params: {
    interval?: MarketAnalyticsInterval;
    outcomeIndex?: number;
    from?: string;
    to?: string;
    limit?: number;
  } = {}
): Promise<MarketAnalyticsPoint[]> => {
  const query = new URLSearchParams();
  if (params.interval) {
    query.set("interval", params.interval);
  }
  if (
    typeof params.outcomeIndex === "number" &&
    Number.isInteger(params.outcomeIndex) &&
    params.outcomeIndex >= 0
  ) {
    query.set("outcomeIndex", params.outcomeIndex.toString());
  }
  if (params.from) {
    query.set("from", params.from);
  }
  if (params.to) {
    query.set("to", params.to);
  }
  const limitValue =
    typeof params.limit === "number" && Number.isFinite(params.limit) && params.limit > 0
      ? Math.floor(params.limit)
      : 200;
  query.set("limit", limitValue.toString());

  const encodedId = encodeURIComponent(idOrSlug);
  const queryString = query.toString();
  const url = `${API_BASE_URL}/markets/${encodedId}/analytics${
    queryString ? `?${queryString}` : ""
  }`;
  const response = await fetch(url, {
    cache: "no-store",
  });

  return parseJson<MarketAnalyticsPoint[]>(response);
};

export interface MarketActionPayload {
  signer?: string;
  network?: string;
}

export interface SuspendMarketPayload extends MarketActionPayload {
  reason?: string;
}

export interface SettleMarketPayload extends MarketActionPayload {
  outcomeId: number;
  resolvedOutcomeId: string;
  txHash: string;
  notes?: string;
}

export interface OverrideSettlementPayload extends SettleMarketPayload {
  reason: string;
}

export interface CloseMarketPayload extends MarketActionPayload {
  reason?: string;
  closedAt?: string;
}

export interface UpdateMarketSchedulePayload extends MarketActionPayload {
  scheduledStartAt?: string;
  tradingLockAt?: string;
  freezeWindowStartAt?: string;
  freezeWindowEndAt?: string;
}

export interface UpdatePatrolThresholdPayload extends MarketActionPayload {
  patrolThreshold: number;
}

export interface RecordPatrolSignalPayload extends MarketActionPayload {
  issuer?: string;
  severity: PatrolSignalSeverity;
  code: string;
  weight: number;
  notes?: string;
  expiresAt?: string;
}

export interface ClearPatrolSignalPayload extends MarketActionPayload {
  patrolAddress: string;
}

export interface MarketActionResult {
  market: MarketDetail;
  transactionPath: string;
  cadenceArguments: Array<{ type: string; value: unknown }>;
  transactionId: string;
  signer: string;
  network: string;
}

const authorizedJsonRequest = async <T>(
  url: string,
  init: RequestInit,
  auth?: AuthOptions
): Promise<T> => {
  const { headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders ?? undefined);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    url,
    withAuthHeaders(
      {
        ...rest,
        headers,
      },
      {
        token: auth?.token ?? null,
        allowApiTokenFallback: auth?.allowApiTokenFallback ?? false,
      }
    )
  );

  return parseJson<T>(response);
};

export const activateMarket = async (
  idOrSlug: string,
  payload: MarketActionPayload = {},
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/activate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const suspendMarket = async (
  idOrSlug: string,
  payload: SuspendMarketPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/suspend`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const closeMarket = async (
  idOrSlug: string,
  payload: CloseMarketPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/close`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const voidMarket = async (
  idOrSlug: string,
  payload: MarketActionPayload = {},
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/void`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const settleMarket = async (
  idOrSlug: string,
  payload: SettleMarketPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/settle`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const overrideSettlement = async (
  idOrSlug: string,
  payload: OverrideSettlementPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/settlement/override`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const updateMarketSchedule = async (
  idOrSlug: string,
  payload: UpdateMarketSchedulePayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/schedule`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const updatePatrolThreshold = async (
  idOrSlug: string,
  payload: UpdatePatrolThresholdPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/patrol/threshold`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const recordPatrolSignal = async (
  idOrSlug: string,
  payload: RecordPatrolSignalPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/patrol/signals`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const clearPatrolSignal = async (
  idOrSlug: string,
  payload: ClearPatrolSignalPayload,
  auth?: AuthOptions
): Promise<MarketActionResult> =>
  authorizedJsonRequest<MarketActionResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/patrol/signals/clear`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const createMarketPool = async (
  idOrSlug: string,
  payload: CreatePoolPayload,
  auth?: AuthOptions
): Promise<CreatePoolResult> =>
  authorizedJsonRequest<CreatePoolResult>(`${API_BASE_URL}/markets/${idOrSlug}/pool`, {
    method: "POST",
    body: JSON.stringify(payload),
    cache: "no-store",
  }, auth);

export const mintOutcomeTokens = async (
  idOrSlug: string,
  payload: MintOutcomePayload,
  auth?: AuthOptions
): Promise<MintOutcomeResult> =>
  authorizedJsonRequest<MintOutcomeResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/outcomes/mint`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const burnOutcomeTokens = async (
  idOrSlug: string,
  payload: MintOutcomePayload,
  auth?: AuthOptions
): Promise<MintOutcomeResult> =>
  authorizedJsonRequest<MintOutcomeResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/outcomes/burn`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const syncMarketPoolState = async (
  idOrSlug: string,
  payload: SyncPoolStatePayload,
  auth?: AuthOptions
): Promise<SyncPoolStateResult> =>
  authorizedJsonRequest<SyncPoolStateResult>(
    `${API_BASE_URL}/markets/${idOrSlug}/pool/sync`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    auth
  );

export const fetchMarketStorage = async (
  idOrSlug: string
): Promise<MarketStorageMetadata> => {
  const response = await fetch(`${API_BASE_URL}/markets/${idOrSlug}/storage`, {
    cache: "no-store",
  });

  return parseJson<MarketStorageMetadata>(response);
};
