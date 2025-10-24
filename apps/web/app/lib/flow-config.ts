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

  fcl.config({
    "app.detail.title": appTitle,
    "app.detail.icon": appIcon || "https://werpool.mixas.pro/favicon/apple-touch-icon.png",
    "accessNode.api": accessNode,
    "discovery.wallet": discoveryWallet,
    "0xCoreMarketHub": contracts.coreMarketHub,
    "0xLMSRAmm": contracts.lmsrAmm,
    "0xOutcomeToken": contracts.outcomeToken,
    ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && {
      "walletconnect.projectId": process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    }),
  });

  configured = true;
};
