import { test, expect } from '@playwright/test';

test.describe('Admin Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Mock admin user
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('flow_address', '0xadmin123');
      window.localStorage.setItem('flow_session', 'admin-session-token');
      window.localStorage.setItem('user_roles', JSON.stringify(['ADMIN']));
    });
  });

  test('should access admin panel', async ({ page }) => {
    await page.goto('/admin');

    // Should show admin sections
    await expect(page.locator('text=Market Management')).toBeVisible();
    await expect(page.locator('text=Role Management')).toBeVisible();
    await expect(page.locator('text=Monitoring')).toBeVisible();
  });

  test('should view market management', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to market management
    await page.click('text=Market Management');

    // Should show markets table
    await expect(
      page.locator('[data-testid="markets-table"]')
    ).toBeVisible({ timeout: 5000 });

    // Should show action buttons
    await expect(page.locator('text=Suspend')).toBeVisible();
    await expect(page.locator('text=Close')).toBeVisible();
  });

  test('should approve role purchase request', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to role purchases section
    await page.click('text=Role Purchase Requests');

    // Wait for requests table
    await page.waitForSelector('[data-testid="role-requests-table"]', {
      timeout: 5000,
    });

    // Should show pending requests
    const pendingRequests = page.locator('[data-testid="pending-request"]');

    if ((await pendingRequests.count()) > 0) {
      // Click approve on first request
      await pendingRequests.first().locator('text=Approve').click();

      // Should show confirmation
      await expect(page.locator('text=Request approved')).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('should view monitoring metrics', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to monitoring
    await page.click('text=Monitoring');

    // Should show metrics
    await expect(page.locator('text=Total Trades')).toBeVisible();
    await expect(page.locator('text=Active Markets')).toBeVisible();
    await expect(page.locator('text=System Health')).toBeVisible();
  });
});
