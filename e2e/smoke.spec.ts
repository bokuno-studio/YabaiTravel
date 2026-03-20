import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/ja')
  await expect(page).toHaveTitle(/yabai/)
  await expect(page.locator('body')).toBeVisible()
})

test('navigation works - Sports Guide link', async ({ page }) => {
  await page.goto('/ja')
  const sportsGuideLink = page.locator('a[href*="/ja/sports-guide"], a:has-text("スポーツガイド")')
  if (await sportsGuideLink.count() > 0) {
    await sportsGuideLink.first().click()
    await expect(page).toHaveURL(/sports-guide/)
  }
})

test('pricing page loads', async ({ page }) => {
  await page.goto('/ja/pricing')
  await expect(page.locator('body')).toBeVisible()
})

test('filter works - click a race type checkbox', async ({ page }) => {
  await page.goto('/ja')
  const checkbox = page.locator('input[type="checkbox"]').first()
  if (await checkbox.count() > 0) {
    await checkbox.click()
    // Verify page still renders after filtering
    await expect(page.locator('body')).toBeVisible()
  }
})
