import type { FullConfig } from "@playwright/test";

import { startMockApiServer } from "./mock-api-server";

const MOCK_API_PORT = Number(process.env.MOCK_API_PORT ?? 4100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3200);
const ACCESS_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? "forte-dev-token";

export default async function globalSetup(_config: FullConfig) {
  const server = await startMockApiServer(MOCK_API_PORT);
  const apiUrl = server.url;

  process.env.API_BASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_API_BASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_WS_BASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_API_TOKEN = ACCESS_TOKEN;
  process.env.E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;
  process.env.NEXT_PUBLIC_FLOW_ROLES_STRATEGY = process.env.NEXT_PUBLIC_FLOW_ROLES_STRATEGY ?? "legacy";
  process.env.FLOW_ROLES_STRATEGY = process.env.FLOW_ROLES_STRATEGY ?? "legacy";

  return async () => {
    await server.close();
  };
}
