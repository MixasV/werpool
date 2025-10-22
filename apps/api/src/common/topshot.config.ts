import { normalizeFlowAddress } from "./flow-address.util";

export type TopShotNetwork = "mainnet" | "testnet" | "emulator";

export interface TopShotContractAddresses {
  readonly topShot: string;
  readonly nonFungibleToken: string;
  readonly metadataViews: string;
}

export interface TopShotCachePolicy {
  readonly ownerMomentsTtlMs: number;
  readonly momentDetailsTtlMs: number;
  readonly playerStatsTtlMs: number;
}

export interface TopShotGraphqlConfig {
  readonly endpoint: string;
  readonly userAgent: string;
  readonly timeoutMs: number;
}

export interface TopShotIntegrationConfig {
  readonly enabled: boolean;
  readonly network: TopShotNetwork;
  readonly accessNode: string;
  readonly discoveryWallet: string;
  readonly contracts: TopShotContractAddresses;
  readonly graphql: TopShotGraphqlConfig;
  readonly cache: TopShotCachePolicy;
}

interface TopShotPreset {
  readonly network: TopShotNetwork;
  readonly accessNode: string;
  readonly discoveryWallet: string;
  readonly contracts: TopShotContractAddresses;
  readonly graphqlEndpoint: string;
}

const PRESETS: Record<TopShotNetwork, TopShotPreset> = {
  emulator: {
    network: "emulator",
    accessNode: "http://localhost:8888",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    contracts: {
      topShot: "0xf8d6e0586b0a20c7",
      nonFungibleToken: "0xf8d6e0586b0a20c7",
      metadataViews: "0xf8d6e0586b0a20c7",
    },
    graphqlEndpoint: "https://public-api.nbatopshot.com/graphql",
  },
  testnet: {
    network: "testnet",
    accessNode: "https://rest-testnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    contracts: {
      topShot: "0x0b2a3299cc857e29",
      nonFungibleToken: "0x631e88ae7f1d7c20",
      metadataViews: "0x631e88ae7f1d7c20",
    },
    graphqlEndpoint: "https://public-api.nbatopshot.com/graphql",
  },
  mainnet: {
    network: "mainnet",
    accessNode: "https://rest-mainnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/mainnet/authn",
    contracts: {
      topShot: "0x0b2a3299cc857e29",
      nonFungibleToken: "0x1d7e57aa55817448",
      metadataViews: "0x1d7e57aa55817448",
    },
    graphqlEndpoint: "https://public-api.nbatopshot.com/graphql",
  },
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const resolveNetwork = (): TopShotNetwork => {
  const fromEnv = process.env.TOPSHOT_FLOW_NETWORK?.trim().toLowerCase();
  if (fromEnv === "mainnet" || fromEnv === "testnet" || fromEnv === "emulator") {
    return fromEnv;
  }
  const fallback = process.env.FLOW_NETWORK?.trim().toLowerCase();
  if (fallback === "mainnet" || fallback === "testnet" || fallback === "emulator") {
    return fallback;
  }
  return "mainnet";
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseAddress = (value: string | undefined, fallback: string, field: string): string => {
  if (value && value.trim().length > 0) {
    return normalizeFlowAddress(value.trim(), field);
  }
  return normalizeFlowAddress(fallback, field);
};

const resolveContracts = (preset: TopShotPreset): TopShotContractAddresses => {
  return {
    topShot: parseAddress(process.env.TOPSHOT_CONTRACT_ADDRESS, preset.contracts.topShot, "TopShot contract"),
    nonFungibleToken: parseAddress(
      process.env.TOPSHOT_NFT_ADDRESS,
      preset.contracts.nonFungibleToken,
      "NonFungibleToken contract"
    ),
    metadataViews: parseAddress(
      process.env.TOPSHOT_METADATA_VIEWS_ADDRESS,
      preset.contracts.metadataViews,
      "MetadataViews contract"
    ),
  } satisfies TopShotContractAddresses;
};

const resolveCachePolicy = (): TopShotCachePolicy => {
  return {
    ownerMomentsTtlMs: parsePositiveInt(process.env.TOPSHOT_CACHE_OWNER_MS, 10 * 60 * 1000),
    momentDetailsTtlMs: parsePositiveInt(process.env.TOPSHOT_CACHE_DETAILS_MS, 5 * 60 * 1000),
    playerStatsTtlMs: parsePositiveInt(process.env.TOPSHOT_CACHE_PLAYER_MS, 60 * 60 * 1000),
  } satisfies TopShotCachePolicy;
};

const resolveGraphqlConfig = (preset: TopShotPreset): TopShotGraphqlConfig => {
  const endpoint = process.env.TOPSHOT_GRAPHQL_ENDPOINT?.trim() || preset.graphqlEndpoint;
  const userAgent = process.env.TOPSHOT_GRAPHQL_USER_AGENT?.trim() || "FortePredictionMarkets/1.0";
  const timeoutMs = parsePositiveInt(process.env.TOPSHOT_GRAPHQL_TIMEOUT_MS, 7000);

  return {
    endpoint,
    userAgent,
    timeoutMs,
  } satisfies TopShotGraphqlConfig;
};

export const resolveTopShotIntegrationConfig = (): TopShotIntegrationConfig => {
  const enabled = parseBoolean(process.env.TOPSHOT_INTEGRATION_ENABLED, true);
  const network = resolveNetwork();
  const preset = PRESETS[network];

  const accessNode = process.env.TOPSHOT_FLOW_ACCESS_NODE?.trim() || preset.accessNode;
  const discoveryWallet =
    process.env.TOPSHOT_FLOW_DISCOVERY_WALLET?.trim() || preset.discoveryWallet;

  return {
    enabled,
    network,
    accessNode,
    discoveryWallet,
    contracts: resolveContracts(preset),
    graphql: resolveGraphqlConfig(preset),
    cache: resolveCachePolicy(),
  } satisfies TopShotIntegrationConfig;
};
