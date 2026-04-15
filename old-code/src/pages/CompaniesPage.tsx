import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCrm } from '../platform/CrmPlatformProvider'
import { Button, Badge } from '../components/ui'
import { AddCompanyDialog } from '../components/AddCompanyDialog'
import {
  Plus, Search, Building2, Users, CircleDollarSign,
  Globe, ChevronRight, LayoutGrid, List,
} from 'lucide-react'

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount}`
}

interface CompaniesPageProps {
  quickAdd?: boolean
  onQuickAddDone?: () => void
}

export default function CompaniesPage({ quickAdd, onQuickAddDone }: CompaniesPageProps) {
  const { companies, deals, people } = useCrm()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    if (quickAdd) {
      setShowAdd(true)
      onQuickAddDone?.()
    }
  }, [quickAdd, onQuickAddDone])

  const companyStats = useMemo(() => {
    const stats: Record<string, { dealCount: number; openDealCount: number; contactCount: number; totalValue: number; wonValue: number }> = {}
    for (const c of companies) {
      stats[c.id] = { dealCount: 0, openDealCount: 0, contactCount: 0, totalValue: 0, wonValue: 0 }
    }
    for (const d of deals) {
      if (d.companyId && stats[d.companyId]) {
        stats[d.companyId].dealCount++
        stats[d.companyId].totalValue += d.amount
        if (d.status === 'open') stats[d.companyId].openDealCount++
        if (d.status === 'won') stats[d.companyId].wonValue += d.amount
      }
    }
    for (const p of people) {
      if (p.companyId && stats[p.companyId]) {
        stats[p.companyId].contactCount++
      }
    }
    return stats
  }, [companies, deals, people])

  const filtered = useMemo(() => {
    if (!search) return companies
    const q = search.toLowerCase()
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.industry?.toLowerCase().includes(q) ||
      c.domain?.toLowerCase().includes(q),
    )
  }, [companies, search])

  return (
    <div data-testid="companies-page" className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Companies</h1>
          <p className="text-sm text-muted-foreground">{companies.length} companies</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                view === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button data-testid="add-company-btn" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add Company
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          data-testid="company-search"
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? 'No companies match your search' : 'No companies yet'}
          </p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add your first company
            </Button>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(company => {
            const stats = companyStats[company.id]
            return (
              <Link
                key={company.id}
                to={`/companies/${company.id}`}
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{company.name}</h3>
                      {company.domain && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Globe className="w-2.5 h-2.5" />
                          {company.domain}
                        </div>
                      )}
                    </div>
                  </div>
                  {company.industry && <Badge variant="secondary" className="text-[10px]">{company.industry}</Badge>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {stats?.contactCount ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <CircleDollarSign className="w-3 h-3" />
                    {stats?.openDealCount ?? 0} open
                  </span>
                  {(stats?.totalValue ?? 0) > 0 && (
                    <span className="text-foreground font-medium ml-auto">
                      {formatCurrency(stats.totalValue)}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Company</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Industry</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Contacts</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Deals</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(company => {
                const stats = companyStats[company.id]
                return (
                  <tr key={company.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/companies/${company.id}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{company.name}</span>
                          {company.domain && <div className="text-xs text-muted-foreground">{company.domain}</div>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{company.industry ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground text-center">{stats?.contactCount ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground text-center">{stats?.dealCount ?? 0}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground text-right">
                      {(stats?.totalValue ?? 0) > 0 ? formatCurrency(stats.totalValue) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddCompanyDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  )
}
