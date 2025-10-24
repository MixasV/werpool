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

  // CRITICAL: Only set valid string values - FCL may be reading icon file as binary
  const config: Record<string, string> = {
    "app.detail.title": appTitle || "Werpool - Flow Prediction Markets",
    "app.detail.description": "Prediction markets on Flow blockchain where your forecast becomes an on-chain asset",
    "app.detail.url": "https://werpool.mixas.pro",
    "accessNode.api": accessNode,
    "discovery.wallet": discoveryWallet,
    "0xCoreMarketHub": contracts.coreMarketHub,
    "0xLMSRAmm": contracts.lmsrAmm,
    "0xOutcomeToken": contracts.outcomeToken,
  };

  // Only add icon if it's a valid URL string (not binary data)
  const iconUrl = appIcon || "https://werpool.mixas.pro/favicon/apple-touch-icon.png";
  if (iconUrl && typeof iconUrl === "string" && iconUrl.startsWith("http")) {
    config["app.detail.icon"] = iconUrl;
  }

  if (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
    config["walletconnect.projectId"] = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  }

  fcl.config(config);

  configured = true;
};
