/**
 * EmailListWidget — Gmail list with optional mailbox write actions.
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
 *
 * With `enableActions`, each row carries the Gmail write toolbar
 * (gmail.modify): star/unstar, mark read/unread, archive, trash.
 * The buttons are ALWAYS visible — hover-revealed actions proved
 * undiscoverable. Opt-in so read-only surfaces (dashboard) stay
 * link-only; enabled on contact/deal detail where acting on a
 * contact's mail is a core CRM workflow.
 */

import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Mail, MailOpen, ExternalLink, Star, Archive, Trash2 } from 'lucide-react'
import { useGmail, type GmailQuery, type GmailMessage } from '../platform/useGmail'
import { useGmailWrite, type GmailWriteResult } from '../platform/useGmailWrite'
import { useToast } from './ui'

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
  /**
   * Show the Gmail write toolbar on each row (gmail.modify): star/unstar,
   * mark read/unread, archive, and trash — each writes to the user's real
   * mailbox and confirms via toast.
   */
  enableActions?: boolean
}

export function EmailListWidget({
  query,
  heading,
  emptyText = 'No emails match.',
  skip = false,
  compact = false,
  onMessageClick,
  enableActions = false,
}: EmailListWidgetProps) {
  const { messages, loading, error, oauthAuthUrl } = useGmail(query, !skip)
  const { star, unstar, markRead, markUnread, archive, trash } = useGmailWrite()
  const toast = useToast()
  // Optimistic per-message state layered over the fetched labelIds (star /
  // unread), rows hidden after archive/trash, and an in-flight set that
  // disables a row's toolbar mid-request. All revert on failure.
  const [starOverride, setStarOverride] = useState<Record<string, boolean>>({})
  const [unreadOverride, setUnreadOverride] = useState<Record<string, boolean>>({})
  const [removed, setRemoved] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // Shared action wrapper: optimistic apply → await the write → toast the
  // real mailbox mutation, or revert + explain. `cancelled` means the user
  // dismissed the consent popup, which isn't an error worth a toast.
  const runAction = useCallback(
    async (
      id: string,
      apply: () => void,
      revert: () => void,
      write: () => Promise<GmailWriteResult>,
      okToast: string,
      failToast: string,
    ) => {
      setBusy((b) => ({ ...b, [id]: true }))
      apply()
      const res = await write()
      if (res.success) {
        toast.success(okToast)
      } else {
        // A silent revert looks like the click did nothing — surface why.
        revert()
        if (!res.cancelled) toast.error(failToast, res.error ?? 'Gmail write failed')
      }
      setBusy((b) => ({ ...b, [id]: false }))
    },
    [toast],
  )

  const toggleStar = useCallback(
    (m: GmailMessage, currentlyStarred: boolean) => {
      const next = !currentlyStarred
      return runAction(
        m.id,
        () => setStarOverride((o) => ({ ...o, [m.id]: next })),
        () => setStarOverride((o) => ({ ...o, [m.id]: currentlyStarred })),
        () => (next ? star(m.id) : unstar(m.id)),
        next ? 'Starred in Gmail' : 'Star removed in Gmail',
        next ? "Couldn't star email" : "Couldn't unstar email",
      )
    },
    [runAction, star, unstar],
  )

  const toggleRead = useCallback(
    (m: GmailMessage, currentlyUnread: boolean) => {
      return runAction(
        m.id,
        () => setUnreadOverride((o) => ({ ...o, [m.id]: !currentlyUnread })),
        () => setUnreadOverride((o) => ({ ...o, [m.id]: currentlyUnread })),
        () => (currentlyUnread ? markRead(m.id) : markUnread(m.id)),
        currentlyUnread ? 'Marked as read in Gmail' : 'Marked as unread in Gmail',
        "Couldn't update read state",
      )
    },
    [runAction, markRead, markUnread],
  )

  const archiveMessage = useCallback(
    (m: GmailMessage) => {
      return runAction(
        m.id,
        () => setRemoved((r) => ({ ...r, [m.id]: true })),
        () => setRemoved((r) => ({ ...r, [m.id]: false })),
        () => archive(m.id),
        'Archived — removed from your Gmail inbox',
        "Couldn't archive email",
      )
    },
    [runAction, archive],
  )

  const trashMessage = useCallback(
    (m: GmailMessage) => {
      return runAction(
        m.id,
        () => setRemoved((r) => ({ ...r, [m.id]: true })),
        () => setRemoved((r) => ({ ...r, [m.id]: false })),
        () => trash(m.id),
        'Moved to Gmail Trash',
        "Couldn't trash email",
      )
    },
    [runAction, trash],
  )

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

  const visible = messages.filter((m) => !removed[m.id])

  return (
    <Section heading={heading} actionsHint={enableActions}>
      <div className="divide-y divide-border/50 rounded-lg border border-border bg-card overflow-hidden">
        {visible.map((m) => {
          const starred = starOverride[m.id] ?? (m.labelIds?.includes('STARRED') ?? false)
          const unread = unreadOverride[m.id] ?? (m.labelIds?.includes('UNREAD') ?? false)
          return (
            <EmailRow
              key={m.id}
              message={m}
              compact={compact}
              onClick={onMessageClick}
              enableActions={enableActions}
              starred={starred}
              unread={unread}
              busy={!!busy[m.id]}
              onToggleStar={() => toggleStar(m, starred)}
              onToggleRead={() => toggleRead(m, unread)}
              onArchive={() => archiveMessage(m)}
              onTrash={() => trashMessage(m)}
            />
          )
        })}
        {visible.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-3">
            <Inbox className="w-3.5 h-3.5" />
            {emptyText}
          </div>
        )}
      </div>
    </Section>
  )
}

