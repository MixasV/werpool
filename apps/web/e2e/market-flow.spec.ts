import { test, expect } from '@playwright/test';

test.describe('Market Trading Flow', () => {
  test('should load markets page', async ({ page }) => {
    await page.goto('/markets');
    await expect(page).toHaveTitle(/Werpool|Markets/);
    await expect(page.locator('h1')).toContainText(/Markets|Predictions/i);
  });

  test('should display market list', async ({ page }) => {
    await page.goto('/markets');
    
    const marketCards = page.locator('[class*="market-card"]');
    await expect(marketCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to market details', async ({ page }) => {
    await page.goto('/markets');
    
    const firstMarket = page.locator('[class*="market-card"]').first();
    await firstMarket.click();
    
    await expect(page).toHaveURL(/\/markets\/[a-z0-9-]+/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should show trade panel', async ({ page }) => {
    await page.goto('/markets');
    
    const firstMarketLink = page.locator('a[href^="/markets/"]').first();
    const href = await firstMarketLink.getAttribute('href');
    
    if (href) {
      await page.goto(href);
      
      const tradePanel = page.locator('[class*="trade-panel"]');
      await expect(tradePanel).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Wallet Connection Flow', () => {
  test('should show connect wallet button when not connected', async ({ page }) => {
    await page.goto('/');
    
    const connectButton = page.getByRole('button', { name: /connect|wallet/i });
    await expect(connectButton).toBeVisible();
  });
});

test.describe('Profile Page', () => {
  test('should redirect to markets when not authenticated', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL('/markets');
  });
});

test.describe('Accessibility', () => {
  test('markets page should not have critical accessibility issues', async ({ page }) => {
    await page.goto('/markets');
    
    // Check for heading hierarchy
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    
    // Check for landmarks
    const main = page.locator('main, [role="main"]');
    await expect(main).toBeVisible();
  });
});
