import { test, expect } from '@playwright/test'

test.describe('Next version smoke test (localhost)', () => {
  test('list page loads and displays event cards', async ({ page }) => {
    await page.goto('/ja')
    await expect(page).toHaveTitle(/yabai/i)

    // Wait for cards to render
    const cards = page.locator('[data-slot="card"]')
    await expect(cards.first()).toBeVisible({ timeout: 15000 })

    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('event card renders with content', async ({ page }) => {
    await page.goto('/ja')
    // Wait for data to load
    const card = page.locator('[data-slot="card"]').first()
    await expect(card).toBeVisible({ timeout: 15000 })

    // Wait a moment for async data population
    await page.waitForTimeout(2000)

    // Card should be visible and have non-zero dimensions
    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThan(50)
  })

  test('page has filter controls', async ({ page }) => {
    await page.goto('/ja')
    await expect(page.locator('body')).toBeVisible()

    // Current page uses existing filter UI (accordion-based) or new FiltersSidebar
    // Check for any filter-related interactive elements
    const filterControls = page.locator(
      'button:has-text("絞り込み"), button:has-text("絞り込み条件"), input[type="checkbox"], button:has-text("開催時期"), button:has-text("距離")'
    ).first()
    await expect(filterControls).toBeVisible({ timeout: 10000 })
  })

  test('English page loads', async ({ page }) => {
    await page.goto('/en')
    await expect(page).toHaveTitle(/yabai/i)
    await expect(page.locator('body')).toBeVisible()
  })
})
