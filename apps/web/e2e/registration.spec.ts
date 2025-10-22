import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test('should complete wallet connection', async ({ page }) => {
    await page.goto('/');

    // Click connect wallet button
    await page.click('text=Connect Wallet');

    // Wait for wallet connection dialog
    await page.waitForSelector('[data-testid="wallet-dialog"]', {
      timeout: 5000,
    });

    // Should show wallet options
    await expect(page.locator('text=Blocto')).toBeVisible();
    await expect(page.locator('text=Lilico')).toBeVisible();
  });

  test('should show onboarding after first connection', async ({ page }) => {
    await page.goto('/');

    // Mock wallet connection
    await page.evaluate(() => {
      window.localStorage.setItem('flow_address', '0x1234567890abcdef');
      window.localStorage.setItem('is_new_user', 'true');
    });

    await page.reload();

    // Should show onboarding dialog
    await expect(
      page.locator('text=Welcome to WerPool')
    ).toBeVisible({ timeout: 5000 });

    // Complete onboarding steps
    await page.click('text=Next');
    await page.click('text=Next');
    await page.click('text=Get Started');

    // Should redirect to markets
    await expect(page).toHaveURL(/\/markets/);
  });

  test('should access profile after connection', async ({ page }) => {
    await page.goto('/');

    // Mock connected state
    await page.evaluate(() => {
      window.localStorage.setItem('flow_address', '0x1234567890abcdef');
      window.localStorage.setItem('flow_session', 'mock-session-token');
    });

    await page.reload();

    // Navigate to profile
    await page.click('[data-testid="profile-button"]');
    await page.click('text=Profile');

    // Should show profile page
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator('text=My Profile')).toBeVisible();
  });
});
