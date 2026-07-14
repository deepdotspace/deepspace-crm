import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Anonymous smoke tests.
 *
 * This CRM requires sign-in: an anonymous visit renders the SDK's
 * AuthOverlay (data-testid="auth-overlay") instead of the app shell, so
 * `app-navigation` never appears logged-out. Signed-in shell coverage
 * (navigation, user names, live records) lives in collab.spec.ts via the
 * `users` fixture. The only anonymous-reachable app pages are the public
 * legal pages (/privacy, /terms) required by Google OAuth verification.
 */
async function waitForAuthOverlay(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="auth-overlay"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('app loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForAuthOverlay(page)
    expect(errors).toEqual([])
  })

  test('sign-in overlay gates the app when logged out', async ({ page }) => {
    await page.goto('/')
    await waitForAuthOverlay(page)
    await expect(page.getByTestId('auth-overlay')).toBeVisible()
  })

  test('public legal pages render without sign-in', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
    await expect(page.getByTestId('auth-overlay')).toHaveCount(0)

    await page.goto('/terms')
    await expect(page.getByTestId('auth-overlay')).toHaveCount(0)
  })

  test('unknown route is gated behind sign-in too', async ({ page }) => {
    await page.goto('/definitely-not-a-real-route')
    await waitForAuthOverlay(page)
    await expect(page.getByTestId('auth-overlay')).toBeVisible()
  })
})
