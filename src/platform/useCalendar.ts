/**
 * useCalendar — Google Calendar surface for the CRM (calendar.events scope).
 *
 * Lets a rep schedule / list / reschedule / cancel meetings with a contact
 * directly from the contact or deal detail view. Reads ride
 * `google/calendar-list-events`; writes ride create/update/delete and go
 * through `withGoogleConsent`, so the first calendar action a user performs
 * transparently prompts for the calendar.events grant (Google incremental
 * auth) and replays once — no popup code at the call site.
 *
 * Companion to useGmail / useGmailWrite; the consent/replay helper is shared
 * (see ./googleConsent).
 *
 * SECURITY: write methods are only ever invoked from explicit user gestures
 * (Schedule, Reschedule, Cancel). They are intentionally NOT exposed to the AI
 * agent surface (src/ai/tools.ts only wraps read-only BUILT_IN_TOOLS).
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { integration } from 'deepspace'
import { withGoogleConsent, type GoogleWriteResult } from './googleConsent'

export interface CalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email?: string; responseStatus?: string; organizer?: boolean; self?: boolean }>
  organizer?: { email?: string; self?: boolean }
  hangoutLink?: string
  htmlLink?: string
  status?: string
}

/** Parameters for creating or rescheduling a meeting. */
export interface MeetingParams {
  title: string
  /**
   * Start as an absolute ISO-8601 timestamp (UTC `…Z` or with an offset).
   * IMPORTANT: do NOT pass a naive local "YYYY-MM-DDTHH:mm" string — the
   * api-worker runs in UTC and `new Date(naive).toISOString()` would interpret
   * the wall-clock time as UTC, shifting the meeting by the user's offset.
   * Convert local picker values via `new Date(localStr).toISOString()` first.
   */
  start: string
  /** End as an absolute ISO-8601 timestamp (see `start`). */
  end?: string
  description?: string
  location?: string
  /** Attendee emails — the contact is invited (Google emails them the invite). */
  attendees?: string[]
  addVideoConferencing?: boolean
  calendarId?: string
}

interface ListPayload {
  requiresOAuth?: boolean
  authUrl?: string
  events?: CalendarEvent[]
  items?: CalendarEvent[]
  error?: string
}

interface FetchResult {
  events: CalendarEvent[]
  /** When the api-worker returned `requiresOAuth`, the consent URL. */
  oauthAuthUrl: string | null
}

const EMPTY_RESULT: FetchResult = { events: [], oauthAuthUrl: null }

