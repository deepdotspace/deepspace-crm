import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCrm } from '../platform/CrmPlatformProvider'
import { Button, Badge } from '../components/ui'
import { AddContactDialog } from '../components/AddContactDialog'
import { ComposeEmailDialog } from '../components/ComposeEmailDialog'
import {
  Plus, Search, Building2, Mail, Phone, Calendar,
  Users, Filter, ArrowUpDown, ChevronRight, Send,
} from 'lucide-react'
import type { Person } from '../platform/types'

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

const AVATAR_COLORS = [
  'bg-primary/20 text-primary',
  'bg-success/20 text-success',
  'bg-warning/20 text-warning',
  'bg-info/20 text-info',
  'bg-purple-500/20 text-purple-400',
  'bg-pink-500/20 text-pink-400',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function ContactsPage() {
  const { people, companies, deals, dealContacts, activities } = useCrm()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'company'>('name')
  const [emailTarget, setEmailTarget] = useState<{ email: string; name: string; id: string; companyId?: string } | null>(null)

  const companyMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of companies) map[c.id] = c.name
    return map
  }, [companies])

  // Count deals per contact
  const dealCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const dc of dealContacts) {
      map[dc.contactId] = (map[dc.contactId] ?? 0) + 1
    }
    return map
  }, [dealContacts])

  // Last activity per contact
  const lastActivityMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of activities) {
      if (a.contactId && (!map[a.contactId] || a.createdAt > map[a.contactId])) {
        map[a.contactId] = a.createdAt
      }
    }
    return map
  }, [activities])

  const filtered = useMemo(() => {
    let result = people
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q) ||
        (p.companyId && companyMap[p.companyId]?.toLowerCase().includes(q)),
      )
    }
    if (typeFilter !== 'all') {
      result = result.filter(p => p.type === typeFilter)
    }
    // Sort
    switch (sortBy) {
      case 'recent':
        result = [...result].sort((a, b) => {
          const aDate = lastActivityMap[a.id] || a.createdAt
          const bDate = lastActivityMap[b.id] || b.createdAt
          return new Date(bDate).getTime() - new Date(aDate).getTime()
        })
        break
      case 'company':
        result = [...result].sort((a, b) => {
          const aCompany = a.companyId ? companyMap[a.companyId] ?? '' : ''
          const bCompany = b.companyId ? companyMap[b.companyId] ?? '' : ''
          return aCompany.localeCompare(bCompany) || a.name.localeCompare(b.name)
        })
        break
      default:
        result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    }
    return result
  }, [people, search, typeFilter, sortBy, companyMap, lastActivityMap])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: people.length }
    for (const p of people) {
      counts[p.type] = (counts[p.type] ?? 0) + 1
    }
    return counts
  }, [people])

  return (
    <div data-testid="contacts-page" className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">{people.length} total contacts</p>
        </div>
        <Button data-testid="add-contact-btn" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add Contact
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-testid="contact-search"
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Type filter pills */}
        <div className="flex gap-1">
          {['all', 'contact', 'customer', 'employee', 'vendor'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                typeFilter === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              <span className="ml-1 opacity-60">{typeCounts[t] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <button
          onClick={() => setSortBy(prev => prev === 'name' ? 'recent' : prev === 'recent' ? 'company' : 'name')}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortBy === 'name' ? 'A-Z' : sortBy === 'recent' ? 'Recent' : 'Company'}
        </button>
      </div>

      {/* Contact list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? 'No contacts match your search' : 'No contacts yet'}
          </p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add your first contact
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(person => {
            const company = person.companyId ? companyMap[person.companyId] : null
            const dealCount = dealCountMap[person.id] ?? 0
            const lastActivity = lastActivityMap[person.id]
            const avatarColor = getAvatarColor(person.name)

            return (
              <Link
                key={person.id}
                to={`/contacts/${person.id}`}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-secondary/20 transition-colors group"
              >
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor}`}>
                  {getInitials(person.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{person.name}</span>
                    {person.status !== 'active' && (
                      <Badge variant="secondary" className="text-[10px]">{person.status}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {person.title && (
                      <span className="text-xs text-muted-foreground truncate">{person.title}</span>
                    )}
                    {company && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-2.5 h-2.5" />
                        {company}
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  {person.email && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setEmailTarget({
                          email: person.email!,
                          name: person.name,
                          id: person.id,
                          companyId: person.companyId ?? undefined,
                        })
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors hidden lg:block"
                      title={`Email ${person.name}`}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {dealCount > 0 && (
                    <span className="text-xs text-muted-foreground">{dealCount} deal{dealCount > 1 ? 's' : ''}</span>
                  )}
                  {lastActivity && (
                    <span className="text-xs text-muted-foreground w-16 text-right">{timeAgo(lastActivity)}</span>
                  )}
                  <Badge
                    variant="secondary"
                    className="text-[10px] capitalize w-16 text-center"
                  >
                    {person.type}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <AddContactDialog open={showAdd} onClose={() => setShowAdd(false)} />

      <ComposeEmailDialog
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        prefillTo={emailTarget?.email}
        contactName={emailTarget?.name}
        contactId={emailTarget?.id}
        companyId={emailTarget?.companyId}
      />
    </div>
  )
}