function Section({
  heading,
  actionsHint = false,
  children,
}: {
  heading?: string
  /** Note under the heading that row actions write to the user's Gmail. */
  actionsHint?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      {(heading || actionsHint) && (
        <div className="mb-2">
          {heading && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Mail className="w-3 h-3" />
              {heading}
            </div>
          )}
          {actionsHint && (
            <p className={`text-[11px] text-muted-foreground ${heading ? 'mt-1' : ''}`}>
              Live from Gmail — star, read/unread, archive, and trash act on your real mailbox.
            </p>
          )}
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
  enableActions = false,
  starred = false,
  unread = false,
  busy = false,
  onToggleStar,
  onToggleRead,
  onArchive,
  onTrash,
}: {
  message: GmailMessage
  compact: boolean
  onClick?: (m: GmailMessage) => void
  enableActions?: boolean
  starred?: boolean
  unread?: boolean
  busy?: boolean
  onToggleStar?: () => void
  onToggleRead?: () => void
  onArchive?: () => void
  onTrash?: () => void
}) {
  const headers = message.payload?.headers ?? []
  const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value
  const fromRaw = get('From') ?? ''
  const subjectRaw = get('Subject') ?? '(no subject)'
  const from = parseFrom(fromRaw)
  const dateStr = formatDate(message.internalDate)
  const isUnread = unread

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
      {enableActions && (
        // Gmail write toolbar (gmail.modify) — always visible, never
        // hover-revealed. Each button stops propagation so acting on a
        // message never fires the row's outbound link.
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
          <WidgetAction
            label={starred ? 'Unstar (removes the star in Gmail)' : 'Star this email in Gmail'}
            pressed={starred}
            disabled={busy}
            onClick={onToggleStar}
          >
            <Star
              className={`w-4 h-4 ${starred ? 'fill-yellow-400 text-yellow-400' : ''}`}
            />
          </WidgetAction>
          <WidgetAction
            label={isUnread ? 'Mark as read in Gmail' : 'Mark as unread in Gmail'}
            disabled={busy}
            onClick={onToggleRead}
          >
            {isUnread ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
          </WidgetAction>
          <WidgetAction
            label="Archive (removes from your Gmail inbox)"
            disabled={busy}
            onClick={onArchive}
          >
            <Archive className="w-4 h-4" />
          </WidgetAction>
          <WidgetAction
            label="Move to Gmail Trash"
            disabled={busy}
            onClick={onTrash}
          >
            <Trash2 className="w-4 h-4" />
          </WidgetAction>
        </div>
      )}
      <ExternalLink className="w-3 h-3 text-muted-foreground/40 mt-1.5 flex-shrink-0" />
    </a>
  )
}

// Compact icon button for the widget's Gmail write toolbar. Lives inside an
// anchor row, so it must preventDefault as well as stopPropagation.
function WidgetAction({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick?.()
      }}
      className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
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
