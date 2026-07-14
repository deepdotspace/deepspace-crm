/**
 * Email tab — Gmail inbox for the signed-in user.
 *
 * Reading uses the `gmail.readonly` scope. The CRM write actions
 * (compose / reply, mark read/unread, archive, trash) use the broader
 * `gmail.modify` scope, requested incrementally on first use. Both are
 * per-user OAuth grants billed to the calling user (see integrations.ts).
 *
 * Scopes:
 *   - gmail.readonly — list + read messages/threads (unchanged).
 *   - gmail.modify   — send mail and mutate the mailbox (labels, trash).
 *     gmail.modify cannot permanently delete (that needs the full
 *     mail.google.com scope, which we deliberately do NOT request);
 *     Trash here is recoverable.
 *
 * Flow:
 *   1. On mount: GET /api/integrations/status. `gmailRead` gates the
 *      inbox; `gmailModify` gates whether write actions are already
 *      authorized (they still work without it — the first write triggers
 *      an incremental consent that upgrades the grant).
 *   2. Connect calls google/gmail-inbox with no token → api-worker
 *      returns `requiresOAuth + authUrl` → popup → consent → messages load.
 *   3. Write actions flow through useGmailWrite, which replays the request
 *      after consent. Disconnect revokes via the platform endpoint.
 */

