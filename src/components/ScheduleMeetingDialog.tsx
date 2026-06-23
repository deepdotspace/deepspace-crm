/**
 * ScheduleMeetingDialog — CRM meeting scheduler / rescheduler.
 *
 * Creates (or reschedules) a Google Calendar event on the signed-in user's
 * primary calendar via the SDK `google/calendar-*` endpoints (calendar.events
 * scope), invites the contact as an attendee (Google emails them the invite),
 * optionally attaches a Google Meet link, and auto-logs the meeting as a CRM
 * `activity` linked to the contact / deal (with the Calendar event id stored on
 * `activity.eventId`). If the user hasn't yet granted calendar access, the
 * first action transparently opens the Google consent popup (handled inside
 * useCalendarWrite) and replays.
 *
 * Pass `event` to reschedule an existing meeting instead of creating one.
 */

import { useState, useCallback, useEffect } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import { useCalendarWrite, type CalendarEvent } from '../platform/useCalendar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label, Textarea, Switch, DateTimePicker,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui'
import { CalendarPlus, Video, AlertCircle, Check } from 'lucide-react'

interface ScheduleMeetingDialogProps {
  open: boolean
  onClose: () => void
  /** Pre-fill the attendees with this contact email. */
  prefillAttendee?: string
  /** Contact name — used for the default meeting title. */
  contactName?: string
  /** Link the logged activity to these records. */
  contactId?: string
  companyId?: string
  dealId?: string
  /** When set, the dialog reschedules this event instead of creating one. */
  event?: CalendarEvent | null
  /** Called after a successful create/reschedule (e.g. to refresh the list). */
  onSaved?: () => void
}

const DURATIONS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '90 minutes', value: 90 },
  { label: '2 hours', value: 120 },
]

/** Format a Date as the DateTimePicker's local "YYYY-MM-DDTHH:mm" value. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Next top of the hour from now — a sensible default meeting start. */
function defaultStart(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toLocalInput(d)
}

function durationBetween(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 30
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  return DURATIONS.some((d) => d.value === mins) ? mins : 30
}

export function ScheduleMeetingDialog({
  open, onClose,
  prefillAttendee, contactName,
  contactId, companyId, dealId,
  event, onSaved,
}: ScheduleMeetingDialogProps) {
  const { addActivity, updateActivity, activities, userId } = useCrm()
  const { createEvent, updateEvent, isMutating } = useCalendarWrite()

  const isEdit = !!event

  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [duration, setDuration] = useState(30)
  const [attendees, setAttendees] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [addMeet, setAddMeet] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // (Re)initialize the form whenever the dialog opens or the target changes.
  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.summary ?? '')
      const s = event.start?.dateTime ?? event.start?.date
      setStart(s ? toLocalInput(new Date(s)) : defaultStart())
      setDuration(durationBetween(event.start?.dateTime, event.end?.dateTime))
      setAttendees((event.attendees ?? []).map((a) => a.email).filter(Boolean).join(', '))
      setLocation(event.location ?? '')
      setDescription(event.description ?? '')
      setAddMeet(!!event.hangoutLink)
    } else {
      setTitle(contactName ? `Meeting with ${contactName}` : 'Meeting')
      setStart(defaultStart())
      setDuration(30)
      setAttendees(prefillAttendee ?? '')
      setLocation('')
      setDescription('')
      setAddMeet(false)
    }
    setError(null)
    setSaved(false)
  }, [open, event, contactName, prefillAttendee])

  const parseEmails = useCallback((input: string): string[] => {
    return input
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  }, [])

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError('Please enter a meeting title.')
      return
    }
    if (!start) {
      setError('Please pick a date and time.')
      return
    }
    setError(null)

    const startDate = new Date(start)
    if (Number.isNaN(startDate.getTime())) {
      setError('That date / time is invalid.')
      return
    }
    const endIso = new Date(startDate.getTime() + duration * 60000).toISOString()
    const startIso = startDate.toISOString()
    const attendeeList = parseEmails(attendees)

    if (isEdit && event) {
      const result = await updateEvent(event.id, {
        title: title.trim(),
        start: startIso,
        end: endIso,
        description,
        location,
        attendees: attendeeList,
      })
      if (!result.success) {
        if (result.cancelled) return
        setError(result.error || 'Failed to reschedule the meeting.')
        return
      }
      // Keep the linked CRM activity's due time in sync with the new start.
      const linked = activities.find((a) => a.eventId === event.id)
      if (linked) {
        await updateActivity(linked.id, { title: `Meeting: ${title.trim()}`, dueAt: startIso })
      }
    } else {
      const result = await createEvent({
        title: title.trim(),
        start: startIso,
        end: endIso,
        description,
        location,
        attendees: attendeeList,
        addVideoConferencing: addMeet,
      })
      if (!result.success) {
        if (result.cancelled) return
        setError(result.error || 'Failed to schedule the meeting.')
        return
      }
      const created = (result.data ?? {}) as { id?: string }
      await addActivity({
        type: 'meeting',
        title: `Meeting: ${title.trim()}`,
        description: attendeeList.length
          ? `Scheduled with ${attendeeList.join(', ')}`
          : 'Scheduled meeting',
        contactId: contactId || null,
        companyId: companyId || null,
        dealId: dealId || null,
        eventId: created.id || null,
        dueAt: startIso,
        ownerId: userId ?? null,
      })
    }

    setSaved(true)
    onSaved?.()
    setTimeout(() => onClose(), 1500)
  }, [
    title, start, duration, attendees, location, description, addMeet,
    isEdit, event, createEvent, updateEvent, addActivity, updateActivity,
    activities, contactId, companyId, dealId, userId, onClose, onSaved, parseEmails,
  ])

  if (saved) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {isEdit ? 'Meeting rescheduled' : 'Meeting scheduled'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEdit ? 'Attendees notified · activity updated' : 'Invite sent · activity logged to CRM'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Reschedule Meeting' : 'Schedule Meeting'}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 mt-0.5">
            On
            <span className="inline-flex items-center rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-secondary-foreground">
              your Google Calendar
            </span>
            · attendees are emailed an invite
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Title */}
          <div>
            <Label className="text-xs">Title *</Label>
            <Input
              data-testid="meeting-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
              placeholder="Meeting title"
              className="mt-1"
            />
          </div>

          {/* When + duration */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label className="text-xs">When *</Label>
              <DateTimePicker
                value={start}
                onChange={(v) => { setStart(v); setError(null) }}
                minDate={new Date()}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Duration</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="mt-1 w-36" data-testid="meeting-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Attendees */}
          <div>
            <Label className="text-xs">Attendees</Label>
            <Input
              data-testid="meeting-attendees"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="contact@example.com, teammate@example.com"
              className="mt-1"
            />
          </div>

          {/* Location */}
          <div>
            <Label className="text-xs">Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Office, address, or call-in details (optional)"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda or notes (optional)"
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          {/* Google Meet — only on create (Google manages the link on existing events) */}
          {!isEdit && (
            <label className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 cursor-pointer">
              <span className="flex items-center gap-2 text-xs text-foreground">
                <Video className="w-3.5 h-3.5 text-primary" />
                Add Google Meet video conferencing
              </span>
              <Switch checked={addMeet} onCheckedChange={setAddMeet} />
            </label>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              data-testid="meeting-save"
              size="sm"
              onClick={handleSave}
              disabled={!title.trim() || !start || isMutating}
              className="gap-1.5"
            >
              {isMutating ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CalendarPlus className="w-3.5 h-3.5" />
              )}
              {isEdit ? 'Reschedule' : 'Schedule'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
