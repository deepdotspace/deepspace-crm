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

  // ── fetch messages ──
  //
  // `google/gmail-inbox` is the combined list+hydrate endpoint added in
  // the SDK so apps don't have to N+1 in the browser. One client request →
  // one proxy rate-limit charge → server-side parallel hydrate against
  // Google → rich messages with headers + body parts in one response.
  // `format: 'full'` includes the body so we can render the message text.
  const fetchMessages = useCallback(async () => {
    setLoadingMessages(true)
    setError(null)
    try {
      const result = await integration.post('google/gmail-inbox', {
        maxResults: PAGE_SIZE,
        labelIds: ['INBOX'],
        format: 'full',
      })

      if (!result.success) {
        setError(result.error ?? 'Gmail request failed')
        return
      }

      const payload = ((result.data ?? result) as unknown) as InboxPayload
      if (payload?.requiresOAuth && typeof payload.authUrl === 'string') {
        const popup = window.open(payload.authUrl, 'google-auth', 'width=500,height=600')
        if (!popup) {
          window.location.href = payload.authUrl
          return
        }
        const interval = setInterval(() => {
          if (popup.closed) {
            clearInterval(interval)
            refreshStatus()
            void fetchMessages()
          }
        }, 500)
        return
      }

      setMessages(payload.messages ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingMessages(false)
    }
  }, [refreshStatus])

  // Auto-load once gmail.readonly is granted.
  useEffect(() => {
    if (status.gmailRead && messages === null && !loadingMessages) {
      void fetchMessages()
    }
  }, [status.gmailRead, messages, loadingMessages, fetchMessages])

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
                onClick={fetchMessages}
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
          <Button onClick={fetchMessages} disabled={loadingMessages} className="gap-2">
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

      {/* Search */}
      {status.gmailRead && (
        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search inbox…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
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
          <div className="text-sm text-foreground truncate mt-0.5">{subject}</div>
          {!open && message.snippet && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{message.snippet}</p>
          )}
        </button>

        {open && body && (
          <div className="mt-3 rounded-md border border-border bg-background/40 p-3 text-sm">
            {body.kind === 'html' ? (
              <div
                className="email-html prose prose-sm max-w-none break-words"
                // We sanitize before render. The HTML payload comes from
                // Google but originated from arbitrary senders, so it must
                // be treated as untrusted.
                dangerouslySetInnerHTML={{ __html: body.value }}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
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

function filterMessages(messages: GmailMessage[], q: string): GmailMessage[] {
  if (!q.trim()) return messages
  const needle = q.toLowerCase()
  return messages.filter((m) => {
    const headers = m.payload?.headers ?? []
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? ''
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? ''
    return (
      from.toLowerCase().includes(needle) ||
      subject.toLowerCase().includes(needle) ||
      (m.snippet ?? '').toLowerCase().includes(needle)
    )
  })
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