import { useEffect, useState, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { integration, useAuth, getAuthToken } from 'deepspace'
import {
  Mail, MailOpen, ExternalLink, RefreshCw, Plug, Unplug, Search, Inbox,
  ChevronLeft, ChevronRight, Archive, Trash2, Reply, PenSquare, Loader2, Star,
} from 'lucide-react'
import { Button, useToast } from '../components/ui'
import { ComposeEmailDialog } from '../components/ComposeEmailDialog'
import { useGmailWrite } from '../platform/useGmailWrite'

interface GoogleStatus {
  connected: boolean
  gmailRead: boolean
  gmailModify: boolean
  gmail: boolean
  email?: string
}
const EMPTY_STATUS: GoogleStatus = { connected: false, gmailRead: false, gmailModify: false, gmail: false }

interface GmailMessagePart {
  mimeType?: string
  filename?: string
  headers?: Array<{ name?: string; value?: string }>
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailMessagePart[]
}

interface GmailMessage {
  id: string
  threadId?: string
  snippet?: string
  payload?: GmailMessagePart
  internalDate?: string
  labelIds?: string[]
}

interface InboxPayload {
  requiresOAuth?: boolean
  authUrl?: string
  messages?: GmailMessage[]
  nextPageToken?: string
  resultSizeEstimate?: number
  // Authoritative INBOX total when the request opted in via
  // `includeLabelTotal: true`. Sourced from `users.labels.get('INBOX')`
  // which is what mail.google.com displays — preferred over
  // `resultSizeEstimate`, which can drift across pages.
  labelTotal?: { messagesTotal?: number; messagesUnread?: number }
  partialErrors?: Array<{ id: string; status: number; error: string }>
  error?: string
}

const PAGE_SIZE = 25

/** Mailbox filter → the single Gmail label the list view is scoped to. */
const FILTER_LABEL = {
  inbox: 'INBOX',
  starred: 'STARRED',
  unread: 'UNREAD',
} as const

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function EmailPage() {
  const { isSignedIn } = useAuth()
  const [status, setStatus] = useState<GoogleStatus>(EMPTY_STATUS)
  const [statusLoading, setStatusLoading] = useState(true)
  const [messages, setMessages] = useState<GmailMessage[] | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `searchInput` is the text the user is typing right now.
  // `searchQuery` is the *committed* search (Enter pressed) that
  // actually goes to Gmail. Server-side search runs against the
  // entire mailbox via the `q` parameter on `gmail-inbox` — this
  // replaces the older in-memory filter that only saw the loaded
  // page. Empty string = inbox view (default).
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusBump, setStatusBump] = useState(0)

  // Pagination state — modeled on Gmail's "1-50 of 1,091 [<] [>]" UI.
  //
  // The Gmail REST API only returns a forward token (`nextPageToken`);
  // there's no native way to go back. We therefore keep a stack of the
  // tokens we used to land on each page. `tokensVisited[i]` is the
  // pageToken we sent to fetch page i (null for page 0). To go back,
  // we re-fetch with the previous entry in the stack.
  const [tokensVisited, setTokensVisited] = useState<(string | null)[]>([null])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  // Returned by the latest response. Null = we're on the final page.
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  // Server's estimate of total matches. Gmail returns this with every
  // list call; the value can fluctuate slightly between pages (it is an
  // estimate, not a count) — same behavior as mail.google.com.
  const [resultSizeEstimate, setResultSizeEstimate] = useState<number | null>(null)

  // Gmail write surface (compose/reply, mark read/unread, star, archive, trash).
  const { markRead, markUnread, archive, trash, star, unstar } = useGmailWrite()
  const toast = useToast()

  // Mailbox view filter — maps to Gmail label filtering server-side.
  // 'starred' exists partly as proof-of-write: star a message, switch to
  // Starred, and the STARRED label change is visible immediately (and in
  // Gmail itself). All three are single-label views so labelTotal applies.
  const [mailboxFilter, setMailboxFilter] = useState<'inbox' | 'starred' | 'unread'>('inbox')
  // Compose dialog state. `null` = closed. `threadId` set = reply.
  const [compose, setCompose] = useState<{
    prefillTo?: string
    prefillSubject?: string
    threadId?: string
  } | null>(null)

  // ── status ──
  useEffect(() => {
    if (!isSignedIn) {
      setStatus(EMPTY_STATUS)
      setStatusLoading(false)
      return
    }
    let cancelled = false
    setStatusLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/integrations/status', {
          credentials: 'include',
          headers: await authHeaders(),
        })
        const body = res.ok ? await res.json() : null
        if (cancelled) return
        const g = (body as { google?: Partial<GoogleStatus> } | null)?.google
        setStatus({ ...EMPTY_STATUS, ...(g ?? {}) })
      } catch {
        if (!cancelled) setStatus(EMPTY_STATUS)
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isSignedIn, statusBump])

  const refreshStatus = useCallback(() => setStatusBump((n) => n + 1), [])

  // ── fetch a single page ──
  //
  // `google/gmail-inbox` is the combined list+hydrate endpoint in the
  // SDK so apps don't have to N+1 in the browser. One client request →
  // one proxy rate-limit charge → server-side parallel hydrate against
  // Google → rich messages with headers + body parts in one response.
  // `format: 'full'` includes the body so we can render the message text.
  //
  // Each call replaces the visible list (Gmail-style pagination, not
  // infinite scroll). The page token is supplied by the navigation
  // helpers below; this function itself doesn't know what page it's on.
  const fetchPage = useCallback(
    async (pageToken: string | null) => {
      setLoadingMessages(true)
      setError(null)
      try {
        // When a search query is active we leave `labelIds` off so
        // Gmail searches the full mailbox (sent + archive + inbox);
        // otherwise we restrict to INBOX for the default inbox view.
        // `labelTotal` only applies when filtering to one label, so
        // we skip it during search.
        const params: Record<string, unknown> = {
          maxResults: PAGE_SIZE,
          format: 'full',
        }
        if (searchQuery.trim()) {
          params.q = searchQuery.trim()
          params.labelIds = []
        } else {
          params.labelIds = [FILTER_LABEL[mailboxFilter]]
          params.includeLabelTotal = true
        }
        if (pageToken) params.pageToken = pageToken

        const result = await integration.post('google/gmail-inbox', params)

        if (!result.success) {
          setError(result.error ?? 'Gmail request failed')
          return
        }

        const payload = ((result.data ?? result) as unknown) as InboxPayload
        if (payload?.requiresOAuth && typeof payload.authUrl === 'string') {
          // Optimistically clear the local "connected" state. Otherwise
          // the status badge keeps saying "connected" while the popup
          // waits for re-consent — looks broken even though the flow
          // is doing the right thing. The api-worker also clears its
          // stored row on the same 401, so the next refreshStatus()
          // poll will agree.
          setStatus(EMPTY_STATUS)
          setMessages(null)
          setTokensVisited([null])
          setCurrentPageIndex(0)
          setNextPageToken(null)

          const popup = window.open(payload.authUrl, 'google-auth', 'width=500,height=600')
          if (!popup) {
            window.location.href = payload.authUrl
            return
          }
          const interval = setInterval(() => {
            if (popup.closed) {
              clearInterval(interval)
              refreshStatus()
              void fetchPage(null)
            }
          }, 500)
          return
        }

        setMessages(payload.messages ?? [])
        setNextPageToken(payload.nextPageToken ?? null)
        // Prefer the authoritative label total when present (matches
        // mail.google.com); fall back to resultSizeEstimate when an
        // older api-worker without includeLabelTotal is responding.
        const total =
          payload.labelTotal?.messagesTotal
          ?? payload.resultSizeEstimate
        if (typeof total === 'number') {
          setResultSizeEstimate(total)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingMessages(false)
      }
    },
    [refreshStatus, searchQuery, mailboxFilter],
  )

  // When the committed search query or mailbox filter changes, reset
  // pagination state + refetch from page 1. We watch primitives
  // (searchQuery, not the input) so typing into the box doesn't refetch
  // on every keystroke.
  useEffect(() => {
    if (!status.gmailRead) return
    setTokensVisited([null])
    setCurrentPageIndex(0)
    setNextPageToken(null)
    setResultSizeEstimate(null)
    void fetchPage(null)
    // fetchPage is stable per-searchQuery/-filter via the deps above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, mailboxFilter, status.gmailRead])

  // Refresh = re-fetch current page, keep history intact.
  const refreshCurrentPage = useCallback(() => {
    void fetchPage(tokensVisited[currentPageIndex] ?? null)
  }, [fetchPage, tokensVisited, currentPageIndex])

  // Forward — uses the nextPageToken from the latest response, pushes
  // it onto the visited stack, and bumps the index. Idempotent on the
  // last page (nextPageToken null → button disabled, but defensive).
  const goToNextPage = useCallback(() => {
    if (!nextPageToken) return
    const tokenForNextPage = nextPageToken
    setTokensVisited((prev) => {
      // If we already have an entry at currentPageIndex+1 (user hit
      // back, then forward), keep it consistent rather than appending.
      const next = prev.slice(0, currentPageIndex + 1)
      next.push(tokenForNextPage)
      return next
    })
    setCurrentPageIndex((i) => i + 1)
    void fetchPage(tokenForNextPage)
  }, [nextPageToken, currentPageIndex, fetchPage])

  // Back — re-fetch with the previously-saved page token (which may be
  // null = page 0). Disabled at page 0.
  const goToPrevPage = useCallback(() => {
    if (currentPageIndex === 0) return
    const targetIndex = currentPageIndex - 1
    setCurrentPageIndex(targetIndex)
    void fetchPage(tokensVisited[targetIndex] ?? null)
  }, [currentPageIndex, tokensVisited, fetchPage])

  // First page reset — used after disconnect/reconnect and on initial
  // load. Wipes pagination history.
  const resetToFirstPage = useCallback(() => {
    setTokensVisited([null])
    setCurrentPageIndex(0)
    void fetchPage(null)
  }, [fetchPage])

  // (Auto-load on grant is handled by the searchQuery effect above —
  // when status.gmailRead first becomes true, that effect fires with
  // searchQuery="" and fetches the default inbox view.)

  // ── disconnect ──
  const onDisconnect = useCallback(async () => {
    setLoadingMessages(true)
    try {
      await fetch('/api/integrations/oauth/google/disconnect', {
        method: 'DELETE',
        credentials: 'include',
        headers: await authHeaders(),
      })
      setMessages(null)
      setTokensVisited([null])
      setCurrentPageIndex(0)
      setNextPageToken(null)
      setResultSizeEstimate(null)
      refreshStatus()
    } finally {
      setLoadingMessages(false)
    }
  }, [refreshStatus])

  // ── write actions ──
  //
  // Each action updates the visible list optimistically, then issues the
  // gmail.modify call. On failure we surface the error and refetch the
  // current page to resync. After a successful write that may have changed
  // the user's scope (first-time consent), we refresh status so the badge
  // reflects gmailModify.
  const applyResult = useCallback(
    (
      res: { success: boolean; error?: string; cancelled?: boolean },
      action: string,
      successMessage?: string,
    ) => {
      if (res.success) {
        // A first-time write may have just upgraded the grant to gmail.modify.
        refreshStatus()
        // Name the mailbox mutation explicitly — the change happened in the
        // user's real Gmail, not just in this list, and the toast makes that
        // visible (also to anyone reviewing the gmail.modify write surface).
        if (successMessage) toast.success(successMessage)
        return true
      }
      // Failed or cancelled — resync the list so the optimistic change is
      // reverted. Only surface an error message when it actually failed
      // (cancelling the consent popup is not an error worth shouting about).
      if (!res.cancelled) {
        setError(`Couldn't ${action}: ${res.error ?? 'unknown error'}`)
      }
      refreshCurrentPage()
      return false
    },
    [refreshStatus, refreshCurrentPage, toast],
  )

  const onToggleRead = useCallback(
    async (message: GmailMessage) => {
      const isUnread = message.labelIds?.includes('UNREAD') ?? false
      // Optimistic relabel. In the Unread view, marking read also removes
      // the row (it no longer matches the view), mirroring unstar-in-Starred.
      setMessages((prev) => {
        if (!prev) return prev
        if (isUnread && mailboxFilter === 'unread') {
          return prev.filter((m) => m.id !== message.id)
        }
        return prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                labelIds: isUnread
                  ? (m.labelIds ?? []).filter((l) => l !== 'UNREAD')
                  : [...(m.labelIds ?? []), 'UNREAD'],
              }
            : m,
        )
      })
      const res = isUnread ? await markRead(message.id) : await markUnread(message.id)
      applyResult(
        res,
        isUnread ? 'mark as read' : 'mark as unread',
        isUnread ? 'Marked as read in Gmail' : 'Marked as unread in Gmail',
      )
    },
    [markRead, markUnread, applyResult, mailboxFilter],
  )

  const onToggleStar = useCallback(
    async (message: GmailMessage) => {
      const isStarred = message.labelIds?.includes('STARRED') ?? false
      // Optimistic relabel. In the Starred view, unstarring also removes the
      // row (it no longer matches the view), mirroring archive-in-inbox.
      setMessages((prev) => {
        if (!prev) return prev
        if (isStarred && mailboxFilter === 'starred') {
          return prev.filter((m) => m.id !== message.id)
        }
        return prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                labelIds: isStarred
                  ? (m.labelIds ?? []).filter((l) => l !== 'STARRED')
                  : [...(m.labelIds ?? []), 'STARRED'],
              }
            : m,
        )
      })
      const res = isStarred ? await unstar(message.id) : await star(message.id)
      applyResult(
        res,
        isStarred ? 'unstar' : 'star',
        isStarred ? 'Star removed in Gmail' : 'Starred in Gmail',
      )
    },
    [star, unstar, applyResult, mailboxFilter],
  )

  const onArchive = useCallback(
    async (message: GmailMessage) => {
      setMessages((prev) => prev?.filter((m) => m.id !== message.id) ?? prev)
      const res = await archive(message.id)
      applyResult(res, 'archive', 'Archived — removed from your Gmail inbox')
    },
    [archive, applyResult],
  )

  const onTrash = useCallback(
    async (message: GmailMessage) => {
      setMessages((prev) => prev?.filter((m) => m.id !== message.id) ?? prev)
      const res = await trash(message.id)
      applyResult(res, 'move to Trash', 'Moved to Gmail Trash (recoverable for 30 days)')
    },
    [trash, applyResult],
  )

  // Open the compose dialog as a reply to a message: prefill recipient from
  // the original sender, prefix the subject, and carry the threadId so the
  // SDK threads it for the recipient (In-Reply-To / References).
  const onReply = useCallback((message: GmailMessage) => {
    const headers = message.payload?.headers ?? []
    const getHeader = (n: string) =>
      headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? ''
    const fromRaw = getHeader('From')
    const m = /<([^>]+)>/.exec(fromRaw)
    const replyTo = m ? m[1] : fromRaw.trim()
    const subj = getHeader('Subject')
    const prefillSubject = /^re:/i.test(subj) ? subj : `Re: ${subj}`
    setCompose({ prefillTo: replyTo, prefillSubject, threadId: message.threadId ?? message.id })
  }, [])

  // ── render ──
  if (!isSignedIn) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Sign in to view your Gmail inbox.
      </div>
    )
  }

  // Server-side search means the API already returns only matching
  // messages — no in-memory filter needed. Variable kept for the JSX
  // below to avoid a wider refactor.
  const filtered = messages

  return (
    <div data-testid="email-page" className="p-6 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Email</h1>
          <p className="text-sm text-muted-foreground">
            Gmail · status:{' '}
            <span
              className={
                status.gmailRead
                  ? 'font-medium text-green-600'
                  : 'font-medium text-muted-foreground'
              }
            >
              {statusLoading ? 'checking…' : status.gmailRead ? 'connected' : 'not connected'}
            </span>
            {status.gmailRead && (
              <span className="ml-1 text-muted-foreground">
                · {status.gmailModify ? 'read & write' : 'read-only (write on first action)'}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {status.gmailRead && (
            <>
              <Button
                size="sm"
                onClick={() => setCompose({})}
                disabled={loadingMessages}
                className="gap-1.5"
              >
                <PenSquare className="w-3.5 h-3.5" />
                Compose
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshCurrentPage}
                disabled={loadingMessages}
                className="gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onDisconnect}
                disabled={loadingMessages}
                className="gap-1.5"
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Scope notice */}
      <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-muted-foreground">
        <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Reading uses the <code>gmail.readonly</code> scope. Compose, reply,
          mark read/unread, star, archive, and trash use <code>gmail.modify</code>,
          requested the first time you take a write action. We never permanently
          delete mail — Trash is recoverable in{' '}
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Gmail
          </a>.
        </span>
      </div>

      {/* Connect prompt */}
      {!status.gmailRead && !statusLoading && (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-xl">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Connect Gmail</h2>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
            Grant access to your Gmail inbox to read mail here. Compose, reply,
            archive, and trash are available once connected and ask for write
            permission the first time you use them.
          </p>
          <Button onClick={resetToFirstPage} disabled={loadingMessages} className="gap-2">
            <Plug className="w-4 h-4" />
            {loadingMessages ? 'Opening Google…' : 'Connect Gmail'}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4 mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Search row + pagination — search on the left, page indicator
          and arrows pinned to the right (mirroring mail.google.com).
          Search now hits Gmail's `q` parameter server-side (full
          mailbox, not just the loaded page); committed on Enter or
          on clearing the input. Pagination shows totals only in the
          default inbox view because Google doesn't return a reliable
          total for arbitrary search queries. */}
      {status.gmailRead && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Mailbox views — Starred doubles as visible proof that the star
              write landed: star a message, switch here, it's in the list. */}
          <div className="flex items-center gap-1" role="group" aria-label="Mailbox view">
            <FilterChip
              label="Inbox"
              icon={<Inbox className="w-3.5 h-3.5" />}
              active={mailboxFilter === 'inbox' && !searchQuery}
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
                setMailboxFilter('inbox')
              }}
            />
            <FilterChip
              label="Starred"
              icon={<Star className="w-3.5 h-3.5" />}
              active={mailboxFilter === 'starred' && !searchQuery}
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
                setMailboxFilter('starred')
              }}
            />
            <FilterChip
              label="Unread"
              icon={<Mail className="w-3.5 h-3.5" />}
              active={mailboxFilter === 'unread' && !searchQuery}
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
                setMailboxFilter('unread')
              }}
            />
          </div>
          <form
            className="relative max-w-sm flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              setSearchQuery(searchInput.trim())
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search Gmail (e.g. from:alice or has:attachment)"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                // Clear-on-empty without requiring Enter — feels natural.
                if (e.target.value === '' && searchQuery !== '') {
                  setSearchQuery('')
                }
              }}
              className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
            />
          </form>
          {messages !== null && messages.length > 0 && !searchQuery && (
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {formatPageRange(currentPageIndex, messages.length, resultSizeEstimate)}
              </span>
              <button
                type="button"
                onClick={goToPrevPage}
                disabled={loadingMessages || currentPageIndex === 0}
                aria-label="Newer"
                className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goToNextPage}
                disabled={loadingMessages || !nextPageToken}
                aria-label="Older"
                className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Message list */}
      {status.gmailRead && filtered !== null && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Mail className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? `No messages match "${searchQuery}".`
                  : mailboxFilter === 'starred'
                    ? 'No starred messages — click the star on any message to flag it in Gmail.'
                    : mailboxFilter === 'unread'
                      ? 'No unread messages.'
                      : 'Inbox is empty.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  onReply={onReply}
                  onToggleRead={onToggleRead}
                  onToggleStar={onToggleStar}
                  onArchive={onArchive}
                  onTrash={onTrash}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {status.gmailRead && messages === null && (
        <div className="bg-card border border-border rounded-xl py-16 text-center text-sm text-muted-foreground">
          Loading messages…
        </div>
      )}

      {/* Compose / reply — sends through the user's Gmail (gmail.modify). */}
      <ComposeEmailDialog
        open={compose !== null}
        onClose={() => setCompose(null)}
        prefillTo={compose?.prefillTo}
        prefillSubject={compose?.prefillSubject}
        threadId={compose?.threadId}
        onSent={() => {
          refreshStatus()
          refreshCurrentPage()
        }}
      />
    </div>
  )
}

