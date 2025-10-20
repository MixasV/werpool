import { defineConfig } from "@playwright/test";

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3200);
const MOCK_API_PORT = Number(process.env.MOCK_API_PORT ?? 4100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;
const apiUrl = `http://127.0.0.1:${MOCK_API_PORT}`;
const accessToken = process.env.NEXT_PUBLIC_API_TOKEN ?? "forte-dev-token";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60 * 1000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
  },
  globalSetup: "./tests/e2e/global-setup",
  webServer: {
    command: `pnpm dev`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      API_BASE_URL: apiUrl,
      NEXT_PUBLIC_API_BASE_URL: apiUrl,
      NEXT_PUBLIC_WS_BASE_URL: apiUrl,
      NEXT_PUBLIC_API_TOKEN: accessToken,
      NEXT_DEV_ALLOWED_ORIGINS: `http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}`,
      NEXT_E2E_DISABLE_CACHE: "true",
      NEXT_PUBLIC_FLOW_ROLES_STRATEGY: process.env.NEXT_PUBLIC_FLOW_ROLES_STRATEGY ?? "legacy",
      FLOW_ROLES_STRATEGY: process.env.FLOW_ROLES_STRATEGY ?? "legacy",
      PORT: String(WEB_PORT),
      HOSTNAME: "127.0.0.1",
    },
  },
});
