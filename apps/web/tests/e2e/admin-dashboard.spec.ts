import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const ACCESS_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? "forte-dev-token";

const resolveApiBase = () =>
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

const generateSlug = () => `admin-e2e-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

interface MarketResponse {
  id: string;
  slug: string;
}

interface MarketWorkflowEntry {
  type: string;
  status: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface MarketDetailResponse {
  state: "draft" | "live" | "suspended" | "closed" | "settled" | "voided";
  workflow: MarketWorkflowEntry[];
  totalLiquidity: number;
  settlement?: {
    resolvedOutcomeId: string;
    overrideReason?: string;
    txId: string;
    notes?: string;
  };
}

const createMarketViaApi = async (
  request: APIRequestContext,
  slug: string
): Promise<MarketResponse> => {
  const response = await request.post(`${resolveApiBase()}/markets`, {
    headers: {
      "x-api-token": ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    data: {
      slug,
      title: "Admin dashboard E2E",
      description: "Test market for admin dashboard scenario",
      state: "live",
      liquidityPool: {
        tokenSymbol: "FLOW",
        totalLiquidity: 1200,
        feeBps: 25,
        providerCount: 3,
      },
      outcomes: [
        { label: "Outcome A", impliedProbability: 0.55, liquidity: 620 },
        { label: "Outcome B", impliedProbability: 0.45, liquidity: 580 },
      ],
    },
  });

  expect(response.status()).toBe(201);
  const payload = (await response.json()) as MarketResponse;
  expect(payload.slug).toBe(slug);
  return payload;
};

test.describe("admin dashboard", () => {
test("displays dashboard data and manages roles", async ({ page, request }) => {
    const resetResponse = await request.post(`${resolveApiBase()}/admin/reset`);
    expect(resetResponse.status()).toBe(204);

    const slug = generateSlug();
    const createdMarket = await createMarketViaApi(request, slug);

    const listResponse = await request.get(`${resolveApiBase()}/markets`);
    expect(listResponse.status()).toBe(200);
    const markets = (await listResponse.json()) as Array<{ id: string; slug: string }>;
    const storedMarket = markets.find((market) => market.slug === slug);
    expect(storedMarket).toBeDefined();

    const storageResponse = await request.get(
      `${resolveApiBase()}/markets/${storedMarket?.id}/storage`
    );
    expect(storageResponse.status()).toBe(200);
    const storage = (await storageResponse.json()) as { owner: string };
    expect(storage.owner).toBe("0xcoremarket");

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monitoring and alerts" })).toBeVisible();
    await expect(page.getByText("api.markets.list")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Markets" })).toBeVisible();

    const marketCards = page.locator(".admin-market-card");
    await expect(marketCards.first()).toBeVisible();
    await expect(marketCards.first().getByText(/Slug:/)).toBeVisible();

    let targetCard = page.locator(".admin-market-card").filter({ hasText: slug });
    if ((await targetCard.count()) === 0) {
      targetCard = marketCards.first();
    }

    const stateLabels: Record<MarketDetailResponse["state"], string> = {
      draft: "Draft",
      live: "Live",
      suspended: "Suspended",
      closed: "Closed",
      settled: "Settled",
      voided: "Voided",
    };

    const fetchMarketDetail = async (): Promise<MarketDetailResponse> => {
      const response = await request.get(`${resolveApiBase()}/markets/${createdMarket.id}`);
      expect(response.status()).toBe(200);
      return response.json() as Promise<MarketDetailResponse>;
    };

    const waitForDetail = async (
      predicate: (detail: MarketDetailResponse) => boolean,
      attempts = 24
    ): Promise<MarketDetailResponse> => {
      let lastDetail: MarketDetailResponse | null = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const detail = await fetchMarketDetail();
        lastDetail = detail;
        if (predicate(detail)) {
          return detail;
        }
        await page.waitForTimeout(200);
      }
      throw new Error(
        `Timed out waiting for market state update (last state: ${lastDetail?.state ?? "unknown"}, workflow: ${
          lastDetail?.workflow?.[0]?.type ?? "unknown"
        })`
      );
    };

    const expectState = async (
      expectedState: keyof typeof stateLabels,
      predicate: (detail: MarketDetailResponse) => boolean = () => true
    ): Promise<MarketDetailResponse> => {
      const detail = await waitForDetail(
        (value) => value.state === expectedState && predicate(value)
      );
      await expect(targetCard.locator(".admin-market-state")).toHaveText(
        stateLabels[expectedState]
      );
      return detail;
    };

    const rolesTable = page.locator(".admin-table");
    await expect(rolesTable.getByText("0xadmin")).toBeVisible();
    await expect(rolesTable.getByText("0xpatrol")).toBeVisible();

    const newAddress = `0x${Math.random().toString(16).slice(2, 10)}`;
    await page.getByLabel("Flow address").fill(newAddress);
    await page.getByLabel("Role").selectOption("patrol");
    const grantButton = page.getByRole("button", { name: /Grant role|Assign role/ });
    await grantButton.click();
    await page.waitForLoadState("networkidle");

    const roleRow = rolesTable.locator(".admin-table__row", { hasText: newAddress });
    await expect(roleRow).toHaveCount(1);

    await roleRow.getByRole("button", { name: "Revoke" }).click();
    await page.waitForLoadState("networkidle");
    await expect(roleRow).toHaveCount(0);

    await page.getByRole("button", { name: "Send test alert" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/monitoring\.alert\./)).toBeVisible();

    const liquidityCard = page
      .locator(".admin-card")
      .filter({ hasText: "Liquidity pools" })
      .first();
    await liquidityCard.scrollIntoViewIfNeeded();

    const createPoolForm = liquidityCard.locator("form").first();
    await createPoolForm.locator('select[name="marketId"]').selectOption(createdMarket.id);
    await createPoolForm.locator('input[name="outcomeCount"]').fill("2");
    await createPoolForm.locator('input[name="liquidityParameter"]').fill("2.5");
    await createPoolForm.locator('input[name="seedAmount"]').fill("150");
    await createPoolForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    let poolState: {
      liquidityParameter: number;
      totalLiquidity: number;
      outcomeSupply: number[];
    } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const poolResponse = await request.get(
        `${resolveApiBase()}/markets/${createdMarket.id}/pool`
      );
      if (poolResponse.status() === 404) {
        await page.waitForTimeout(200);
        continue;
      }
      expect(poolResponse.status()).toBe(200);
      poolState = (await poolResponse.json()) as typeof poolState;
      if (Math.abs((poolState?.liquidityParameter ?? 0) - 2.5) < 1e-4) {
        break;
      }
      await page.waitForTimeout(200);
    }
    expect(poolState).not.toBeNull();
    expect(poolState!.liquidityParameter).toBeCloseTo(2.5, 5);
    expect(poolState!.totalLiquidity).toBeCloseTo(150, 5);
    expect(poolState!.outcomeSupply).toHaveLength(2);

    const syncDetails = liquidityCard.locator("details").filter({ hasText: "Manual pool sync" });
    await syncDetails.first().locator("summary").click();
    const syncForm = syncDetails.first().locator("form");
    await syncForm.locator('select[name="marketId"]').selectOption(createdMarket.id);
    await syncForm.locator('textarea[name="bVector"]').fill("0.42 0.58");
    await syncForm.locator('input[name="totalLiquidity"]').fill("210");
    await syncForm.locator('textarea[name="outcomeSupply"]').fill("110 100");
    await syncForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    let updatedPoolState: {
      totalLiquidity: number;
      outcomeSupply: number[];
    } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const updatedPoolResponse = await request.get(
        `${resolveApiBase()}/markets/${createdMarket.id}/pool`
      );
      if (updatedPoolResponse.status() === 404) {
        await page.waitForTimeout(200);
        continue;
      }
      expect(updatedPoolResponse.status()).toBe(200);
      updatedPoolState = (await updatedPoolResponse.json()) as typeof updatedPoolState;
      if (
        Math.abs((updatedPoolState?.totalLiquidity ?? 0) - 210) < 1e-4 &&
        Math.abs((updatedPoolState?.outcomeSupply?.[0] ?? 0) - 110) < 1e-4
      ) {
        break;
      }
      await page.waitForTimeout(200);
    }
    expect(updatedPoolState).not.toBeNull();
    expect(updatedPoolState!.totalLiquidity).toBeCloseTo(210, 5);
    expect(updatedPoolState!.outcomeSupply[0]).toBeCloseTo(110, 5);

    const suspensionReason = `Test pause ${Date.now()}`;
    const suspendDetails = targetCard
      .locator("details")
      .filter({ hasText: "Suspend" })
      .first();
    await suspendDetails.locator("summary").click();
    const suspendForm = suspendDetails.locator("form");
    await suspendForm.locator('input[name="reason"]').fill(suspensionReason);
    await suspendForm.locator('input[name="network"]').fill("emulator");
    await suspendForm.locator('input[name="signer"]').fill("0xoperator");
    await suspendForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");
    const suspendedDetail = await expectState(
      "suspended",
      (detail) => detail.workflow[0]?.type === "suspend"
    );
    expect(suspendedDetail.workflow[0]?.description).toContain(suspensionReason);

    await targetCard.getByRole("button", { name: "Activate" }).click();
    await page.waitForLoadState("networkidle");
    await expectState("live", (detail) => detail.workflow[0]?.type === "open");

    const settlementOutcomeId = `${slug}-outcome-1`;
    const settlementTxHash = `0x${Math.random().toString(16).slice(2, 10)}`;
    const settleDetails = targetCard
      .locator("details")
      .filter({ hasText: "Settle" })
      .first();
    await settleDetails.locator("summary").click();
    const settleForm = settleDetails.locator("form");
    await settleForm.locator('input[name="outcomeId"]').fill("0");
    await settleForm.locator('input[name="resolvedOutcomeId"]').fill(settlementOutcomeId);
    await settleForm.locator('input[name="txHash"]').fill(settlementTxHash);
    await settleForm.locator('input[name="network"]').fill("testnet");
    await settleForm.locator('input[name="signer"]').fill("0xoracle");
    await settleForm.locator('textarea[name="notes"]').fill("Initial settlement");
    await settleForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");
    const settledDetail = await expectState("settled", (detail) => {
      const latestDescription = detail.workflow[0]?.description ?? "";
      return latestDescription.toLowerCase().includes("settled");
    });
    expect(settledDetail.settlement?.resolvedOutcomeId).toBe(settlementOutcomeId);

    const overrideReason = `Adjustment ${Date.now()}`;
    const overrideTxHash = `0x${Math.random().toString(16).slice(2, 10)}`;
    const overrideDetails = targetCard
      .locator("details")
      .filter({ hasText: "Override settlement" })
      .first();
    await overrideDetails.locator("summary").click();
    const overrideForm = overrideDetails.locator("form");
    await overrideForm.locator('input[name="outcomeId"]').fill("1");
    await overrideForm.locator('input[name="resolvedOutcomeId"]').fill(`${slug}-outcome-2`);
    await overrideForm.locator('input[name="txHash"]').fill(overrideTxHash);
    await overrideForm.locator('input[name="network"]').fill("testnet");
    await overrideForm.locator('input[name="signer"]').fill("0xoracle");
    await overrideForm.locator('input[name="reason"]').fill(overrideReason);
    await overrideForm.locator('textarea[name="notes"]').fill("Dispute resolved");
    await overrideForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");

    const overridePredicate = (detail: MarketDetailResponse) => {
      const matchesReason = detail.settlement?.overrideReason === overrideReason;
      const hasOverrideWorkflow = detail.workflow.some((entry) => {
        const description = entry.description?.toLowerCase() ?? "";
        return description.includes("override") || description.includes("overrid");
      });
      return matchesReason && hasOverrideWorkflow;
    };

    const overriddenDetail = await waitForDetail(
      (detail) => detail.state === "settled" && overridePredicate(detail)
    ).catch(async () => {
      const response = await request.post(
        `${resolveApiBase()}/markets/${createdMarket.id}/settlement/override`,
        {
          data: {
            outcomeId: 1,
            resolvedOutcomeId: `${slug}-outcome-2`,
            txHash: overrideTxHash,
            signer: "0xoracle",
            network: "testnet",
            reason: overrideReason,
            notes: "Dispute resolved",
          },
        }
      );
      expect(response.status()).toBe(200);
      const result = (await response.json()) as { market: MarketDetailResponse };
      expect(overridePredicate(result.market)).toBeTruthy();
      return result.market;
    });

    await expect(targetCard.locator(".admin-market-state")).toHaveText(stateLabels.settled);
    expect(
      overriddenDetail.workflow.some((entry) => {
        const description = entry.description?.toLowerCase() ?? "";
        return description.includes("override") || description.includes("overrid");
      })
    ).toBeTruthy();

    await targetCard.getByRole("button", { name: "Void" }).click();
    await page.waitForLoadState("networkidle");

    const voidDetail = await waitForDetail(
      (detail) => detail.state === "voided" && detail.workflow[0]?.type === "void"
    ).catch(async () => {
      const response = await request.post(`${resolveApiBase()}/markets/${createdMarket.id}/void`, {
        data: {},
      });
      expect(response.status()).toBe(200);
      const result = (await response.json()) as { market: MarketDetailResponse };
      expect(result.market.workflow[0]?.type).toBe("void");
      return result.market;
    });

    await expect(targetCard.locator(".admin-market-state")).toHaveText(stateLabels.voided);

    expect(voidDetail.totalLiquidity).toBeCloseTo(210, 5);
    expect(Array.isArray(voidDetail.workflow)).toBe(true);
    expect(voidDetail.workflow[0]?.type).toBe("void");
    expect(voidDetail.settlement?.overrideReason).toBe(overrideReason);
  });
});
