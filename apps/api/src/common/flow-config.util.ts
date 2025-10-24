type FlowNetworkId = "emulator" | "testnet" | "mainnet";

interface ContractPreset {
  coreMarketHub: string;
  lmsrAmm: string;
  outcomeToken: string;
}

interface FlowNetworkPreset {
  accessNode: string;
  contracts: ContractPreset;
}

const NETWORK_PRESETS: Record<FlowNetworkId, FlowNetworkPreset> = {
  emulator: {
    accessNode: "http://localhost:8888",
    contracts: {
      coreMarketHub: "0x0000000000000001",
      lmsrAmm: "0x0000000000000001",
      outcomeToken: "0x0000000000000001",
    },
  },
  testnet: {
    accessNode: "https://rest-testnet.onflow.org",
    contracts: {
      coreMarketHub: "0x3ea7ac2bcdd8bcef",
      lmsrAmm: "0x3ea7ac2bcdd8bcef",
      outcomeToken: "0x3ea7ac2bcdd8bcef",
    },
  },
  mainnet: {
    accessNode: "https://rest-mainnet.onflow.org",
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
  const fromEnv = process.env.FLOW_NETWORK?.toLowerCase();
  if (fromEnv === "testnet" || fromEnv === "mainnet" || fromEnv === "emulator") {
    return fromEnv;
  }
  return "emulator";
};

const resolveContractAddress = (fallback: string, override?: string | null): string =>
  ensureHexAddress((override && override.trim()) || fallback);

export interface BackendFlowConfig {
  network: FlowNetworkId;
  accessNode: string;
  contracts: ContractPreset;
}

export const resolveBackendFlowConfig = (): BackendFlowConfig => {
  const network = resolveNetworkId();
  const preset = NETWORK_PRESETS[network];

  console.log('[Flow Config] process.env.FLOW_ACCESS_NODE:', process.env.FLOW_ACCESS_NODE);
  console.log('[Flow Config] preset.accessNode:', preset.accessNode);
  
  const accessNode = process.env.FLOW_ACCESS_NODE?.trim() || preset.accessNode;
  
  console.log('[Flow Config] Final accessNode:', accessNode);

  return {
    network,
    accessNode,
    contracts: {
      coreMarketHub: resolveContractAddress(
        preset.contracts.coreMarketHub,
        process.env.FLOW_CORE_MARKET_HUB_ADDRESS
      ),
      lmsrAmm: resolveContractAddress(
        preset.contracts.lmsrAmm,
        process.env.FLOW_LMSR_AMM_ADDRESS
      ),
      outcomeToken: resolveContractAddress(
        preset.contracts.outcomeToken,
        process.env.FLOW_OUTCOME_TOKEN_ADDRESS
      ),
    },
  };
};
