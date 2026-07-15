import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMemo, useState, useCallback } from 'react'
import { useCrm } from '../../platform/CrmPlatformProvider'
import { Badge, Button, Input } from '../../components/ui'
import { AddActivityDialog } from '../../components/AddActivityDialog'
import { ComposeEmailDialog } from '../../components/ComposeEmailDialog'
import { EmailListWidget } from '../../components/EmailListWidget'
import { ScheduleMeetingDialog } from '../../components/ScheduleMeetingDialog'
import { UpcomingMeetingsWidget } from '../../components/UpcomingMeetingsWidget'
import type { CalendarEvent } from '../../platform/useCalendar'
import {
  ArrowLeft, Building2, Mail, Phone, Calendar, CalendarPlus, MapPin,
  CircleDollarSign, Clock, Pencil, Check, X, Trash2,
  Plus, FileText, MessageSquare,
} from 'lucide-react'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: FileText,
  task: Clock,
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    people, companies, deals, activities, dealContacts, stages,
    removePerson, updatePerson,
  } = useCrm()

  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [rescheduleEvent, setRescheduleEvent] = useState<CalendarEvent | null>(null)
  const [meetingsRefresh, setMeetingsRefresh] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const person = useMemo(() => people.find(p => p.id === id), [people, id])
  const company = useMemo(
    () => person?.companyId ? companies.find(c => c.id === person.companyId) : null,
    [person, companies],
  )

  const personDeals = useMemo(() => {
    const dcIds = dealContacts.filter(dc => dc.contactId === id).map(dc => dc.dealId)
    return deals.filter(d => dcIds.includes(d.id))
  }, [dealContacts, deals, id])

  const personActivities = useMemo(
    () => activities.filter(a => a.contactId === id),
    [activities, id],
  )

  const startEdit = useCallback((field: string, value: string) => {
    setEditing(field)
    setEditValue(value)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editing || !person) return
    await updatePerson(person.id, { [editing]: editValue || null })
    setEditing(null)
  }, [editing, editValue, person, updatePerson])

  const cancelEdit = useCallback(() => {
    setEditing(null)
  }, [])

  if (!person) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">Contact not found</p>
          <Link to="/contacts" className="text-sm text-primary hover:underline">Back to contacts</Link>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    await removePerson(person.id)
    navigate('/contacts')
  }

  return (
    <div data-testid="contact-detail-page" className="max-w-[1000px] mx-auto p-6">
      {/* Back nav */}
      <Link
        to="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Contacts
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Profile header */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold text-primary flex-shrink-0">
                {getInitials(person.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-semibold text-foreground">{person.name}</h1>
                  <Badge variant={person.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {person.status}
                  </Badge>
                  <Badge variant="secondary" className="text-xs capitalize">{person.type}</Badge>
                </div>
                {person.title && <p className="text-sm text-muted-foreground">{person.title}</p>}
                {company && (
                  <Link to={`/companies/${company.id}`} className="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {company.name}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRescheduleEvent(null); setShowSchedule(true) }}
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Schedule
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddActivity(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  Activity
                </Button>
              </div>
            </div>
          </div>

          {/* Deals */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4 text-muted-foreground" />
                Deals ({personDeals.length})
              </h2>
            </div>
            {personDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No deals linked to this contact</p>
            ) : (
              <div className="space-y-2">
                {personDeals.map(deal => {
                  const stage = stages.find(s => s.id === deal.stageId)
                  return (
                    <Link
                      key={deal.id}
                      to={`/deals/${deal.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {stage && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                        )}
                        <div>
                          <span className="text-sm font-medium text-foreground">{deal.title}</span>
                          <div className="text-xs text-muted-foreground">{stage?.name ?? 'No stage'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{formatCurrency(deal.amount)}</span>
                        <Badge
                          variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {deal.status}
                        </Badge>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Activity Timeline ({personActivities.length})
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddActivity(true)}>
                <Plus className="w-3.5 h-3.5" />
                Log
              </Button>
            </div>
            {personActivities.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No activities recorded</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAddActivity(true)}>
                  Log first activity
                </Button>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-4">
                  {personActivities.map(a => {
                    const Icon = ACTIVITY_ICONS[a.type] || FileText
                    return (
                      <div key={a.id} className="flex items-start gap-3 relative">
                        <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center flex-shrink-0 z-10 border-2 border-background">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{a.title}</span>
                            <Badge variant="secondary" className="text-[10px]">{a.type}</Badge>
                          </div>
                          {a.description && (
                            <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                          )}
                          <span className="text-xs text-muted-foreground mt-1 block">{timeAgo(a.createdAt)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Emails — messages between this contact's email and the user,
              across all labels (sent + received + archive), read via
              gmail.readonly. Row actions (star, read/unread, archive,
              trash) write back via gmail.modify. Only renders when the
              contact has an email address to query against. */}
          {person.email && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Emails</h2>
                <Button size="sm" variant="outline" onClick={() => setShowCompose(true)}>
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </Button>
              </div>
              <EmailListWidget
                query={{
                  q: `from:${person.email} OR to:${person.email}`,
                  labelIds: [],
                  maxResults: 10,
                  format: 'metadata',
                }}
                emptyText={`No emails with ${person.email}.`}
                enableActions
              />
            </div>
          )}

          {/* Upcoming meetings — Google Calendar events with this contact
              (calendar.events). Reschedule/cancel act on the same events;
              scheduling a new one lives behind the header "Schedule" button. */}
          {person.email && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Meetings</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setRescheduleEvent(null); setShowSchedule(true) }}
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Schedule
                </Button>
              </div>
              <UpcomingMeetingsWidget
                emails={[person.email]}
                refreshKey={meetingsRefresh}
                emptyText={`No upcoming meetings with ${person.name}.`}
                onReschedule={(ev) => { setRescheduleEvent(ev); setShowSchedule(true) }}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Contact details */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Details</h3>
            <div className="space-y-4">
              <EditableField
                label="Email"
                value={person.email ?? ''}
                icon={Mail}
                editing={editing === 'email'}
                editValue={editValue}
                onStartEdit={() => startEdit('email', person.email ?? '')}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onChange={setEditValue}
              />
              <EditableField
                label="Title"
                value={person.title ?? ''}
                icon={FileText}
                editing={editing === 'title'}
                editValue={editValue}
                onStartEdit={() => startEdit('title', person.title ?? '')}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onChange={setEditValue}
              />
              <EditableField
                label="Department"
                value={person.department ?? ''}
                icon={Building2}
                editing={editing === 'department'}
                editValue={editValue}
                onStartEdit={() => startEdit('department', person.department ?? '')}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onChange={setEditValue}
              />
              <div>
                <div className="text-xs text-muted-foreground mb-1">Company</div>
                {company ? (
                  <Link to={`/companies/${company.id}`} className="text-sm text-primary hover:underline">{company.name}</Link>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Last Contacted</div>
                <span className="text-sm text-foreground">
                  {person.lastContactedAt ? timeAgo(person.lastContactedAt) : 'Never'}
                </span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Created</div>
                <span className="text-sm text-foreground">{timeAgo(person.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-card border border-border rounded-xl p-5">
            {showDeleteConfirm ? (
              <div>
                <p className="text-sm text-foreground mb-3">Delete this contact?</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive w-full justify-start"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete contact
              </Button>
            )}
          </div>
        </div>
      </div>

      <AddActivityDialog
        open={showAddActivity}
        onClose={() => setShowAddActivity(false)}
        prefillContactId={person.id}
      />

      <ComposeEmailDialog
        open={showCompose}
        onClose={() => setShowCompose(false)}
        prefillTo={person.email ?? ''}
        contactName={person.name}
        contactId={person.id}
        companyId={person.companyId ?? undefined}
      />

      <ScheduleMeetingDialog
        open={showSchedule}
        onClose={() => { setShowSchedule(false); setRescheduleEvent(null) }}
        event={rescheduleEvent}
        prefillAttendee={person.email ?? ''}
        contactName={person.name}
        contactId={person.id}
        companyId={person.companyId ?? undefined}
        onSaved={() => setMeetingsRefresh((n) => n + 1)}
      />
    </div>
  )
}

function EditableField({ label, value, icon: Icon, editing, editValue, onStartEdit, onSave, onCancel, onChange }: {
  label: string
  value: string
  icon: typeof Mail
  editing: boolean
  editValue: string
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onChange: (v: string) => void
}) {
  if (editing) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={e => onChange(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') onSave()
              if (e.key === 'Escape') onCancel()
            }}
          />
          <button onClick={onSave} className="p-1 text-success hover:text-success/80"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    )
  }
  return (
    <div className="group cursor-pointer" onClick={onStartEdit}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground">{value || '-'}</span>
        <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors ml-auto" />
      </div>
    </div>
  )
}
