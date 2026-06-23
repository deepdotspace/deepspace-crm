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
import { withGoogleConsent, type GoogleWriteResult } from './googleConsent'

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

/**
 * Re-exported alias — the Gmail write surface historically named this type
 * `GmailWriteResult`. It is the shared {@link GoogleWriteResult} shape; the
 * OAuth-recovery replay logic now lives in `./googleConsent` so the Calendar
 * surface reuses it verbatim.
 */
export type GmailWriteResult = GoogleWriteResult

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
