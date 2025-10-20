import { expect, test } from "@playwright/test";

const resolveApiBase = () =>
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

const shouldSkip = () => {
  const strategy = (
    process.env.NEXT_PUBLIC_FLOW_ROLES_STRATEGY ??
    process.env.FLOW_ROLES_STRATEGY ??
    "legacy"
  ).toLowerCase();
  return strategy !== "onchain";
};

test.describe("admin roles on-chain", () => {
  test.skip(shouldSkip(), "Runs only when Flow roles strategy is onchain");

  test("shows on-chain panel without connected wallet", async ({ page, request }) => {
    const resetResponse = await request.post(`${resolveApiBase()}/admin/reset`);
    expect(resetResponse.status()).toBe(204);

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();

    await expect(
      page.getByText("The target address must set up role storage beforehand.")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Grant role" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Set up role storage" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Check wallet roles" })).toBeDisabled();

    await expect(page.getByText("No roles assigned yet.")).toBeVisible();
  });
});