/** Start of an event regardless of all-day vs timed. */
export function eventStartMs(e: CalendarEvent): number {
  const raw = e.start?.dateTime ?? e.start?.date
  if (!raw) return 0
  const ms = new Date(raw).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Fetch upcoming meetings that involve `email` (the contact). Calendar's `q`
 * does a fuzzy full-text match (it includes attendee/organizer emails), so we
 * additionally filter client-side to events where the email is actually an
 * attendee or the organizer — keeping the list precisely "meetings with this
 * contact" rather than anything that merely mentions the address.
 */
export async function fetchUpcomingMeetings(
  emails: string[],
  opts: { maxResults?: number; calendarId?: string } = {},
): Promise<FetchResult> {
  const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (wanted.length === 0) return EMPTY_RESULT

  const params: Record<string, unknown> = {
    calendarId: opts.calendarId ?? 'primary',
    timeMin: new Date().toISOString(),
    maxResults: opts.maxResults ?? 50,
    // A single email narrows server-side; for multiple (a deal's contacts) we
    // fetch the upcoming window and filter locally.
    ...(wanted.length === 1 ? { q: wanted[0] } : {}),
  }

  const res = await integration.post('google/calendar-list-events', params)
  if (!res.success) throw new Error(res.error ?? 'Calendar request failed')

  const payload = ((res.data ?? res) as unknown) as ListPayload
  if (payload?.requiresOAuth && typeof payload.authUrl === 'string') {
    return { ...EMPTY_RESULT, oauthAuthUrl: payload.authUrl }
  }

  const all = payload.events ?? payload.items ?? []
  const matches = (e: CalendarEvent) => {
    const involved = [
      e.organizer?.email,
      ...(e.attendees ?? []).map((a) => a.email),
    ]
      .filter(Boolean)
      .map((x) => x!.toLowerCase())
    return wanted.some((w) => involved.includes(w))
  }
  const events = all
    .filter((e) => e.status !== 'cancelled')
    .filter(matches)
    .sort((a, b) => eventStartMs(a) - eventStartMs(b))

  return { events, oauthAuthUrl: null }
}

/**
 * React hook: upcoming meetings with the given contact email(s). Re-fetches
 * when the emails change or `refreshKey` is bumped.
 */
export function useUpcomingMeetings(
  emails: string[],
  enabled = true,
  refreshKey = 0,
): {
  events: CalendarEvent[]
  loading: boolean
  error: string | null
  oauthAuthUrl: string | null
  refetch: () => void
} {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oauthAuthUrl, setOauthAuthUrl] = useState<string | null>(null)
  const [bump, setBump] = useState(0)

  const emailsKey = emails.map((e) => e.trim().toLowerCase()).filter(Boolean).join(',')
  const lastReqId = useRef(0)

  useEffect(() => {
    if (!enabled || !emailsKey) return
    const reqId = ++lastReqId.current
    setLoading(true)
    setError(null)
    fetchUpcomingMeetings(emailsKey.split(','))
      .then((res) => {
        if (reqId !== lastReqId.current) return
        setEvents(res.events)
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
  }, [enabled, emailsKey, bump, refreshKey])

  const refetch = useCallback(() => setBump((n) => n + 1), [])

  return { events, loading, error, oauthAuthUrl, refetch }
}

/**
 * Calendar write surface — create / reschedule / cancel. Each method returns a
 * {@link GoogleWriteResult}; on create, `result.data` is the created Google
 * event (read `.id` to link it to a CRM activity).
 */
export function useCalendarWrite() {
  const [isMutating, setIsMutating] = useState(false)

  const run = useCallback(
    async (endpoint: string, body: Record<string, unknown>): Promise<GoogleWriteResult> => {
      setIsMutating(true)
      try {
        return await withGoogleConsent(endpoint, body)
      } finally {
        setIsMutating(false)
      }
    },
    [],
  )

  const createEvent = useCallback(
    (params: MeetingParams): Promise<GoogleWriteResult> => {
      const body: Record<string, unknown> = {
        calendarId: params.calendarId ?? 'primary',
        title: params.title,
        start: params.start,
        // sendUpdates: 'all' so the contact actually receives the invitation
        // email (events.insert does NOT notify attendees by default).
        sendUpdates: 'all',
      }
      if (params.end) body.end = params.end
      if (params.description) body.description = params.description
      if (params.location) body.location = params.location
      if (params.attendees?.length) body.attendees = params.attendees
      if (params.addVideoConferencing) body.addVideoConferencing = true
      return run('google/calendar-create-event', body)
    },
    [run],
  )

  const updateEvent = useCallback(
    (eventId: string, params: Partial<MeetingParams>): Promise<GoogleWriteResult> => {
      const body: Record<string, unknown> = {
        calendarId: params.calendarId ?? 'primary',
        eventId,
      }
      if (params.title) body.title = params.title
      if (params.start) body.start = params.start
      if (params.end) body.end = params.end
      if (params.description !== undefined) body.description = params.description
      if (params.location !== undefined) body.location = params.location
      if (params.attendees?.length) body.attendees = params.attendees
      // Server defaults sendUpdates to 'all' so attendees hear about the change.
      return run('google/calendar-update-event', body)
    },
    [run],
  )

  const deleteEvent = useCallback(
    (eventId: string, calendarId = 'primary'): Promise<GoogleWriteResult> =>
      // sendUpdates is opt-in on the server (existing callers must not start
      // emailing attendees), but a CRM meeting cancellation is exactly the
      // case where the invitee must hear about it — opt in explicitly.
      run('google/calendar-delete-event', { eventId, calendarId, sendUpdates: 'all' }),
    [run],
  )

  return { createEvent, updateEvent, deleteEvent, isMutating }
}
