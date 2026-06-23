/**
 * UpcomingMeetingsWidget — read-only list of upcoming Google Calendar meetings
 * with a contact (or any of a deal's contacts), with reschedule / cancel
 * actions.
 *
 * Mirrors EmailListWidget: same card look + OAuth-recovery behavior. Reads via
 * `useUpcomingMeetings` (calendar.events scope). Cancel rides
 * `google/calendar-delete-event`; reschedule is delegated to the parent (which
 * opens ScheduleMeetingDialog in edit mode) so the create/edit form lives in
 * one place.
 */

import { useCallback, useState } from 'react'
import { CalendarClock, Video, ExternalLink, X, Pencil, Users } from 'lucide-react'
import {
  useUpcomingMeetings, useCalendarWrite, eventStartMs, type CalendarEvent,
} from '../platform/useCalendar'
import { awaitConsent } from '../platform/googleConsent'
import { ConfirmModal } from './ui'

interface UpcomingMeetingsWidgetProps {
  /** Contact email(s) to find meetings with. */
  emails: string[]
  heading?: string
  emptyText?: string
  skip?: boolean
  /** Bumped by the parent after a create/reschedule to force a refetch. */
  refreshKey?: number
  /** Open the reschedule dialog for this event (parent owns the dialog). */
  onReschedule?: (event: CalendarEvent) => void
}

export function UpcomingMeetingsWidget({
  emails,
  heading,
  emptyText = 'No upcoming meetings.',
  skip = false,
  refreshKey = 0,
  onReschedule,
}: UpcomingMeetingsWidgetProps) {
  const cleanEmails = emails.map((e) => e.trim()).filter(Boolean)
  const { events, loading, error, oauthAuthUrl, refetch } = useUpcomingMeetings(
    cleanEmails, !skip, refreshKey,
  )
  const { deleteEvent } = useCalendarWrite()
  const [cancelTarget, setCancelTarget] = useState<CalendarEvent | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [removed, setRemoved] = useState<Record<string, boolean>>({})

  const confirmCancel = useCallback(async () => {
    const e = cancelTarget
    if (!e) return
    setCancelling(true)
    const res = await deleteEvent(e.id)
    setCancelling(false)
    if (res.success) setRemoved((r) => ({ ...r, [e.id]: true }))
    setCancelTarget(null)
  }, [cancelTarget, deleteEvent])

  if (skip) return null

  if (oauthAuthUrl) {
    return (
      <Section heading={heading}>
        <ConnectCalendarPrompt authUrl={oauthAuthUrl} onConnected={refetch} />
      </Section>
    )
  }

  if (loading && events.length === 0) {
    return (
      <Section heading={heading}>
        <div className="text-xs text-muted-foreground py-3">Loading…</div>
      </Section>
    )
  }

  if (error) {
    return (
      <Section heading={heading}>
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      </Section>
    )
  }

  const visible = events.filter((e) => !removed[e.id])

  if (visible.length === 0) {
    return (
      <Section heading={heading}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <CalendarClock className="w-3.5 h-3.5" />
          {emptyText}
        </div>
      </Section>
    )
  }

  return (
    <Section heading={heading}>
      <div className="divide-y divide-border/50 rounded-lg border border-border bg-card overflow-hidden">
        {visible.map((e) => (
          <MeetingRow
            key={e.id}
            event={e}
            busy={cancelTarget?.id === e.id}
            onReschedule={onReschedule ? () => onReschedule(e) : undefined}
            onCancel={() => setCancelTarget(e)}
          />
        ))}
      </div>

      <ConfirmModal
        open={!!cancelTarget}
        onClose={() => { if (!cancelling) setCancelTarget(null) }}
        onConfirm={confirmCancel}
        title="Cancel this meeting?"
        description={
          cancelTarget
            ? `"${cancelTarget.summary || 'This meeting'}" will be removed from your calendar and attendees will be notified.`
            : undefined
        }
        confirmText="Cancel meeting"
        cancelText="Keep it"
        variant="destructive"
        loading={cancelling}
      />
    </Section>
  )
}

function Section({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <div>
      {heading && (
        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <CalendarClock className="w-3 h-3" />
          {heading}
        </div>
      )}
      {children}
    </div>
  )
}

function MeetingRow({
  event,
  busy,
  onReschedule,
  onCancel,
}: {
  event: CalendarEvent
  busy: boolean
  onReschedule?: () => void
  onCancel: () => void
}) {
  const when = formatWhen(event)
  const attendeeCount = (event.attendees ?? []).length
  const link = event.htmlLink

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-secondary/10 transition-colors">
      <div className="w-9 flex-shrink-0 flex flex-col items-center pt-0.5">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">{when.month}</span>
        <span className="text-base font-semibold leading-none text-foreground">{when.day}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {event.summary || '(no title)'}
          </span>
          {event.hangoutLink && (
            <a
              href={event.hangoutLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Join Google Meet"
              className="flex-shrink-0 text-primary hover:text-primary/80"
              onClick={(ev) => ev.stopPropagation()}
            >
              <Video className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{when.time}</div>
        {attendeeCount > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <Users className="w-3 h-3" />
            {attendeeCount} {attendeeCount === 1 ? 'guest' : 'guests'}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {onReschedule && (
          <button
            type="button"
            onClick={onReschedule}
            disabled={busy}
            title="Reschedule"
            className="rounded p-1 text-muted-foreground hover:bg-secondary/30 hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          title="Cancel meeting"
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Calendar"
            className="rounded p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  )
}

function ConnectCalendarPrompt({ authUrl, onConnected }: { authUrl: string; onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false)
  return (
    <button
      type="button"
      disabled={connecting}
      onClick={async () => {
        setConnecting(true)
        await awaitConsent(authUrl)
        setConnecting(false)
        onConnected()
      }}
      className="block w-full text-left rounded-lg border border-dashed border-border bg-card/50 p-3 text-xs text-muted-foreground hover:bg-card hover:text-foreground transition-colors disabled:opacity-60"
    >
      <span className="font-medium text-foreground">Google Calendar not connected.</span>{' '}
      {connecting ? 'Waiting for Google…' : 'Click to grant calendar access and see meetings here.'}
    </button>
  )
}

function formatWhen(e: CalendarEvent): { month: string; day: string; time: string } {
  const ms = eventStartMs(e)
  const d = new Date(ms)
  const allDay = !!e.start?.date && !e.start?.dateTime
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  const day = String(d.getDate())
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const datePart = d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  if (allDay) return { month, day, time: `${datePart} · All day` }
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return { month, day, time: `${datePart} · ${timePart}` }
}
