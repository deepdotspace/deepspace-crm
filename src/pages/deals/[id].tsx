import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMemo, useState, useCallback } from 'react'
import { useCrm } from '../../platform/CrmPlatformProvider'
import { Badge, Button, Input, DatePicker } from '../../components/ui'
import { AddActivityDialog } from '../../components/AddActivityDialog'
import { ComposeEmailDialog } from '../../components/ComposeEmailDialog'
import {
  ArrowLeft, Building2, CircleDollarSign, Calendar, Users,
  Clock, FileText, Pencil, Check, X, Trash2, Plus, Phone,
  Mail, Trophy, XCircle, AlertTriangle, ChevronRight, Send,
} from 'lucide-react'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone, email: Mail, meeting: Calendar, note: FileText, task: Clock,
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    deals, companies, stages, people, activities, contactsByDeal,
    updateDeal, removeDeal,
  } = useCrm()

  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [emailTarget, setEmailTarget] = useState<{ email: string; name: string; contactId: string } | null>(null)

  const deal = useMemo(() => deals.find(d => d.id === id), [deals, id])
  const company = useMemo(() => deal?.companyId ? companies.find(c => c.id === deal.companyId) : null, [deal, companies])
  const stage = useMemo(() => deal?.stageId ? stages.find(s => s.id === deal.stageId) : null, [deal, stages])

  const linkedContacts = useMemo(() => {
    const dcs = contactsByDeal[id ?? ''] ?? []
    return dcs.map(dc => ({
      ...dc,
      person: people.find(p => p.id === dc.contactId),
    }))
  }, [contactsByDeal, people, id])

  const dealActivities = useMemo(
    () => activities.filter(a => a.dealId === id),
    [activities, id],
  )

  // Deal age in days
  const dealAge = useMemo(() => {
    if (!deal) return 0
    return Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000)
  }, [deal])

  // Days since last activity
  const daysSinceActivity = useMemo(() => {
    if (dealActivities.length === 0 && deal) {
      return Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000)
    }
    if (dealActivities.length > 0) {
      return Math.floor((Date.now() - new Date(dealActivities[0].createdAt).getTime()) / 86400000)
    }
    return 0
  }, [dealActivities, deal])

  const startEdit = useCallback((field: string, value: string) => {
    setEditing(field)
    setEditValue(value)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editing || !deal) return
    const val = editing === 'amount' ? parseFloat(editValue) || 0 : editValue || null
    await updateDeal(deal.id, { [editing]: val })
    setEditing(null)
  }, [editing, editValue, deal, updateDeal])

  const cancelEdit = useCallback(() => setEditing(null), [])

  if (!deal) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">Deal not found</p>
          <Link to="/deals" className="text-sm text-primary hover:underline">Back to deals</Link>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    await removeDeal(deal.id)
    navigate('/deals')
  }

  const handleStageChange = async (stageId: string) => {
    const newStage = stages.find(s => s.id === stageId)
    await updateDeal(deal.id, {
      stageId: stageId,
      probability: newStage?.defaultProbability ?? deal.probability,
      ...(newStage?.name === 'Closed Won' ? { status: 'won' } : {}),
      ...(newStage?.name === 'Closed Lost' ? { status: 'lost' } : {}),
    })
  }

  const handleMarkWon = async () => {
    const wonStage = stages.find(s => s.name === 'Closed Won')
    await updateDeal(deal.id, {
      status: 'won',
      ...(wonStage ? { stageId: wonStage.id, probability: 100 } : {}),
    })
  }

  const handleMarkLost = async () => {
    const lostStage = stages.find(s => s.name === 'Closed Lost')
    await updateDeal(deal.id, {
      status: 'lost',
      ...(lostStage ? { stageId: lostStage.id, probability: 0 } : {}),
    })
  }

  return (
    <div data-testid="deal-detail-page" className="max-w-[1000px] mx-auto p-6">
      <Link to="/deals" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Deals
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Deal header */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-semibold text-foreground">{deal.title}</h1>
                  <Badge
                    variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                  >
                    {deal.status}
                  </Badge>
                </div>
                {company && (
                  <Link to={`/companies/${company.id}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {company.name}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                {deal.status === 'open' && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleMarkWon} className="text-success border-success/30 hover:bg-success/10">
                      <Trophy className="w-3.5 h-3.5" />
                      Won
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleMarkLost} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                      <XCircle className="w-3.5 h-3.5" />
                      Lost
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setShowAddActivity(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  Activity
                </Button>
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-4 gap-4 mb-5">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Amount</div>
                <div className="text-lg font-bold text-foreground">{formatCurrency(deal.amount)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Probability</div>
                <div className="text-lg font-bold text-foreground">{deal.probability}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Weighted</div>
                <div className="text-lg font-bold text-primary">{formatCurrency(deal.amount * deal.probability / 100)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Age</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-bold text-foreground">{dealAge}d</span>
                  {daysSinceActivity > 7 && (
                    <AlertTriangle className={`w-4 h-4 ${daysSinceActivity > 14 ? 'text-destructive' : 'text-warning'}`} />
                  )}
                </div>
              </div>
            </div>

            {/* Stage progression */}
            {deal.status === 'open' && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Pipeline Stage</div>
                <div className="flex gap-1">
                  {stages.map((s, i) => {
                    const currentIdx = stages.findIndex(st => st.id === deal.stageId)
                    const isPast = i < currentIdx
                    const isCurrent = s.id === deal.stageId
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleStageChange(s.id)}
                        className={`flex-1 py-2 text-xs rounded-md transition-all font-medium ${
                          isCurrent
                            ? 'text-white shadow-sm'
                            : isPast
                              ? 'text-foreground/70'
                              : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                        }`}
                        style={{
                          backgroundColor: isCurrent ? s.color : isPast ? s.color + '30' : undefined,
                        }}
                      >
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Contacts */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              Contacts ({linkedContacts.length})
            </h2>
            {linkedContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No contacts linked to this deal</p>
            ) : (
              <div className="space-y-2">
                {linkedContacts.map(lc => (
                  <div key={lc.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                    {lc.person ? (
                      <Link to={`/contacts/${lc.person.id}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                          {getInitials(lc.person.name)}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{lc.person.name}</span>
                          {lc.person.title && <div className="text-xs text-muted-foreground">{lc.person.title}</div>}
                        </div>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unknown contact</span>
                    )}
                    <div className="flex items-center gap-2">
                      {lc.person?.email && (
                        <button
                          onClick={() => setEmailTarget({
                            email: lc.person!.email!,
                            name: lc.person!.name,
                            contactId: lc.person!.id,
                          })}
                          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title={`Email ${lc.person.name}`}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <Badge variant="secondary" className="text-[10px] capitalize">{lc.role.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Activity ({dealActivities.length})
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddActivity(true)}>
                <Plus className="w-3.5 h-3.5" /> Log
              </Button>
            </div>
            {dealActivities.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No activities yet</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAddActivity(true)}>
                  Log first activity
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-3">
                  {dealActivities.map(a => {
                    const Icon = ACTIVITY_ICONS[a.type] || FileText
                    return (
                      <div key={a.id} className="flex items-start gap-3 relative">
                        <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center flex-shrink-0 z-10 border-2 border-background">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-foreground">{a.title}</span>
                            <Badge variant="secondary" className="text-[10px]">{a.type}</Badge>
                          </div>
                          {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                          <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Details</h3>
            <div className="space-y-4">
              <EditableField label="Amount" value={deal.amount ? formatCurrency(deal.amount) : '-'} icon={CircleDollarSign}
                editing={editing === 'amount'} editValue={editValue}
                onStartEdit={() => startEdit('amount', String(deal.amount || ''))}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} />
              <EditableField label="Close Date" value={deal.closeDate ?? '-'} icon={Calendar}
                editing={editing === 'closeDate'} editValue={editValue}
                onStartEdit={() => startEdit('closeDate', deal.closeDate ?? '')}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} type="date" />
              <EditableField label="Source" value={deal.source ?? '-'} icon={FileText}
                editing={editing === 'source'} editValue={editValue}
                onStartEdit={() => startEdit('source', deal.source ?? '')}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} />
              <EditableField label="Notes" value={deal.notes ?? '-'} icon={FileText}
                editing={editing === 'notes'} editValue={editValue}
                onStartEdit={() => startEdit('notes', deal.notes ?? '')}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} />
              <div>
                <div className="text-xs text-muted-foreground mb-1">Created</div>
                <span className="text-sm text-foreground">{timeAgo(deal.createdAt)}</span>
              </div>
              {deal.status === 'lost' && deal.lossReason && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Loss Reason</div>
                  <span className="text-sm text-destructive">{deal.lossReason}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            {showDeleteConfirm ? (
              <div>
                <p className="text-sm text-foreground mb-3">Delete this deal?</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive w-full justify-start"
                onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete deal
              </Button>
            )}
          </div>
        </div>
      </div>

      <AddActivityDialog
        open={showAddActivity}
        onClose={() => setShowAddActivity(false)}
        prefillDealId={deal.id}
      />

      <ComposeEmailDialog
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        prefillTo={emailTarget?.email}
        contactName={emailTarget?.name}
        contactId={emailTarget?.contactId}
        dealId={deal.id}
        companyId={deal.companyId ?? undefined}
      />
    </div>
  )
}

function EditableField({ label, value, icon: Icon, editing, editValue, onStartEdit, onSave, onCancel, onChange, type }: {
  label: string; value: string; icon: typeof CircleDollarSign; editing: boolean; editValue: string
  onStartEdit: () => void; onSave: () => void; onCancel: () => void; onChange: (v: string) => void; type?: string
}) {
  if (editing) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="flex items-center gap-1">
          {type === 'date' ? (
            <div className="flex-1">
              <DatePicker value={editValue} onChange={v => { onChange(v); }} placeholder="Pick a date" />
            </div>
          ) : (
            <Input value={editValue} onChange={e => onChange(e.target.value)} className="h-7 text-sm" autoFocus type={type}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
          )}
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
        <span className="text-sm text-foreground">{value}</span>
        <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors ml-auto" />
      </div>
    </div>
  )
}
