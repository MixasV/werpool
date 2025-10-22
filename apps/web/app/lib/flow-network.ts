type FlowNetworkId = "emulator" | "testnet" | "mainnet";

interface ContractPreset {
  coreMarketHub: string;
  lmsrAmm: string;
  outcomeToken: string;
}

interface FlowNetworkPreset {
  accessNode: string;
  discoveryWallet: string;
  discoveryAuthn?: string;
  walletMethod?: string;
  contracts: ContractPreset;
}

const NETWORK_PRESETS: Record<FlowNetworkId, FlowNetworkPreset> = {
  emulator: {
    accessNode: "http://localhost:8888",
    discoveryWallet: "http://localhost:8701/fcl/authn",
    contracts: {
      coreMarketHub: "0x0000000000000001",
      lmsrAmm: "0x0000000000000001",
      outcomeToken: "0x0000000000000001",
    },
  },
  testnet: {
    accessNode: "https://rest-testnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
    discoveryAuthn: "https://fcl-discovery.onflow.org/testnet/authn",
    walletMethod: "POP/RPC",
    contracts: {
      coreMarketHub: "0x3ea7ac2bcdd8bcef",
      lmsrAmm: "0x3ea7ac2bcdd8bcef",
      outcomeToken: "0x3ea7ac2bcdd8bcef",
    },
  },
  mainnet: {
    accessNode: "https://rest-mainnet.onflow.org",
    discoveryWallet: "https://fcl-discovery.onflow.org/authn",
    discoveryAuthn: "https://fcl-discovery.onflow.org/authn",
    walletMethod: "POP/RPC",
    contracts: {
      coreMarketHub: "0x0000000000000000",
      lmsrAmm: "0x0000000000000000",
      outcomeToken: "0x0000000000000000",
    },
  },
};

const ensureHexAddress = (value: string): string => {
  if (!value) {
    return value;
  }
  return value.startsWith("0x") ? value : `0x${value}`;
};

const resolveNetworkId = (): FlowNetworkId => {
  const fromEnv = process.env.NEXT_PUBLIC_FLOW_NETWORK?.toLowerCase();
  if (fromEnv === "testnet" || fromEnv === "mainnet" || fromEnv === "emulator") {
    return fromEnv;
  }
  return "emulator";
};

export interface ResolvedFlowConfig {
  network: FlowNetworkId;
  accessNode: string;
  discoveryWallet: string;
  discoveryAuthn: string;
  walletMethod?: string;
  appTitle: string;
  appIcon: string;
  contracts: ContractPreset;
}

const resolveContractAddress = (
  fallback: string,
  override: string | undefined
): string => ensureHexAddress((override && override.trim()) || fallback);

export const resolveFlowConfig = (): ResolvedFlowConfig => {
  const network = resolveNetworkId();
  const preset = NETWORK_PRESETS[network];

  const accessNode = process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE?.trim() || preset.accessNode;
  const discoveryWallet =
    process.env.NEXT_PUBLIC_FLOW_WALLET_URL?.trim() || preset.discoveryWallet;
  const discoveryAuthn =
    process.env.NEXT_PUBLIC_FLOW_AUTHN_URL?.trim() || preset.discoveryAuthn || discoveryWallet;

  const contracts: ContractPreset = {
    coreMarketHub: resolveContractAddress(
      preset.contracts.coreMarketHub,
      process.env.NEXT_PUBLIC_FLOW_CORE_MARKET_HUB_ADDRESS
    ),
    lmsrAmm: resolveContractAddress(
      preset.contracts.lmsrAmm,
      process.env.NEXT_PUBLIC_FLOW_LMSR_AMM_ADDRESS
    ),
    outcomeToken: resolveContractAddress(
      preset.contracts.outcomeToken,
      process.env.NEXT_PUBLIC_FLOW_OUTCOME_TOKEN_ADDRESS
    ),
  };

  return {
    network,
    accessNode,
    discoveryWallet,
    discoveryAuthn,
    walletMethod: process.env.NEXT_PUBLIC_FLOW_WALLET_METHOD?.trim() || preset.walletMethod,
    appTitle: process.env.NEXT_PUBLIC_FLOW_APP_TITLE?.trim() || "Forte Prediction Markets",
    appIcon: process.env.NEXT_PUBLIC_FLOW_APP_ICON?.trim() || "",
    contracts,
  };
};
