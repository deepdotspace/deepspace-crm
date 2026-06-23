/**
 * useGmailWrite — Gmail mutation surface for the CRM (gmail.modify scope).
 *
 * Companion to the read-only `useGmail` hook. Wraps the SDK write endpoints
 * added for typical CRM workflows:
 *   - google/gmail-send       compose / reply (rides gmail.modify)
 *   - google/gmail-mark-read  / gmail-mark-unread
 *   - google/gmail-archive
 *   - google/gmail-star       / gmail-unstar  (STARRED label)
 *   - google/gmail-trash
 *   - google/gmail-modify     low-level add/removeLabelIds primitive
 *
 * Every call goes through `withGoogleConsent`, which transparently handles
 * the api-worker's `{ requiresOAuth, authUrl }` recovery shape: it opens the
 * Google consent popup, waits for it to finish, and replays the original
 * request once. The first write a `gmail.readonly` user performs therefore
 * upgrades the grant to `gmail.modify` via Google's incremental auth
 * (`include_granted_scopes=true`) without the caller writing any popup code.
 *
 * SECURITY: these endpoints are only ever invoked from explicit user
 * gestures (compose Send, inbox action buttons). They are intentionally NOT
 * exposed to the AI agent tool surface — keep it that way (see src/ai/tools.ts).
 */

import { useCallback, useState } from 'react'
import { integration } from 'deepspace'

export type GmailTarget = 'message' | 'thread'

export interface GmailSendParams {
  to: string
  cc?: string
  bcc?: string
  subject: string
  /** Plain-text body. */
  content: string
  /** Optional HTML alternative. */
  html?: string
  /** Reply threading — Gmail thread id of the conversation being replied to. */
  threadId?: string
}

export interface GmailWriteResult {
  success: boolean
  error?: string
  /** True when the user dismissed the Google consent popup without granting. */
  cancelled?: boolean
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
 * completion via the SDK's `deepspace-oauth-complete` postMessage). Mirrors
 * the popup handling in the Email tab so behavior is identical everywhere.
 */
function awaitConsent(authUrl: string): Promise<void> {
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
async function withGoogleConsent(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<GmailWriteResult> {
  const attempt = async (): Promise<{ result: GmailWriteResult; needsConsent?: string }> => {
    const res = await integration.post<WritePayload>(endpoint, params)
    if (!res.success) {
      return { result: { success: false, error: res.error ?? 'Gmail request failed' } }
    }
    const payload = ((res.data ?? res) as unknown) as WritePayload
    if (payload?.requiresOAuth && typeof payload.authUrl === 'string') {
      return { result: { success: false }, needsConsent: payload.authUrl }
    }
    return { result: { success: true, data: payload } }
  }

  const first = await attempt()
  if (!first.needsConsent) return first.result

  // Prompt for the gmail.modify grant, then replay once.
  await awaitConsent(first.needsConsent)
  const second = await attempt()
  if (second.needsConsent) {
    // User closed the popup without granting (or granted a narrower scope).
    return { success: false, cancelled: true, error: 'Gmail write access was not granted.' }
  }
  return second.result
}

function targetBody(id: string, target: GmailTarget): Record<string, unknown> {
  return target === 'thread' ? { threadId: id, target } : { id, target }
}

export function useGmailWrite() {
  const [isSending, setIsSending] = useState(false)
  const [isMutating, setIsMutating] = useState(false)

  const send = useCallback(async (params: GmailSendParams): Promise<GmailWriteResult> => {
    setIsSending(true)
    try {
      const body: Record<string, unknown> = {
        to: params.to,
        subject: params.subject,
        content: params.content,
      }
      if (params.cc) body.cc = params.cc
      if (params.bcc) body.bcc = params.bcc
      if (params.html) body.html = params.html
      if (params.threadId) body.threadId = params.threadId
      return await withGoogleConsent('google/gmail-send', body)
    } finally {
      setIsSending(false)
    }
  }, [])

  const runMutation = useCallback(
    async (endpoint: string, body: Record<string, unknown>): Promise<GmailWriteResult> => {
      setIsMutating(true)
      try {
        return await withGoogleConsent(endpoint, body)
      } finally {
        setIsMutating(false)
      }
    },
    [],
  )

  const markRead = useCallback(
    (id: string, target: GmailTarget = 'message') => runMutation('google/gmail-mark-read', targetBody(id, target)),
    [runMutation],
  )
  const markUnread = useCallback(
    (id: string, target: GmailTarget = 'message') => runMutation('google/gmail-mark-unread', targetBody(id, target)),
    [runMutation],
  )
  const archive = useCallback(
    (id: string, target: GmailTarget = 'message') => runMutation('google/gmail-archive', targetBody(id, target)),
    [runMutation],
  )
  const star = useCallback(
    (id: string, target: GmailTarget = 'message') => runMutation('google/gmail-star', targetBody(id, target)),
    [runMutation],
  )
  const unstar = useCallback(
    (id: string, target: GmailTarget = 'message') => runMutation('google/gmail-unstar', targetBody(id, target)),
    [runMutation],
  )
  const trash = useCallback(
    (id: string, target: GmailTarget = 'message') => runMutation('google/gmail-trash', targetBody(id, target)),
    [runMutation],
  )

  return { send, markRead, markUnread, archive, star, unstar, trash, isSending, isMutating }
}
