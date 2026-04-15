import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCrm } from '../platform/CrmPlatformProvider'
import { Button, Badge } from '../components/ui'
import { AddActivityDialog } from '../components/AddActivityDialog'
import {
  Plus, Clock, Phone, Mail, Calendar, FileText, CheckCircle2,
  Filter, Building2, CircleDollarSign, Users, Search,
} from 'lucide-react'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: FileText,
  task: CheckCircle2,
}

const ACTIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  call: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  email: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  meeting: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  note: { bg: 'bg-slate-500/10', text: 'text-slate-400' },
  task: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
}

export default function ActivitiesPage() {
  const { activities, people, companies, deals, removeActivity, updateActivity } = useCrm()
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const nameMap = useMemo(() => {
    const map: Record<string, { name: string; type: 'contact' | 'company' | 'deal'; path: string }> = {}
    for (const p of people) map[p.id] = { name: p.name, type: 'contact', path: `/contacts/${p.id}` }
    for (const c of companies) map[c.id] = { name: c.name, type: 'company', path: `/companies/${c.id}` }
    for (const d of deals) map[d.id] = { name: d.title, type: 'deal', path: `/deals/${d.id}` }
    return map
  }, [people, companies, deals])

  const filtered = useMemo(() => {
    let result = activities
    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
      )
    }
    return result
  }, [activities, typeFilter, search])

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; items: typeof filtered }[] = []
    let currentDate = ''
    let currentGroup: typeof filtered = []

    for (const a of filtered) {
      const date = formatDate(a.createdAt)
      if (date !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, items: currentGroup })
        }
        currentDate = date
        currentGroup = [a]
      } else {
        currentGroup.push(a)
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, items: currentGroup })
    }
    return groups
  }, [filtered])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: activities.length }
    for (const a of activities) {
      counts[a.type] = (counts[a.type] ?? 0) + 1
    }
    return counts
  }, [activities])

  // Pending tasks (activities of type 'task' with no completedAt)
  const pendingTasks = useMemo(() => {
    return activities.filter(a => a.type === 'task' && !a.completedAt)
  }, [activities])

  const handleCompleteTask = async (activityId: string) => {
    await updateActivity(activityId, { completedAt: new Date().toISOString() })
  }

  return (
    <div data-testid="activities-page" className="p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Activities</h1>
          <p className="text-sm text-muted-foreground">Activity log across all contacts and deals</p>
        </div>
        <Button data-testid="add-activity-btn" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          Log Activity
        </Button>
      </div>

      {/* Pending tasks banner */}
      {pendingTasks.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">{pendingTasks.length} pending task{pendingTasks.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="space-y-1.5">
            {pendingTasks.slice(0, 3).map(task => (
              <div key={task.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCompleteTask(task.id)}
                    className="w-4 h-4 rounded border border-amber-500/40 hover:bg-amber-500/20 transition-colors flex-shrink-0"
                  />
                  <span className="text-sm text-foreground">{task.title}</span>
                </div>
                {task.dueAt && (
                  <span className="text-xs text-muted-foreground">{formatDate(task.dueAt)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search activities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'email', 'call', 'meeting', 'note', 'task'].map(t => {
            const Icon = t === 'all' ? Filter : ACTIVITY_ICONS[t] || FileText
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  typeFilter === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3 h-3" />
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                <span className="opacity-60">{typeCounts[t] ?? 0}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Activity list grouped by date */}
      {grouped.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {typeFilter !== 'all' || search ? 'No matching activities' : 'No activities yet'}
          </p>
          {!search && typeFilter === 'all' && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
              <Plus className="w-3.5 h-3.5" />
              Log your first activity
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 sticky top-0 bg-background py-1">
                {group.date}
              </div>
              <div className="relative">
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
                <div className="space-y-3">
                  {group.items.map(activity => {
                    const Icon = ACTIVITY_ICONS[activity.type] || FileText
                    const colors = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.note
                    const contact = activity.contactId ? nameMap[activity.contactId] : null
                    const company = activity.companyId ? nameMap[activity.companyId] : null
                    const deal = activity.dealId ? nameMap[activity.dealId] : null
                    const isCompletedTask = activity.type === 'task' && activity.completedAt

                    return (
                      <div key={activity.id} className="flex items-start gap-3 relative">
                        <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center flex-shrink-0 z-10 border-2 border-background`}>
                          <Icon className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 bg-card border border-border rounded-xl p-4 -mt-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-sm font-medium text-foreground ${isCompletedTask ? 'line-through opacity-50' : ''}`}>
                                  {activity.title}
                                </span>
                                <Badge variant="secondary" className="text-[10px]">{activity.type}</Badge>
                              </div>
                              {activity.description && (
                                <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{timeAgo(activity.createdAt)}</span>
                          </div>

                          {/* Related entities */}
                          {(contact || company || deal) && (
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                              {contact && (
                                <Link to={contact.path} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                  <Users className="w-3 h-3" />
                                  {contact.name}
                                </Link>
                              )}
                              {company && (
                                <Link to={company.path} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                  <Building2 className="w-3 h-3" />
                                  {company.name}
                                </Link>
                              )}
                              {deal && (
                                <Link to={deal.path} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                                  <CircleDollarSign className="w-3 h-3" />
                                  {deal.name}
                                </Link>
                              )}
                            </div>
                          )}

                          {/* Task complete button */}
                          {activity.type === 'task' && !activity.completedAt && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <button
                                onClick={() => handleCompleteTask(activity.id)}
                                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Mark complete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddActivityDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  )
}
