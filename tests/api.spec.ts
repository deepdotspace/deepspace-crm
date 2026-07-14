import { test, expect } from '@playwright/test'

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('integrations catalog proxies to api-worker', async ({ request }) => {
    const res = await request.get('/api/integrations')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { integrations?: Record<string, unknown> }
    expect(body.integrations).toBeTruthy()
  })

  // Exercises the RecordRoom DO stub path (`app:${DEEPSPACE_APP_ID}`).
  // /api/debug/* is only exposed when ALLOW_DEBUG_ROUTES=true, which
  // `deepspace dev` / `deepspace test` write into .dev.vars — so this runs
  // in tests but the route 404s in production.
  test('record room debug status responds (dev only)', async ({ request }) => {
    const res = await request.get('/api/debug/status')
    expect(res.ok()).toBeTruthy()
  })
})
