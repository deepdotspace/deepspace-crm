/**
 * Email tab — read-only Gmail inbox via gmail.readonly.
 *
 * The previous implementation sent mail via the @app.space email handle
 * (`email/send` integration, owner-billed). That product is unrelated
 * to Google Gmail; this tab is now a self-contained Gmail reader for
 * the signed-in user, exercising the per-user Google OAuth flow with
 * the **read-only** scope only.
 *
 * Why read-only only:
 *   The OAuth client (`deepspace-479511`) is verified by Google for
 *   `gmail.readonly`. Anything that touches `gmail.modify` (send,
 *   archive, label, mark-read) bumps the scope and changes the
 *   verification chain. To keep CASA Tier 2 scope intact this tab does
 *   NOT call gmail-send, gmail-trash, gmail-modify, etc.
 *
 * Flow:
 *   1. On mount: GET /api/integrations/status to see if google.gmailRead
 *      is true. If yes, fetch messages. If no, show "Connect Gmail".
 *   2. Connect calls google/gmail-list with no token → api-worker
 *      returns `requiresOAuth + authUrl` → popup → user grants
 *      `gmail.readonly` → status refreshes → messages load.
 *   3. Disconnect revokes via the platform endpoint.
 *
 * What's intentionally absent:
 *   - No Compose / Reply / Forward (would require gmail.send / modify).
 *   - No "mark as read" or label changes (would require gmail.modify).
 *   - No archive / trash / move (would require gmail.modify).
 *   The tab links out to mail.google.com for any action that needs
 *   write access.
 */

import { useEffect, useState, useCallback } from 'react'
import { integration, useAuth, getAuthToken } from 'deepspace'
import {
  Mail, ExternalLink, RefreshCw, Plug, Unplug, Search, Inbox,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '../components/ui'

interface GoogleStatus {
  connected: boolean
  gmailRead: boolean
  gmail: boolean
}
const EMPTY_STATUS: GoogleStatus = { connected: false, gmailRead: false, gmail: false }

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
  const [search, setSearch] = useState('')
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
        const params: Record<string, unknown> = {
          maxResults: PAGE_SIZE,
          labelIds: ['INBOX'],
          format: 'full',
          // Piggyback users.labels.get('INBOX') on every page fetch so
          // the "X-Y of Z" indicator stays accurate. The server-side
          // round-trip cost is one parallel call to Google.
          includeLabelTotal: true,
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
    [refreshStatus],
  )

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

  // Auto-load once gmail.readonly is granted.
  useEffect(() => {
    if (status.gmailRead && messages === null && !loadingMessages) {
      resetToFirstPage()
    }
  }, [status.gmailRead, messages, loadingMessages, resetToFirstPage])

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

  // ── render ──
  if (!isSignedIn) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Sign in to view your Gmail inbox.
      </div>
    )
  }

  const filtered = messages ? filterMessages(messages, search) : null

  return (
    <div data-testid="email-page" className="p-6 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Email</h1>
          <p className="text-sm text-muted-foreground">
            Read-only Gmail · status:{' '}
            <span
              className={
                status.gmailRead
                  ? 'font-medium text-green-600'
                  : 'font-medium text-muted-foreground'
              }
            >
              {statusLoading ? 'checking…' : status.gmailRead ? 'connected' : 'not connected'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {status.gmailRead && (
            <>
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

      {/* Read-only notice */}
      <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-muted-foreground">
        <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Read-only — this tab uses the <code>gmail.readonly</code> scope.
          Compose, reply, archive, and labels open in{' '}
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
            Grant read-only access to your Gmail inbox. We never send, modify,
            or delete messages — read-only means read-only.
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
          and arrows pinned to the right of the same row (mirroring the
          mail.google.com layout). Pagination is hidden during in-memory
          search because the search filter only sees the loaded page;
          paging while filtered would silently change the corpus. */}
      {status.gmailRead && (
        <div className="flex items-center gap-3 mb-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search inbox…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
            />
          </div>
          {messages !== null && messages.length > 0 && !search && (
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
                {search ? 'No messages match your search.' : 'Inbox is empty.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((m) => (
                <MessageRow key={m.id} message={m} />
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
    </div>
  )
}

function MessageRow({ message }: { message: GmailMessage }) {
  const [open, setOpen] = useState(false)
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
  const body = open ? extractBody(message.payload) : null

  return (
    <div className="flex items-start gap-3 p-4 hover:bg-secondary/10 transition-colors">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium text-primary">
        {from.initial}
      </div>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="block w-full text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {from.display}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">{dateStr}</span>
          </div>
          <div className="text-sm text-foreground truncate mt-0.5">
            {decodeHtmlEntities(subject)}
          </div>
          {!open && decodedSnippet && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{decodedSnippet}</p>
          )}
        </button>

        {open && body && (
          // Render in a "white envelope" container so sender-supplied
          // inline colors (which assume a white inbox background, like
          // mail.google.com) display correctly even in dark mode. The
          // `color: #111` baseline gives unstyled text a readable
          // default; senders that override it (most do, with their own
          // brand colors) get exactly what they intended.
          <div
            className="mt-3 rounded-md border border-border overflow-hidden"
            style={{ colorScheme: 'light' }}
          >
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
                // We sanitize before render. The HTML payload comes from
                // Google but originated from arbitrary senders, so it
                // must be treated as untrusted.
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

        {open && (
          <a
            href={threadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open in Gmail
          </a>
        )}
      </div>
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

function filterMessages(messages: GmailMessage[], q: string): GmailMessage[] {
  if (!q.trim()) return messages
  const needle = q.toLowerCase()
  return messages.filter((m) => {
    const headers = m.payload?.headers ?? []
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? ''
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? ''
    // Decode entities so a search for "don't" matches a snippet that
    // contains "don&#39;t".
    return (
      decodeHtmlEntities(from).toLowerCase().includes(needle) ||
      decodeHtmlEntities(subject).toLowerCase().includes(needle) ||
      decodeHtmlEntities(m.snippet ?? '').toLowerCase().includes(needle)
    )
  })
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

// Strip the obvious XSS vectors. This is intentionally a denylist of the
// most common dangerous tags / attrs — *not* a full HTML sanitizer. Email
// bodies coming through gmail.readonly originate from arbitrary senders,
// so any inline JS / event handlers / object embeds are treated as hostile.
// Real email clients use a full sanitizer (DOMPurify); add it if this tab
// graduates to a primary inbox UX.
function sanitizeEmailHtml(html: string): string {
  return (
    html
      // Drop <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>.
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
      // Strip on*=... event handlers from any tag.
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
      // Strip javascript: URLs in href / src.
      .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'")
  )
}
