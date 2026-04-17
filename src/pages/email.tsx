/**
 * EmailPage — Shows sent email history (email activities) and provides
 * a compose button for quick email access.
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCrm } from '../platform/CrmPlatformProvider'
import { Button, Badge } from '../components/ui'
import { ComposeEmailDialog } from '../components/ComposeEmailDialog'
import {
  Send, Mail, Search, ExternalLink, Clock, Users, Building2,
  CircleDollarSign, Plus, Info,
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

export default function EmailPage() {
  const { activities, people, companies, deals, emailAddress, hasEmail, isEmailLoading } = useCrm()
  const [search, setSearch] = useState('')
  const [showCompose, setShowCompose] = useState(false)

  const emailActivities = useMemo(
    () => activities.filter(a => a.type === 'email'),
    [activities],
  )

  const filtered = useMemo(() => {
    if (!search) return emailActivities
    const q = search.toLowerCase()
    return emailActivities.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q),
    )
  }, [emailActivities, search])

  const nameMap = useMemo(() => {
    const map: Record<string, { type: 'contact' | 'company' | 'deal'; name: string }> = {}
    for (const p of people) map[p.id] = { type: 'contact', name: p.name }
    for (const c of companies) map[c.id] = { type: 'company', name: c.name }
    for (const d of deals) map[d.id] = { type: 'deal', name: d.title }
    return map
  }, [people, companies, deals])

  if (isEmailLoading) {
    return (
      <div data-testid="email-page" className="p-6 max-w-[800px] mx-auto">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Loading email status...
        </div>
      </div>
    )
  }

  if (!hasEmail) {
    return (
      <div data-testid="email-page" className="p-6 max-w-[800px] mx-auto">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Claim Your @app.space Handle</h2>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
            Email handles are managed in DeepSpace Mail. Claim your free
            @app.space address there and it will automatically light up
            this tab so you can send emails to your CRM contacts.
          </p>
          <Button
            onClick={() => window.open('https://deepspace-mail.app.space', '_blank', 'noopener')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open DeepSpace Mail
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="email-page" className="p-6 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Email</h1>
          <p className="text-sm text-muted-foreground">
            Sending from <span className="text-foreground font-medium">{emailAddress}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCompose(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Compose
        </Button>
      </div>

      {/* Inbound caveat */}
      <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Outbound only — replies from external mailboxes won't land back
          here. Use{' '}
          <a
            href="https://deepspace-mail.app.space"
            target="_blank"
            rel="noopener"
            className="text-primary hover:underline"
          >
            DeepSpace Mail
          </a>{' '}
          for two-way conversations.
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search sent emails..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Sent</div>
          <div className="text-2xl font-bold text-foreground">{emailActivities.length}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">This Week</div>
          <div className="text-2xl font-bold text-foreground">
            {emailActivities.filter(a => {
              const diff = Date.now() - new Date(a.createdAt).getTime()
              return diff < 7 * 86400000
            }).length}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Today</div>
          <div className="text-2xl font-bold text-primary">
            {emailActivities.filter(a => {
              const diff = Date.now() - new Date(a.createdAt).getTime()
              return diff < 86400000
            }).length}
          </div>
        </div>
      </div>

      {/* Email list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Send className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? 'No emails match your search' : 'No emails sent yet'}
          </p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setShowCompose(true)}>
              <Send className="w-3.5 h-3.5" />
              Send your first email
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border/50">
            {filtered.map(a => {
              const contact = a.contactId ? nameMap[a.contactId] : null
              const company = a.companyId ? nameMap[a.companyId] : null
              const deal = a.dealId ? nameMap[a.dealId] : null

              return (
                <div key={a.id} className="flex items-start gap-3 p-4 hover:bg-secondary/10 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Send className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {a.title.replace(/^Email:\s*/, '')}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(a.createdAt)}</span>
                    </div>
                    {a.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {contact && (
                        <Link
                          to={`/contacts/${a.contactId}`}
                          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                        >
                          <Users className="w-2.5 h-2.5" />
                          {contact.name}
                        </Link>
                      )}
                      {company && (
                        <Link
                          to={`/companies/${a.companyId}`}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          <Building2 className="w-2.5 h-2.5" />
                          {company.name}
                        </Link>
                      )}
                      {deal && (
                        <Link
                          to={`/deals/${a.dealId}`}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          <CircleDollarSign className="w-2.5 h-2.5" />
                          {deal.name}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ComposeEmailDialog open={showCompose} onClose={() => setShowCompose(false)} />
    </div>
  )
}
