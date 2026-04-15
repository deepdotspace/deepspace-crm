import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMemo, useState, useCallback } from 'react'
import { useCrm } from '../../platform/CrmPlatformProvider'
import { Badge, Button, Input } from '../../components/ui'
import { ComposeEmailDialog } from '../../components/ComposeEmailDialog'
import {
  ArrowLeft, Building2, Users, CircleDollarSign, Globe,
  MapPin, FileText, Clock, Pencil, Check, X, Trash2, Plus,
  Phone, Mail, Calendar, Send,
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

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { companies, people, deals, activities, stages, removeCompany, updateCompany } = useCrm()

  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [emailTarget, setEmailTarget] = useState<{ email: string; name: string; contactId: string } | null>(null)

  const company = useMemo(() => companies.find(c => c.id === id), [companies, id])
  const companyPeople = useMemo(() => people.filter(p => p.companyId === id), [people, id])
  const companyDeals = useMemo(() => deals.filter(d => d.companyId === id), [deals, id])
  const companyActivities = useMemo(() => activities.filter(a => a.companyId === id), [activities, id])

  const dealStats = useMemo(() => {
    const open = companyDeals.filter(d => d.status === 'open')
    const won = companyDeals.filter(d => d.status === 'won')
    return {
      openCount: open.length,
      openValue: open.reduce((s, d) => s + d.amount, 0),
      wonCount: won.length,
      wonValue: won.reduce((s, d) => s + d.amount, 0),
      totalValue: companyDeals.reduce((s, d) => s + d.amount, 0),
    }
  }, [companyDeals])

  const startEdit = useCallback((field: string, value: string) => {
    setEditing(field)
    setEditValue(value)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editing || !company) return
    await updateCompany(company.id, { [editing]: editValue || null })
    setEditing(null)
  }, [editing, editValue, company, updateCompany])

  const cancelEdit = useCallback(() => setEditing(null), [])

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">Company not found</p>
          <Link to="/companies" className="text-sm text-primary hover:underline">Back to companies</Link>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    await removeCompany(company.id)
    navigate('/companies')
  }

  return (
    <div data-testid="company-detail-page" className="max-w-[1000px] mx-auto p-6">
      <Link to="/companies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Companies
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Company header */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-semibold text-foreground">{company.name}</h1>
                {company.domain && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                    <Globe className="w-3.5 h-3.5" />
                    {company.domain}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {company.industry && <Badge variant="secondary">{company.industry}</Badge>}
                  {company.size && <Badge variant="secondary">{company.size} employees</Badge>}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3 mt-5 pt-4 border-t border-border/50">
              <div>
                <div className="text-xs text-muted-foreground">Contacts</div>
                <div className="text-lg font-semibold text-foreground">{companyPeople.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Open Deals</div>
                <div className="text-lg font-semibold text-foreground">{dealStats.openCount}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Pipeline</div>
                <div className="text-lg font-semibold text-primary">{formatCurrency(dealStats.openValue)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Won</div>
                <div className="text-lg font-semibold text-success">{formatCurrency(dealStats.wonValue)}</div>
              </div>
            </div>
          </div>

          {/* Contacts at company */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              People ({companyPeople.length})
            </h2>
            {companyPeople.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No contacts at this company</p>
            ) : (
              <div className="space-y-1">
                {companyPeople.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors group">
                    <Link to={`/contacts/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                        {getInitials(p.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{p.name}</span>
                        {p.title && <div className="text-xs text-muted-foreground">{p.title}</div>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.email && (
                        <button
                          onClick={() => setEmailTarget({ email: p.email!, name: p.name, contactId: p.id })}
                          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title={`Email ${p.name}`}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground hidden lg:block">{p.email ?? ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deals */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <CircleDollarSign className="w-4 h-4 text-muted-foreground" />
              Deals ({companyDeals.length})
            </h2>
            {companyDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No deals with this company</p>
            ) : (
              <div className="space-y-2">
                {companyDeals.map(d => {
                  const stage = stages.find(s => s.id === d.stageId)
                  return (
                    <Link key={d.id} to={`/deals/${d.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        {stage && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />}
                        <div>
                          <span className="text-sm font-medium text-foreground">{d.title}</span>
                          <div className="text-xs text-muted-foreground">{stage?.name ?? 'No stage'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{formatCurrency(d.amount)}</span>
                        <Badge variant={d.status === 'won' ? 'default' : d.status === 'lost' ? 'destructive' : 'secondary'} className="text-xs">
                          {d.status}
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
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Activity ({companyActivities.length})
            </h2>
            {companyActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activities recorded</p>
            ) : (
              <div className="relative">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-3">
                  {companyActivities.slice(0, 10).map(a => {
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
              <EditableField label="Website" value={company.website ?? ''} icon={Globe}
                editing={editing === 'website'} editValue={editValue}
                onStartEdit={() => startEdit('website', company.website ?? '')}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} />
              <EditableField label="Address" value={company.address ?? ''} icon={MapPin}
                editing={editing === 'address'} editValue={editValue}
                onStartEdit={() => startEdit('address', company.address ?? '')}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} />
              <EditableField label="Notes" value={company.notes ?? ''} icon={FileText}
                editing={editing === 'notes'} editValue={editValue}
                onStartEdit={() => startEdit('notes', company.notes ?? '')}
                onSave={saveEdit} onCancel={cancelEdit} onChange={setEditValue} />
              <div>
                <div className="text-xs text-muted-foreground mb-1">Created</div>
                <span className="text-sm text-foreground">{timeAgo(company.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            {showDeleteConfirm ? (
              <div>
                <p className="text-sm text-foreground mb-3">Delete this company?</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive w-full justify-start"
                onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete company
              </Button>
            )}
          </div>
        </div>
      </div>

      <ComposeEmailDialog
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        prefillTo={emailTarget?.email}
        contactName={emailTarget?.name}
        contactId={emailTarget?.contactId}
        companyId={company.id}
      />
    </div>
  )
}

function EditableField({ label, value, icon: Icon, editing, editValue, onStartEdit, onSave, onCancel, onChange }: {
  label: string; value: string; icon: typeof Globe; editing: boolean; editValue: string
  onStartEdit: () => void; onSave: () => void; onCancel: () => void; onChange: (v: string) => void
}) {
  if (editing) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="flex items-center gap-1">
          <Input value={editValue} onChange={e => onChange(e.target.value)} className="h-7 text-sm" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
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
