import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCrm } from '../platform/CrmPlatformProvider'
import {
  TrendingUp, TrendingDown, DollarSign, Users, Building2,
  Target, AlertTriangle, CheckCircle2, Clock, ArrowRight,
  Phone, Mail, Calendar, FileText, CircleDollarSign,
} from 'lucide-react'
import { Badge } from '../components/ui'

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function formatCurrencyFull(amount: number): string {
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

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: FileText,
  task: CheckCircle2,
}

export default function DashboardPage() {
  const { deals, openDeals, companies, people, stages, activities, totalPipelineValue } = useCrm()

  const wonDeals = useMemo(() => deals.filter(d => d.status === 'won'), [deals])
  const wonValue = useMemo(() => wonDeals.reduce((s, d) => s + d.amount, 0), [wonDeals])
  const lostDeals = useMemo(() => deals.filter(d => d.status === 'lost'), [deals])

  const winRate = useMemo(() => {
    const closed = wonDeals.length + lostDeals.length
    return closed > 0 ? Math.round((wonDeals.length / closed) * 100) : 0
  }, [wonDeals, lostDeals])

  // Deals closing this month
  const closingThisMonth = useMemo(() => {
    const now = new Date()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return openDeals.filter(d => {
      if (!d.closeDate) return false
      const close = new Date(d.closeDate)
      return close <= monthEnd && close >= now
    })
  }, [openDeals])

  // Stale deals (no activity in 14+ days, still open)
  const staleDeals = useMemo(() => {
    const cutoff = Date.now() - 14 * 86400000
    return openDeals.filter(d => {
      const lastActivity = activities.find(a => a.dealId === d.id)
      const lastDate = lastActivity ? new Date(lastActivity.createdAt).getTime() : new Date(d.createdAt).getTime()
      return lastDate < cutoff
    })
  }, [openDeals, activities])

  // Pipeline funnel data
  const pipelineFunnel = useMemo(() => {
    const activeStages = stages.filter(s => s.name !== 'Closed Won' && s.name !== 'Closed Lost')
    const maxDeals = Math.max(...activeStages.map(s => openDeals.filter(d => d.stageId === s.id).length), 1)
    return activeStages.map(stage => {
      const stageDeals = openDeals.filter(d => d.stageId === stage.id)
      const value = stageDeals.reduce((sum, d) => sum + d.amount, 0)
      return {
        stage,
        count: stageDeals.length,
        value,
        pct: stageDeals.length / maxDeals,
      }
    })
  }, [stages, openDeals])

  return (
    <div data-testid="dashboard-page" className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Pipeline health and recent activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Pipeline Value"
          value={formatCurrency(totalPipelineValue)}
          sub={`${openDeals.length} open deals`}
          icon={Target}
          color="text-primary"
          bgColor="bg-primary/10"
        />
        <KpiCard
          label="Won Revenue"
          value={formatCurrency(wonValue)}
          sub={`${wonDeals.length} deals closed`}
          icon={TrendingUp}
          color="text-success"
          bgColor="bg-success/10"
        />
        <KpiCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${wonDeals.length}W / ${lostDeals.length}L`}
          icon={CheckCircle2}
          color="text-info"
          bgColor="bg-info/10"
        />
        <KpiCard
          label="Contacts"
          value={String(people.length)}
          sub={`${companies.length} companies`}
          icon={Users}
          color="text-warning"
          bgColor="bg-warning/10"
        />
      </div>

      {/* Pipeline Funnel + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <div data-testid="pipeline-summary" className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Pipeline Funnel</h2>
            <Link to="/deals" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {pipelineFunnel.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Setting up pipeline...</p>
          ) : (
            <div className="space-y-3">
              {pipelineFunnel.map(({ stage, count, value, pct }) => (
                <div key={stage.id} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-muted-foreground truncate">{stage.name}</div>
                  <div className="flex-1 h-8 bg-secondary/30 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-500 flex items-center px-3"
                      style={{
                        width: `${Math.max(pct * 100, count > 0 ? 15 : 0)}%`,
                        backgroundColor: stage.color + '30',
                        borderLeft: count > 0 ? `3px solid ${stage.color}` : undefined,
                      }}
                    >
                      {count > 0 && (
                        <span className="text-xs font-medium text-foreground whitespace-nowrap">
                          {count} {count === 1 ? 'deal' : 'deals'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-20 text-right text-xs font-medium text-muted-foreground">
                    {value > 0 ? formatCurrency(value) : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts & Actions */}
        <div className="space-y-4">
          {/* Closing this month */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Closing This Month</h3>
            {closingThisMonth.length === 0 ? (
              <p className="text-xs text-muted-foreground">No deals closing soon</p>
            ) : (
              <div className="space-y-2">
                {closingThisMonth.slice(0, 4).map(deal => (
                  <Link
                    key={deal.id}
                    to={`/deals/${deal.id}`}
                    className="flex items-center justify-between py-1 hover:text-primary transition-colors"
                  >
                    <span className="text-xs text-foreground truncate pr-2">{deal.title}</span>
                    <span className="text-xs font-medium text-primary whitespace-nowrap">{formatCurrency(deal.amount)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Stale deals */}
          {staleDeals.length > 0 && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                <h3 className="text-xs font-semibold text-warning uppercase tracking-wider">Stale Deals</h3>
              </div>
              <div className="space-y-2">
                {staleDeals.slice(0, 3).map(deal => (
                  <Link
                    key={deal.id}
                    to={`/deals/${deal.id}`}
                    className="flex items-center justify-between py-1 hover:text-warning transition-colors"
                  >
                    <span className="text-xs text-foreground truncate pr-2">{deal.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(deal.createdAt)}</span>
                  </Link>
                ))}
                {staleDeals.length > 3 && (
                  <p className="text-xs text-muted-foreground">+{staleDeals.length - 3} more</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Recent Deals + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Deals */}
        <div data-testid="recent-deals" className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Deals</h2>
            <Link to="/deals" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {openDeals.length === 0 ? (
            <div className="text-center py-8">
              <CircleDollarSign className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No open deals yet</p>
              <Link to="/deals" className="text-xs text-primary hover:underline mt-1 inline-block">Create your first deal</Link>
            </div>
          ) : (
            <div className="space-y-1">
              {openDeals.slice(0, 5).map(deal => {
                const stage = stages.find(s => s.id === deal.stageId)
                return (
                  <Link
                    key={deal.id}
                    to={`/deals/${deal.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 -mx-1 rounded-lg hover:bg-secondary/30 transition-colors"
                  >
                    {stage && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{deal.title}</div>
                      <div className="text-xs text-muted-foreground">{stage?.name ?? 'No stage'}</div>
                    </div>
                    <div className="text-sm font-semibold text-foreground whitespace-nowrap">{formatCurrencyFull(deal.amount)}</div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div data-testid="recent-activities" className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <Link to="/activities" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activities yet</p>
              <Link to="/activities" className="text-xs text-primary hover:underline mt-1 inline-block">Log your first activity</Link>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.slice(0, 6).map(activity => {
                const Icon = ACTIVITY_ICONS[activity.type] || FileText
                return (
                  <div key={activity.id} className="flex items-start gap-3 px-3 py-2.5 -mx-1 rounded-lg">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        backgroundColor: activity.type === 'call' ? 'rgba(16,185,129,0.1)' :
                          activity.type === 'email' ? 'rgba(59,130,246,0.1)' :
                          activity.type === 'meeting' ? 'rgba(139,92,246,0.1)' :
                          'rgba(148,163,184,0.1)',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{
                        color: activity.type === 'call' ? '#10b981' :
                          activity.type === 'email' ? '#3b82f6' :
                          activity.type === 'meeting' ? '#8b5cf6' :
                          '#94a3b8',
                      }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{activity.title}</div>
                      <div className="text-xs text-muted-foreground">{timeAgo(activity.createdAt)}</div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] mt-0.5">{activity.type}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, color, bgColor }: {
  label: string; value: string; sub: string; icon: typeof TrendingUp; color: string; bgColor: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  )
}
