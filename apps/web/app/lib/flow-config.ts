import * as fcl from "@onflow/fcl";

import { resolveFlowConfig } from "./flow-network";

let configured = false;

export const initFlowConfig = (): void => {
  if (configured) {
    return;
  }

  const {
    accessNode,
    discoveryWallet,
    discoveryAuthn,
    walletMethod,
    appTitle,
    appIcon,
    network,
    contracts,
  } = resolveFlowConfig();

  const config = fcl
    .config()
    .put("app.detail.title", appTitle)
    .put("app.detail.icon", appIcon)
    .put("flow.network", network)
    .put("accessNode.api", accessNode)
    .put("discovery.wallet", discoveryWallet)
    .put("discovery.authn.endpoint", discoveryAuthn)
    .put("service.OpenID.scopes", "email profile")
    .put("0xCoreMarketHub", contracts.coreMarketHub)
    .put("0xLMSRAmm", contracts.lmsrAmm)
    .put("0xOutcomeToken", contracts.outcomeToken);

  if (walletMethod) {
    config.put("discovery.wallet.method", walletMethod);
  }
  
  // Add WalletConnect support (optional but recommended)
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (walletConnectProjectId) {
    config.put("walletconnect.projectId", walletConnectProjectId);
  }

  configured = true;
};
