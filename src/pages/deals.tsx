import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCrm } from '../platform/CrmPlatformProvider'
import { Button, Badge } from '../components/ui'
import { AddDealDialog } from '../components/AddDealDialog'
import {
  LayoutGrid, List, Plus, Filter, AlertTriangle, Clock,
  Building2, Calendar, ArrowUpDown,
} from 'lucide-react'
import type { Deal } from '../platform/types'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function DealsPage() {
  const { deals, stages, companies, activities, updateDeal } = useCrm()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [showAdd, setShowAdd] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [sortBy, setSortBy] = useState<'amount' | 'date' | 'name'>('date')
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const filteredDeals = useMemo(() => {
    if (statusFilter === 'all') return deals
    return deals.filter(d => d.status === statusFilter)
  }, [deals, statusFilter])

  const openDeals = useMemo(() => deals.filter(d => d.status === 'open'), [deals])

  const companyMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of companies) map[c.id] = c.name
    return map
  }, [companies])

  // For list view sorting
  const sortedDeals = useMemo(() => {
    const sorted = [...filteredDeals]
    switch (sortBy) {
      case 'amount': sorted.sort((a, b) => b.amount - a.amount); break
      case 'name': sorted.sort((a, b) => a.title.localeCompare(b.title)); break
      default: sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break
    }
    return sorted
  }, [filteredDeals, sortBy])

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {}
    for (const stage of stages) {
      map[stage.id] = []
    }
    for (const deal of openDeals) {
      if (deal.stageId && map[deal.stageId]) {
        map[deal.stageId].push(deal)
      }
    }
    return map
  }, [openDeals, stages])

  // Total per-stage values
  const stageValues = useMemo(() => {
    const values: Record<string, number> = {}
    for (const [stageId, stageDeals] of Object.entries(dealsByStage)) {
      values[stageId] = stageDeals.reduce((sum, d) => sum + d.amount, 0)
    }
    return values
  }, [dealsByStage])

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId)
    setDraggingDealId(dealId)
  }

  const handleDragEnd = () => {
    setDraggingDealId(null)
    setDragOverStage(null)
  }

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOverStage(null)
    const dealId = e.dataTransfer.getData('dealId')
    if (dealId) {
      const stage = stages.find(s => s.id === stageId)
      await updateDeal(dealId, {
        stageId: stageId,
        probability: stage?.defaultProbability ?? 0,
        ...(stage?.name === 'Closed Won' ? { status: 'won' } : {}),
        ...(stage?.name === 'Closed Lost' ? { status: 'lost' } : {}),
      })
    }
    setDraggingDealId(null)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOverStage(stageId)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  // Check deal health
  const getDealHealth = (deal: Deal): 'healthy' | 'warning' | 'stale' => {
    const lastActivity = activities.find(a => a.dealId === deal.id)
    const lastDate = lastActivity
      ? new Date(lastActivity.createdAt).getTime()
      : new Date(deal.createdAt).getTime()
    const days = Math.floor((Date.now() - lastDate) / 86400000)
    if (days > 14) return 'stale'
    if (days > 7) return 'warning'
    return 'healthy'
  }

  return (
    <div data-testid="deals-page" className="p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Deals</h1>
          <p className="text-sm text-muted-foreground">
            {openDeals.length} open &middot; {formatCurrency(openDeals.reduce((s, d) => s + d.amount, 0))} pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => setView('board')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                view === 'board' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
          </div>

          <Button data-testid="add-deal-btn" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* Board View */}
      {view === 'board' ? (
        <div data-testid="pipeline-board" className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
          {stages.map(stage => {
            const stageDeals = dealsByStage[stage.id] ?? []
            const isOver = dragOverStage === stage.id
            return (
              <div
                key={stage.id}
                className={`flex-shrink-0 w-72 rounded-xl flex flex-col transition-colors ${
                  isOver ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-secondary/20'
                }`}
                onDrop={e => handleDrop(e, stage.id)}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
              >
                {/* Stage header */}
                <div className="px-3 py-3 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium text-foreground">{stage.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{stageDeals.length}</span>
                </div>
                {/* Stage value */}
                {(stageValues[stage.id] ?? 0) > 0 && (
                  <div className="px-3 pb-2">
                    <span className="text-xs text-muted-foreground">{formatCurrency(stageValues[stage.id])}</span>
                  </div>
                )}

                {/* Deal cards */}
                <div className="flex-1 px-2 pb-2 space-y-2 min-h-[80px]">
                  {stageDeals.map(deal => {
                    const health = getDealHealth(deal)
                    const isDragging = draggingDealId === deal.id
                    return (
                      <Link
                        key={deal.id}
                        to={`/deals/${deal.id}`}
                        draggable
                        onDragStart={e => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        className={`block bg-card border rounded-lg p-3 transition-all cursor-grab active:cursor-grabbing ${
                          isDragging ? 'opacity-40 border-primary/30' : 'border-border hover:border-primary/30 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium text-foreground leading-snug">{deal.title}</span>
                          {health !== 'healthy' && (
                            <div className={`flex-shrink-0 ${health === 'stale' ? 'text-destructive' : 'text-warning'}`}>
                              {health === 'stale' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            </div>
                          )}
                        </div>
                        {deal.companyId && companyMap[deal.companyId] && (
                          <div className="flex items-center gap-1 mb-2">
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">{companyMap[deal.companyId]}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(deal.amount)}</span>
                          <div className="flex items-center gap-2">
                            {deal.closeDate && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Calendar className="w-2.5 h-2.5" />
                                {deal.closeDate}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Probability bar */}
                        <div className="mt-2 h-1 bg-secondary/50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${deal.probability}%`,
                              backgroundColor: stage.color,
                            }}
                          />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* List View */
        <div>
          {/* List filters */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1">
              {['all', 'open', 'won', 'lost'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSortBy(prev => prev === 'amount' ? 'date' : prev === 'date' ? 'name' : 'amount')}
              className="ml-auto flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUpDown className="w-3 h-3" />
              Sort: {sortBy}
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Deal</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Company</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Stage</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Close Date</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Health</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeals.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">No deals match filter</td></tr>
                ) : (
                  sortedDeals.map(deal => {
                    const stage = stages.find(s => s.id === deal.stageId)
                    const health = deal.status === 'open' ? getDealHealth(deal) : null
                    return (
                      <tr key={deal.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/deals/${deal.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                            {deal.title}
                          </Link>
                          {deal.source && <div className="text-xs text-muted-foreground capitalize">{deal.source}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {deal.companyId ? companyMap[deal.companyId] ?? '-' : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {stage && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                              <span className="text-sm text-muted-foreground">{stage.name}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{formatCurrency(deal.amount)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{deal.closeDate ?? '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {health === 'stale' && <AlertTriangle className="w-3.5 h-3.5 text-destructive inline-block" />}
                          {health === 'warning' && <Clock className="w-3.5 h-3.5 text-warning inline-block" />}
                          {health === 'healthy' && <div className="w-2 h-2 bg-success rounded-full mx-auto" />}
                          {!health && <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {deal.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddDealDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  )
}
