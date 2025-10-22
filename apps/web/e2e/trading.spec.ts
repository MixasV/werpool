import { test, expect } from '@playwright/test';

test.describe('Trading Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated user
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('flow_address', '0x1234567890abcdef');
      window.localStorage.setItem('flow_session', 'mock-session-token');
    });
  });

  test('should browse markets', async ({ page }) => {
    await page.goto('/markets');

    // Wait for markets to load
    await page.waitForSelector('[data-testid="market-card"]', {
      timeout: 10000,
    });

    // Should show market cards
    const marketCards = page.locator('[data-testid="market-card"]');
    await expect(marketCards).not.toHaveCount(0);

    // Each market should have title and outcomes
    const firstMarket = marketCards.first();
    await expect(firstMarket.locator('[data-testid="market-title"]')).toBeVisible();
    await expect(firstMarket.locator('[data-testid="market-outcomes"]')).toBeVisible();
  });

  test('should view market details', async ({ page }) => {
    await page.goto('/markets');

    // Wait and click first market
    await page.waitForSelector('[data-testid="market-card"]');
    const firstMarket = page.locator('[data-testid="market-card"]').first();
    await firstMarket.click();

    // Should show market details
    await expect(page.locator('[data-testid="market-description"]')).toBeVisible();
    await expect(page.locator('[data-testid="trade-panel"]')).toBeVisible();
  });

  test('should get trade quote', async ({ page }) => {
    await page.goto('/markets');
    await page.waitForSelector('[data-testid="market-card"]');

    // Navigate to first open market
    const marketCard = page.locator('[data-testid="market-card"]').first();
    await marketCard.click();

    // Enter trade amount
    await page.fill('[data-testid="shares-input"]', '10');

    // Select buy
    await page.click('[data-testid="buy-button"]');

    // Should show quote
    await expect(
      page.locator('[data-testid="trade-quote"]')
    ).toBeVisible({ timeout: 5000 });

    const quote = page.locator('[data-testid="quote-cost"]');
    await expect(quote).toContainText('FLOW');
  });

  test('should show trade confirmation', async ({ page }) => {
    await page.goto('/markets');
    await page.waitForSelector('[data-testid="market-card"]');

    const marketCard = page.locator('[data-testid="market-card"]').first();
    await marketCard.click();

    // Enter trade and get quote
    await page.fill('[data-testid="shares-input"]', '5');
    await page.click('[data-testid="buy-button"]');

    await page.waitForSelector('[data-testid="trade-quote"]');

    // Click execute
    await page.click('[data-testid="execute-trade"]');

    // Should show confirmation
    await expect(
      page.locator('text=Confirm Trade')
    ).toBeVisible({ timeout: 3000 });

    // Should show trade details
    await expect(page.locator('text=5 shares')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-button"]')).toBeVisible();
  });
});
