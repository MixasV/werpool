import { normalizeFlowAddress } from "./flow-address.util";

export type AiSportsNetwork = "testnet" | "mainnet" | "emulator";

export interface AiSportsContractAddresses {
  readonly minter: string;
  readonly juice: string;
  readonly escrow: string;
}

export interface AiSportsCachePolicy {
  readonly userDataTtlMs: number;
  readonly tournamentStatsTtlMs: number;
  readonly nftTtlMs: number;
}

export interface AiSportsIntegrationConfig {
  readonly enabled: boolean;
  readonly network: AiSportsNetwork;
  readonly accessNode: string;
  readonly discoveryWallet: string;
  readonly contracts: AiSportsContractAddresses;
  readonly cache: AiSportsCachePolicy;
}

interface AiSportsPreset {
  readonly network: AiSportsNetwork;
  readonly accessNode: string;
  readonly discoveryWallet: string;
  readonly contracts: AiSportsContractAddresses;
}

const PRESETS: Record<AiSportsNetwork, AiSportsPreset> = {
  emulator: {
    network: "emulator",
    accessNode: "http://localhost:8888",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    contracts: {
      minter: "0xf8d6e0586b0a20c7",
      juice: "0xf8d6e0586b0a20c7",
      escrow: "0xf8d6e0586b0a20c7",
    },
  },
  testnet: {
    network: "testnet",
    accessNode: "https://rest-testnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    contracts: {
      minter: "0xf8ba321af4bd37ba",   // All aiSports contracts on testnet
      juice: "0xf8ba321af4bd37ba",    // Same address for all testnet contracts
      escrow: "0xf8ba321af4bd37ba",   // Same address for all testnet contracts
    },
  },
  mainnet: {
    network: "mainnet",
    accessNode: "https://rest-mainnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/mainnet/authn",
    contracts: {
      minter: "0xabe5a2bf47ce5bf3",  // aiSportsMinter mainnet
      juice: "0x9db94c9564243ba7",    // aiSportsJuice mainnet
      escrow: "0x4fdb077419808080",   // aiSportsEscrow mainnet
    },
  },
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const resolveNetwork = (): AiSportsNetwork => {
  const fromEnv = process.env.AISPORTS_FLOW_NETWORK?.trim().toLowerCase();
  if (fromEnv === "mainnet" || fromEnv === "testnet" || fromEnv === "emulator") {
    return fromEnv;
  }
  const fallback = process.env.FLOW_NETWORK?.trim().toLowerCase();
  if (fallback === "mainnet" || fallback === "testnet" || fallback === "emulator") {
    return fallback;
  }
  return "testnet";
};

const resolveAddress = (value: string | undefined, fallback: string): string =>
  normalizeFlowAddress(value?.trim().length ? value.trim() : fallback, "aiSportsAddress");

const resolveCachePolicy = (): AiSportsCachePolicy => {
  const parseIntEnv = (key: string, defaultValue: number): number => {
    const raw = process.env[key];
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  };

  return {
    userDataTtlMs: parseIntEnv("AISPORTS_CACHE_USER_MS", 2 * 60 * 1000),
    tournamentStatsTtlMs: parseIntEnv("AISPORTS_CACHE_TOURNAMENT_MS", 5 * 60 * 1000),
    nftTtlMs: parseIntEnv("AISPORTS_CACHE_NFT_MS", 15 * 60 * 1000),
  };
};

export const resolveAiSportsIntegrationConfig = (): AiSportsIntegrationConfig => {
  const enabled = parseBoolean(process.env.AISPORTS_INTEGRATION_ENABLED, true);
  const network = resolveNetwork();
  const preset = PRESETS[network];

  const accessNode = process.env.AISPORTS_FLOW_ACCESS_NODE?.trim() || preset.accessNode;
  const discoveryWallet =
    process.env.AISPORTS_FLOW_DISCOVERY_WALLET?.trim() || preset.discoveryWallet;

  const contracts: AiSportsContractAddresses = {
    minter: resolveAddress(process.env.AISPORTS_MINTER_ADDRESS, preset.contracts.minter),
    juice: resolveAddress(process.env.AISPORTS_JUICE_ADDRESS, preset.contracts.juice),
    escrow: resolveAddress(process.env.AISPORTS_ESCROW_ADDRESS, preset.contracts.escrow),
  };

  return {
    enabled,
    network,
    accessNode,
    discoveryWallet,
    contracts,
    cache: resolveCachePolicy(),
  };
};