/** Mailbox-view pill (Inbox / Starred / Unread). */
function FilterChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
        active
          ? 'bg-primary/10 border-primary/40 text-primary'
          : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// Small icon button used in the message-row action toolbar. Stops click
// propagation so acting on a message never toggles its thread open.
function RowAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}

function MessageRow({
  message,
  onReply,
  onToggleRead,
  onToggleStar,
  onArchive,
  onTrash,
}: {
  message: GmailMessage
  onReply: (m: GmailMessage) => void
  onToggleRead: (m: GmailMessage) => void | Promise<void>
  onToggleStar: (m: GmailMessage) => void | Promise<void>
  onArchive: (m: GmailMessage) => void | Promise<void>
  onTrash: (m: GmailMessage) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  // Disables the action toolbar while a mutation is in flight, preventing
  // double-submits (e.g. two archive clicks racing).
  const [busy, setBusy] = useState(false)
  const isUnread = message.labelIds?.includes('UNREAD') ?? false
  const isStarred = message.labelIds?.includes('STARRED') ?? false
  // Lazily-fetched full thread (all messages in this conversation).
  // Single-message rendering is the wrong UX — clicking a row in
  // Gmail's UI opens the entire thread in chronological order, with
  // each message collapsible. We do the same via gmail-thread-get,
  // fetched only once per row when it's first expanded.
  const [thread, setThread] = useState<GmailMessage[] | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)

  const headers = message.payload?.headers ?? []
  const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value
  const from = parseFrom(get('From') ?? '')
  const subject = get('Subject') ?? '(no subject)'
  const dateStr = formatDate(message.internalDate)
  const threadUrl = `https://mail.google.com/mail/u/0/#inbox/${message.threadId ?? message.id}`
  // Snippets ship HTML-encoded (`&#39;`, `&amp;`, …). React renders text
  // literally so we must decode before display, otherwise users see the
  // raw entities.
  const decodedSnippet = message.snippet ? decodeHtmlEntities(message.snippet) : ''

  const onToggle = useCallback(async () => {
    const next = !open
    setOpen(next)
    if (!next) return
    if (thread !== null) return // already loaded
    setThreadLoading(true)
    setThreadError(null)
    try {
      const res = await integration.post('google/gmail-thread-get', {
        id: message.threadId ?? message.id,
        format: 'full',
      })
      if (!res.success) {
        setThreadError(res.error ?? 'Thread fetch failed')
        return
      }
      const data = ((res.data ?? res) as { messages?: GmailMessage[] })
      setThread(data.messages ?? [message])
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : String(err))
    } finally {
      setThreadLoading(false)
    }
  }, [open, thread, message])

  // Run an action, disabling the toolbar while it's in flight. (React 19
  // no longer warns on setState after unmount, which happens when an
  // archive/trash optimistically removes this row from the parent list.)
  const run = useCallback(async (fn: () => void | Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }, [])

  return (
    <div className="group flex items-start gap-3 p-4 hover:bg-secondary/10 transition-colors">
      <div className="relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium text-primary">
        {from.initial}
        {isUnread && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary ring-2 ring-card"
            aria-label="Unread"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="block flex-1 min-w-0 text-left"
            aria-expanded={open}
          >
            <div className="flex items-center gap-2">
              <span className={`text-sm truncate ${isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                {from.display}
              </span>
              {thread && thread.length > 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground flex-shrink-0">
                  {thread.length}
                </span>
              )}
              <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">{dateStr}</span>
            </div>
            <div className={`text-sm truncate mt-0.5 ${isUnread ? 'font-medium text-foreground' : 'text-foreground'}`}>
              {decodeHtmlEntities(subject)}
            </div>
            {!open && decodedSnippet && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{decodedSnippet}</p>
            )}
          </button>

          {/* Action toolbar — ALWAYS visible (not hover-revealed): these are
              the app's Gmail write actions (gmail.modify) and hiding them
              behind a hover made them undiscoverable. */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <RowAction
              label={isStarred ? 'Unstar (removes the star in Gmail)' : 'Star (adds a star in Gmail)'}
              disabled={busy}
              onClick={() => run(() => onToggleStar(message))}
            >
              <Star
                className={`w-4 h-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`}
              />
            </RowAction>
            <RowAction
              label="Reply"
              disabled={busy}
              onClick={() => onReply(message)}
            >
              <Reply className="w-4 h-4" />
            </RowAction>
            <RowAction
              label={isUnread ? 'Mark as read' : 'Mark as unread'}
              disabled={busy}
              onClick={() => run(() => onToggleRead(message))}
            >
              {isUnread ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
            </RowAction>
            <RowAction
              label="Archive"
              disabled={busy}
              onClick={() => run(() => onArchive(message))}
            >
              <Archive className="w-4 h-4" />
            </RowAction>
            <RowAction
              label="Move to Trash"
              disabled={busy}
              onClick={() => run(() => onTrash(message))}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </RowAction>
          </div>
        </div>

        {open && (
          <div className="mt-3 space-y-2">
            {threadLoading && (
              <div className="text-xs text-muted-foreground">Loading thread…</div>
            )}
            {threadError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                {threadError}
              </div>
            )}
            {thread && thread.map((m, idx) => (
              <ThreadMessage key={m.id} message={m} defaultOpen={idx === thread.length - 1} />
            ))}
            <a
              href={threadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Open in Gmail
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One message inside a thread view. Defaults the most-recent message
 * (last in chronological order) to expanded; older messages collapse
 * to a one-line "From — date" header that the user can click to expand.
 * This matches Gmail's thread-view behavior.
 */
function ThreadMessage({
  message,
  defaultOpen,
}: {
  message: GmailMessage
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const headers = message.payload?.headers ?? []
  const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value
  const from = parseFrom(get('From') ?? '')
  const dateStr = formatDate(message.internalDate)
  const body = open ? extractBody(message.payload) : null
  const decodedSnippet = message.snippet ? decodeHtmlEntities(message.snippet) : ''

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/20 transition-colors"
        aria-expanded={open}
      >
        <span className="text-xs font-medium text-foreground truncate">
          {from.display}
        </span>
        {!open && decodedSnippet && (
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            — {decodedSnippet}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-auto">
          {dateStr}
        </span>
      </button>
      {open && body && (
        // Same "white envelope" treatment as before — sender-supplied
        // inline styles assume a white background. Nested message body
        // gets its own light container.
        <div style={{ colorScheme: 'light' }}>
          {body.kind === 'html' ? (
            <div
              className="email-html"
              style={{
                background: '#ffffff',
                color: '#111111',
                padding: '16px',
                fontSize: '14px',
                lineHeight: 1.5,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
              // Sanitized via DOMPurify before render — see
              // sanitizeEmailHtml below.
              dangerouslySetInnerHTML={{ __html: body.value }}
            />
          ) : (
            <pre
              className="whitespace-pre-wrap break-words font-sans"
              style={{
                background: '#ffffff',
                color: '#111111',
                padding: '16px',
                fontSize: '14px',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {body.value}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function parseFrom(raw: string): { display: string; initial: string } {
  // "Name <email@x.com>" or just "email@x.com"
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(raw)
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, '').trim()
    const email = m[2]
    const display = name || email
    return { display, initial: (name[0] ?? email[0] ?? '?').toUpperCase() }
  }
  const display = raw || '(unknown)'
  return { display, initial: (display[0] ?? '?').toUpperCase() }
}

function formatDate(internalMs?: string): string {
  if (!internalMs) return ''
  const d = new Date(Number(internalMs))
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// "1–50 of 1,091" / "51–100 of 1,091" / "1051–1091 of 1,091".
//
// Caveats matching mail.google.com behavior:
//   - resultSizeEstimate is the server's *estimate* and can fluctuate
//     between page fetches by a few entries. We display whatever the
//     latest response said.
//   - When estimate is missing (very rare; happens when Gmail's index
//     is rebuilding), fall back to "X-Y" without the "of Z" suffix.
function formatPageRange(
  pageIndex: number,
  pageMessageCount: number,
  total: number | null,
): string {
  const start = pageIndex * PAGE_SIZE + 1
  const end = start + pageMessageCount - 1
  // U+2013 EN DASH matches Gmail's typography.
  const range = `${start.toLocaleString()}\u2013${end.toLocaleString()}`
  if (typeof total === 'number') {
    return `${range} of ${total.toLocaleString()}`
  }
  return range
}

// Decode the HTML entities Gmail puts in `snippet` and message-header
// values (`&#39;`, `&amp;`, `&quot;`, `&#x27;`, etc.). React renders
// strings literally, so without this users see the raw entity codes.
//
// We use the browser DOM as the decoder so every named entity is
// supported (`&hellip;`, `&mdash;`, `&copy;`, etc.) without us
// maintaining a table. SSR doesn't apply here — this page is
// client-only after hydration — so DOMParser is always available when
// this runs.
function decodeHtmlEntities(s: string): string {
  if (!s || (s.indexOf('&') === -1 && s.indexOf('\\u') === -1)) return s
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value
}

// ============================================================================
// Body extraction + sanitization
// ============================================================================
//
// Gmail returns multipart MIME under `payload.parts`. Walk the tree and
// pick the most renderable representation: prefer text/html so the user
// sees the email as the sender intended, fall back to text/plain, fall
// back to anything we can decode.
//
// Body data is base64URL-encoded by Gmail (replace - / _ with + /, then
// standard base64 decode).

function extractBody(
  part: GmailMessagePart | undefined,
): { kind: 'html' | 'text'; value: string } | null {
  if (!part) return null

  const html = findPartByMime(part, 'text/html')
  if (html) {
    const raw = decodeBodyData(html.body?.data)
    if (raw) return { kind: 'html', value: sanitizeEmailHtml(raw) }
  }

  const text = findPartByMime(part, 'text/plain')
  if (text) {
    const raw = decodeBodyData(text.body?.data)
    if (raw) return { kind: 'text', value: raw }
  }

  // Last resort — single-part message with body.data on the root.
  const fallback = decodeBodyData(part.body?.data)
  if (fallback) return { kind: 'text', value: fallback }

  return null
}

function findPartByMime(
  part: GmailMessagePart,
  mime: string,
): GmailMessagePart | null {
  if (part.mimeType?.toLowerCase() === mime) return part
  for (const child of part.parts ?? []) {
    const found = findPartByMime(child, mime)
    if (found) return found
  }
  return null
}

function decodeBodyData(data: string | undefined): string | null {
  if (!data) return null
  try {
    // base64URL → base64
    const std = data.replace(/-/g, '+').replace(/_/g, '/')
    const padded = std + '='.repeat((4 - (std.length % 4)) % 4)
    const binary = atob(padded)
    // UTF-8 decode
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return null
  }
}

// Sanitize email HTML with DOMPurify (allowlist-based, parses through a
// real DOM rather than regex over a string). Email bodies come from
// arbitrary senders via gmail.readonly, so they're treated as hostile.
//
// What we block — XSS attack surface only:
//   - <script>, <iframe>, <object>, <embed> — code execution
//   - <form> — cross-origin exfil if user clicks
//   - <base> — would rewrite every relative URL in the email
//   - <link>, <meta> — could rewrite document-level behavior
//   - on*= event handlers — XSS
//   - javascript: / vbscript: / data: URLs in href/src — XSS via DOMPurify defaults
//
// What we allow — visual fidelity for "reading my own inbox":
//   - <style>-as-attribute (`style="..."`) — inline CSS is how emails
//     render their layout/colors/fonts. Without this every email looks
//     like raw HTML.
//   - <img> — logos, banners, the visual content of marketing emails.
//     Comes with a privacy trade-off: senders can include 1x1 pixel
//     trackers that learn the user's IP + read-time. We mitigate
//     partly by setting referrerpolicy=no-referrer + loading=lazy via
//     a hook below, so the sender doesn't see referer headers and
//     images only load when scrolled into view. Real Gmail proxies
//     images through googleusercontent.com for fuller protection;
//     that's an SDK-level enhancement we haven't done yet.
//   - inline <a target="_blank" rel="noopener noreferrer nofollow">
//     forced via hook so any link in the email opens safely.
//
// We still strip <style> as a *tag* (block-level CSS rules) because
// a `<style>` block can target other elements on the page outside the
// email envelope (e.g. body, html). Inline `style="..."` only affects
// the element it's on, so it's safe.
function sanitizeEmailHtml(html: string): string {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
    if (node.nodeName === 'IMG') {
      // Reduce — but don't fully eliminate — the privacy leak from
      // tracking pixels. The image still loads (sender learns the
      // email was opened + sees the user's IP), but the Referer
      // header is suppressed and offscreen images don't fetch until
      // scrolled into view.
      node.setAttribute('referrerpolicy', 'no-referrer')
      node.setAttribute('loading', 'lazy')
      node.setAttribute('decoding', 'async')
      // Defensive — block crossorigin-credentialed image requests so
      // the browser never sends cookies to image hosts.
      node.removeAttribute('crossorigin')
    }
  })
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base',
    ],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  })
  DOMPurify.removeAllHooks()
  return clean
}
