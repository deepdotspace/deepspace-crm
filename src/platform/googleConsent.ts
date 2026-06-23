/**
 * googleConsent — shared Google incremental-consent helper.
 *
 * Both the Gmail write surface (useGmailWrite) and the Calendar surface
 * (useCalendar) call api-worker endpoints that may return the
 * `{ requiresOAuth, authUrl }` recovery shape when the signed-in user hasn't
 * yet granted the scope the action needs. `withGoogleConsent` runs the
 * request and, on that shape, opens the Google consent popup, waits for it to
 * finish, and replays the request exactly once — so the first write/schedule a
 * user performs upgrades the grant via Google's incremental auth
 * (`include_granted_scopes=true`) without the caller writing any popup code.
 *
 * SECURITY: callers only ever invoke these from explicit user gestures
 * (compose Send, Schedule Meeting, inbox/calendar action buttons). They are
 * intentionally NOT exposed to the AI agent surface — keep it that way
 * (src/ai/tools.ts only wraps read-only BUILT_IN_TOOLS).
 */

import { integration } from 'deepspace'

export interface GoogleWriteResult {
  success: boolean
  error?: string
  /** True when the user dismissed the Google consent popup without granting. */
  cancelled?: boolean
  /** The endpoint payload on success (e.g. the created Calendar event). */
  data?: unknown
}

interface WritePayload {
  requiresOAuth?: boolean
  authUrl?: string
  error?: string
  [k: string]: unknown
}

/**
 * Open the Google consent popup and resolve once it closes (or signals
 * completion via the SDK's `deepspace-oauth-complete` postMessage).
 */
export function awaitConsent(authUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const popup = window.open(authUrl, 'google-auth', 'width=500,height=600')
    if (!popup) {
      // Popup blocked — fall back to a full-page redirect. The promise never
      // resolves because the page is navigating away; that's fine.
      window.location.href = authUrl
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      clearInterval(interval)
      resolve()
    }
    const onMessage = (e: MessageEvent) => {
      // The OAuth callback page (served by the api-worker, a DIFFERENT origin
      // from this app) posts to window.opener via '*'. We therefore cannot
      // assert e.origin === our origin. Instead we require the message to come
      // from the exact popup window we opened (e.source === popup) AND match
      // the expected payload type — so an unrelated page/frame cannot spoof a
      // completion signal. The message carries no token/data; it only releases
      // the replay, which still re-checks the grant server-side.
      if (e.source !== popup) return
      if ((e.data as { type?: string })?.type === 'deepspace-oauth-complete') {
        try { popup.close() } catch { /* cross-origin close may throw */ }
        finish()
      }
    }
    window.addEventListener('message', onMessage)
    const interval = setInterval(() => {
      if (popup.closed) finish()
    }, 500)
  })
}

/**
 * Run a write request, transparently handling the OAuth-required recovery by
 * prompting for consent and replaying the request exactly once.
 */
export async function withGoogleConsent(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<GoogleWriteResult> {
  const attempt = async (): Promise<{ result: GoogleWriteResult; needsConsent?: string }> => {
    const res = await integration.post<WritePayload>(endpoint, params)
    if (!res.success) {
      return { result: { success: false, error: res.error ?? 'Request failed' } }
    }
    const payload = ((res.data ?? res) as unknown) as WritePayload
    if (payload?.requiresOAuth && typeof payload.authUrl === 'string') {
      return { result: { success: false }, needsConsent: payload.authUrl }
    }
    return { result: { success: true, data: payload } }
  }

  const first = await attempt()
  if (!first.needsConsent) return first.result

  // Prompt for the scope grant, then replay once.
  await awaitConsent(first.needsConsent)
  const second = await attempt()
  if (second.needsConsent) {
    // User closed the popup without granting (or granted a narrower scope).
    return { success: false, cancelled: true, error: 'Access was not granted.' }
  }
  return second.result
}
