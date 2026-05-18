/**
 * useGmail — small React hook for fetching Gmail messages by query.
 *
 * Wraps the SDK's `google/gmail-inbox` endpoint (list+hydrate combined).
 * All four CRM Gmail surfaces (Email tab, Contact detail, Deal detail,
 * Dashboard widget, server search) flow through this single hook so
 * the OAuth-recovery + status-sync behavior is identical everywhere.
 *
 * Read-only — the only Gmail endpoints we ever touch from this hook
 * use the `gmail.readonly` scope. Compose / archive / label features
 * are not implemented (and Google hasn't approved a write scope for
 * this OAuth client anyway).
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { integration } from 'deepspace'

export interface GmailMessagePart {
  mimeType?: string
  filename?: string
  headers?: Array<{ name?: string; value?: string }>
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailMessagePart[]
}

export interface GmailMessage {
  id: string
  threadId?: string
  snippet?: string
  payload?: GmailMessagePart
  internalDate?: string
  labelIds?: string[]
}

export interface GmailQuery {
  /** Gmail search syntax (e.g. `from:alice@x.com OR to:alice@x.com`). */
  q?: string
  /**
   * Restrict to specific labels. Default `['INBOX']`. Pass `[]` to
   * search across all labels (sent, archive, etc.) — useful when
   * combined with `q` to find the full conversation history with a
   * contact regardless of folder.
   */
  labelIds?: string[]
  maxResults?: number
  /** 'metadata' is faster for thumbnail rows; 'full' for inline body. */
  format?: 'full' | 'metadata' | 'minimal'
  /**
   * Only request the label total when the caller actually displays
   * pagination — saves a Google round-trip for widget-style fetches.
   */
  includeLabelTotal?: boolean
}

interface FetchResult {
  messages: GmailMessage[]
  nextPageToken: string | null
  total: number | null
  /** When the api-worker returned `requiresOAuth`, the consent URL. */
  oauthAuthUrl: string | null
}

const EMPTY_RESULT: FetchResult = {
  messages: [],
  nextPageToken: null,
  total: null,
  oauthAuthUrl: null,
}

interface InboxPayload {
  requiresOAuth?: boolean
  authUrl?: string
  messages?: GmailMessage[]
  nextPageToken?: string
  resultSizeEstimate?: number
  labelTotal?: { messagesTotal?: number; messagesUnread?: number; threadsTotal?: number }
  error?: string
}

/**
 * Imperative fetch helper. Returns the result; the caller decides
 * what to do with `oauthAuthUrl` (open popup, redirect, etc.).
 */
export async function fetchGmail(
  query: GmailQuery,
  pageToken?: string | null,
): Promise<FetchResult> {
  const params: Record<string, unknown> = {
    maxResults: query.maxResults ?? 25,
    format: query.format ?? 'metadata',
  }
  if (query.q) params.q = query.q
  // Default to INBOX-only unless caller explicitly says otherwise.
  // Empty array is "search across all labels."
  if (query.labelIds !== undefined) {
    params.labelIds = query.labelIds
  } else {
    params.labelIds = ['INBOX']
  }
  if (pageToken) params.pageToken = pageToken
  if (query.includeLabelTotal) params.includeLabelTotal = true

  const result = await integration.post('google/gmail-inbox', params)
  if (!result.success) {
    throw new Error(result.error ?? 'Gmail request failed')
  }
  const payload = ((result.data ?? result) as unknown) as InboxPayload
  if (payload?.requiresOAuth && typeof payload.authUrl === 'string') {
    return { ...EMPTY_RESULT, oauthAuthUrl: payload.authUrl }
  }
  const total =
    payload.labelTotal?.messagesTotal
    ?? payload.resultSizeEstimate
    ?? null
  return {
    messages: payload.messages ?? [],
    nextPageToken: payload.nextPageToken ?? null,
    total,
    oauthAuthUrl: null,
  }
}

/**
 * React hook variant. Fetches on mount + whenever `query` changes.
 * Returns `{ messages, loading, error, oauthAuthUrl, refetch }`.
 *
 * For widgets that want pagination, use `fetchGmail` directly and
 * manage the pageToken yourself (see Email tab for the full pattern).
 */
export function useGmail(query: GmailQuery, enabled = true): {
  messages: GmailMessage[]
  total: number | null
  loading: boolean
  error: string | null
  oauthAuthUrl: string | null
  refetch: () => void
} {
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oauthAuthUrl, setOauthAuthUrl] = useState<string | null>(null)
  const [bump, setBump] = useState(0)

  // Stringify query for stable dep — avoids infinite refetch loops
  // when the caller passes a fresh-but-equivalent object literal.
  const queryKey = JSON.stringify(query)
  const lastReqId = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const reqId = ++lastReqId.current
    setLoading(true)
    setError(null)
    fetchGmail(query)
      .then((res) => {
        if (reqId !== lastReqId.current) return // stale
        setMessages(res.messages)
        setTotal(res.total)
        setOauthAuthUrl(res.oauthAuthUrl)
      })
      .catch((err) => {
        if (reqId !== lastReqId.current) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (reqId !== lastReqId.current) return
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryKey, bump])

  const refetch = useCallback(() => setBump((n) => n + 1), [])

  return { messages, total, loading, error, oauthAuthUrl, refetch }
}
