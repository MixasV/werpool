import { expect, test, type APIRequestContext } from "@playwright/test";

const ACCESS_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? "forte-dev-token";

const resolveApiBase = () =>
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

const generateSlug = () => `admin-ops-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const toLocalInput = (date: Date): string => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

interface MarketResponse {
  id: string;
  slug: string;
}

interface MarketDetailResponse {
  state: string;
  closeAt: string | null;
  patrolThreshold: number;
  schedule: {
    scheduledStartAt?: string;
    tradingLockAt?: string;
    freezeWindowStartAt?: string;
    freezeWindowEndAt?: string;
  };
  patrolSignals: Array<{
    issuer: string;
    code: string;
    severity: string;
    weight: number;
  }>;
}

const createMarketViaApi = async (request: APIRequestContext, slug: string): Promise<MarketResponse> => {
  const response = await request.post(`${resolveApiBase()}/markets`, {
    headers: {
      "x-api-token": ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    data: {
      slug,
      title: "E2E market management",
      description: "Scenario for schedule and patrol verification",
      state: "live",
      category: "crypto",
      patrolThreshold: 1.5,
      schedule: {
        scheduledStartAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: 900,
        feeBps: 30,
        providerCount: 2,
      },
      outcomes: [
        { label: "Outcome A", impliedProbability: 0.52, liquidity: 460 },
        { label: "Outcome B", impliedProbability: 0.48, liquidity: 440 },
      ],
    },
  });

  expect(response.status()).toBe(201);
  return (await response.json()) as MarketResponse;
};

test.describe("admin market operations", () => {
  test("updates schedule, patrol threshold, signals, and closes market", async ({ page, request }) => {
    const resetResponse = await request.post(`${resolveApiBase()}/admin/reset`);
    expect(resetResponse.status()).toBe(204);

    const slug = generateSlug();
    const createdMarket = await createMarketViaApi(request, slug);

    const fetchMarketDetail = async (): Promise<MarketDetailResponse> => {
      const detailResponse = await request.get(`${resolveApiBase()}/markets/${createdMarket.id}`);
      expect(detailResponse.status()).toBe(200);
      return detailResponse.json() as Promise<MarketDetailResponse>;
    };

    const waitForDetail = async (
      predicate: (detail: MarketDetailResponse) => boolean,
      attempts = 15
    ): Promise<MarketDetailResponse> => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const detail = await fetchMarketDetail();
        if (predicate(detail)) {
          return detail;
        }
        await page.waitForTimeout(200);
      }
      throw new Error("Timed out waiting for market data update");
    };

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const targetCard = page.locator(".admin-market-card").filter({ hasText: slug });
    await expect(targetCard).toHaveCount(1);

    const scheduleDetails = targetCard.locator("details").filter({ hasText: "Update schedule" });
    await scheduleDetails.locator("summary").click();
    const scheduleForm = scheduleDetails.locator("form");

    const scheduleInput = toLocalInput(new Date(Date.now() + 2 * 60 * 60 * 1000));
    const expectedScheduleIso = new Date(scheduleInput).toISOString();

    await scheduleForm.locator('input[name="scheduledStartAt"]').fill(scheduleInput);
    await scheduleForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    await waitForDetail(
      (detail) => detail.schedule.scheduledStartAt === expectedScheduleIso
    );

    const thresholdDetails = targetCard.locator("details").filter({ hasText: "Patrol threshold" });
    await thresholdDetails.locator("summary").click();
    const thresholdForm = thresholdDetails.locator("form");
    const updatedThreshold = 7.75;

    await thresholdForm.locator('input[name="patrolThreshold"]').fill(updatedThreshold.toString());
    await thresholdForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    const detailAfterThreshold = await waitForDetail(
      (detail) => Math.abs(detail.patrolThreshold - updatedThreshold) < 1e-6
    );
    expect(detailAfterThreshold.patrolThreshold).toBeCloseTo(updatedThreshold, 6);

    const signalsDetails = targetCard.locator("details").filter({ hasText: "Patrol signals" });
    await signalsDetails.locator("summary").click();
    const recordForm = signalsDetails.locator("form").first();

    const issuer = "0xpatrol-e2e";
    const expiresInput = toLocalInput(new Date(Date.now() + 4 * 60 * 60 * 1000));

    await recordForm.locator('select[name="severity"]').selectOption("critical");
    await recordForm.locator('input[name="code"]').fill("TEST_SIGNAL");
    await recordForm.locator('input[name="weight"]').fill("2.5");
    await recordForm.locator('input[name="issuer"]').fill(issuer);
    await recordForm.locator('input[name="expiresAt"]').fill(expiresInput);
    await recordForm.locator('textarea[name="notes"]').fill("E2E patrol signal");
    await recordForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    await waitForDetail((detail) => detail.patrolSignals.some((signal) => signal.issuer === issuer));

    const clearForm = signalsDetails.locator("form").nth(1);
    await clearForm.locator('input[name="patrolAddress"]').fill(issuer);
    await clearForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    await waitForDetail((detail) => detail.patrolSignals.every((signal) => signal.issuer !== issuer));

    const closeDetails = targetCard.locator("details").filter({ hasText: "Close" });
    await closeDetails.locator("summary").click();
    const closeForm = closeDetails.locator("form");
    const closeReason = `E2E close ${Date.now()}`;
    const closeInput = toLocalInput(new Date(Date.now() + 6 * 60 * 60 * 1000));
    const expectedCloseIso = new Date(closeInput).toISOString();

    await closeForm.locator('input[name="reason"]').fill(closeReason);
    await closeForm.locator('input[name="closedAt"]').fill(closeInput);
    await closeForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    const closedDetail = await waitForDetail(
      (detail) => detail.state === "closed" && detail.closeAt === expectedCloseIso
    );
    expect(closedDetail.state).toBe("closed");
    expect(closedDetail.closeAt).toBe(expectedCloseIso);
  });
});
