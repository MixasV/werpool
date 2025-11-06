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
    appTitle,
    appIcon,
    contracts,
  } = resolveFlowConfig();

  // CRITICAL: FCL wallet metadata configuration
  // app.detail.icon must be publicly accessible URL
  // Recommended: 192x192px PNG for best wallet UI display
  const config: Record<string, string> = {
    "app.detail.title": appTitle || "Werpool - Flow Prediction Markets",
    "app.detail.icon": appIcon || "https://werpool.mixas.pro/favicon/web-app-manifest-192x192.png",
    "app.detail.description": "Prediction markets on Flow blockchain where your forecast becomes an on-chain asset",
    "app.detail.url": "https://werpool.mixas.pro",
    "accessNode.api": accessNode,
    "discovery.wallet": discoveryWallet,
    "0xCoreMarketHub": contracts.coreMarketHub,
    "0xLMSRAmm": contracts.lmsrAmm,
    "0xOutcomeToken": contracts.outcomeToken,
  };

  if (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
    config["walletconnect.projectId"] = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  }

  fcl.config(config);

  configured = true;
};
