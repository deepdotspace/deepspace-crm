/**
 * EmailListWidget — read-only Gmail list with sane defaults.
 *
 * Used on Contact detail, Deal detail, Dashboard recent-emails, and
 * any other surface that wants "show recent emails matching this
 * query." All four CRM Gmail features ride on this single component
 * so the look + OAuth-recovery behavior is consistent.
 *
 * Renders thumbnail rows only (sender, subject, date, snippet). Each
 * row links out to the Email tab with the message id, where the
 * thread view lives. We deliberately do NOT inline-render bodies
 * here to keep the widget compact.
 */

import { Link } from 'react-router-dom'
import { Inbox, Mail, ExternalLink } from 'lucide-react'
import { useGmail, type GmailQuery, type GmailMessage } from '../platform/useGmail'

interface EmailListWidgetProps {
  /** Gmail query — see useGmail / Gmail search syntax. */
  query: GmailQuery
  /** Heading shown above the list. Hidden if omitted. */
  heading?: string
  /** Empty-state copy when no results. */
  emptyText?: string
  /** Skip render entirely (useful when caller has nothing to query for). */
  skip?: boolean
  /** Compact (smaller rows, hide snippet) vs default. */
  compact?: boolean
  /** Optional click handler on a row, otherwise opens in Gmail. */
  onMessageClick?: (m: GmailMessage) => void
}

export function EmailListWidget({
  query,
  heading,
  emptyText = 'No emails match.',
  skip = false,
  compact = false,
  onMessageClick,
}: EmailListWidgetProps) {
  const { messages, loading, error, oauthAuthUrl } = useGmail(query, !skip)

  if (skip) return null

  if (oauthAuthUrl) {
    return (
      <Section heading={heading}>
        <ConnectGmailPrompt authUrl={oauthAuthUrl} />
      </Section>
    )
  }

  if (loading && messages.length === 0) {
    return (
      <Section heading={heading}>
        <div className="text-xs text-muted-foreground py-3">Loading…</div>
      </Section>
    )
  }

  if (error) {
    return (
      <Section heading={heading}>
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      </Section>
    )
  }

  if (messages.length === 0) {
    return (
      <Section heading={heading}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <Inbox className="w-3.5 h-3.5" />
          {emptyText}
        </div>
      </Section>
    )
  }

  return (
    <Section heading={heading}>
      <div className="divide-y divide-border/50 rounded-lg border border-border bg-card overflow-hidden">
        {messages.map((m) => (
          <EmailRow key={m.id} message={m} compact={compact} onClick={onMessageClick} />
        ))}
      </div>
    </Section>
  )
}

function Section({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <div>
      {heading && (
        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Mail className="w-3 h-3" />
          {heading}
        </div>
      )}
      {children}
    </div>
  )
}

function EmailRow({
  message,
  compact,
  onClick,
}: {
  message: GmailMessage
  compact: boolean
  onClick?: (m: GmailMessage) => void
}) {
  const headers = message.payload?.headers ?? []
  const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value
  const fromRaw = get('From') ?? ''
  const subjectRaw = get('Subject') ?? '(no subject)'
  const from = parseFrom(fromRaw)
  const dateStr = formatDate(message.internalDate)
  const isUnread = message.labelIds?.includes('UNREAD') ?? false

  const threadUrl = `https://mail.google.com/mail/u/0/#inbox/${message.threadId ?? message.id}`
  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.preventDefault()
        onClick(message)
      }
    : undefined

  return (
    <a
      href={threadUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`flex items-start gap-2.5 px-3 hover:bg-secondary/10 transition-colors ${compact ? 'py-2' : 'py-2.5'}`}
    >
      <div
        className={`w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium text-primary`}
      >
        {from.initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm truncate ${isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'}`}
          >
            {decodeEntities(from.display)}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-auto">{dateStr}</span>
        </div>
        <div className={`text-xs truncate mt-0.5 ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
          {decodeEntities(subjectRaw)}
        </div>
        {!compact && message.snippet && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {decodeEntities(message.snippet)}
          </p>
        )}
      </div>
      <ExternalLink className="w-3 h-3 text-muted-foreground/40 mt-1.5 flex-shrink-0" />
    </a>
  )
}

function ConnectGmailPrompt({ authUrl }: { authUrl: string }) {
  return (
    <Link
      to="/email"
      className="block rounded-lg border border-dashed border-border bg-card/50 p-3 text-xs text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
      title={authUrl}
    >
      <span className="font-medium text-foreground">Gmail not connected.</span>{' '}
      Open the Email tab to grant read-only Gmail access.
    </Link>
  )
}

function parseFrom(raw: string): { display: string; initial: string } {
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

function decodeEntities(s: string): string {
  if (!s || s.indexOf('&') === -1) return s
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value
}
