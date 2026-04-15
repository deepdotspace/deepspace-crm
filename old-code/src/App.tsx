import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { useUser } from '@spaces/sdk/storage'
import { AppSwitcherTrigger } from '@spaces/sdk/app-switcher'
import { useGoogleConnector } from '@spaces/sdk/connectors'
import { CrmPlatformProvider, useCrm } from './platform/CrmPlatformProvider'
import {
  LayoutDashboard, Users, Building2, CircleDollarSign, Activity,
  Plus, Search, Settings, ChevronRight, Mail, CheckCircle2,
  ExternalLink, Send,
} from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'

import DashboardPage from './pages/DashboardPage'
import ContactsPage from './pages/ContactsPage'
import ContactDetailPage from './pages/ContactDetailPage'
import CompaniesPage from './pages/CompaniesPage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import DealsPage from './pages/DealsPage'
import DealDetailPage from './pages/DealDetailPage'
import ActivitiesPage from './pages/ActivitiesPage'
import EmailPage from './pages/EmailPage'

// ============================================================================
// Navigation Config
// ============================================================================

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/companies', label: 'Companies', icon: Building2 },
  { path: '/deals', label: 'Deals', icon: CircleDollarSign },
  { path: '/email', label: 'Email', icon: Send },
  { path: '/activities', label: 'Activities', icon: Activity },
] as const

// ============================================================================
// Quick Add Menu
// ============================================================================

function QuickAddMenu({ onSelect }: { onSelect: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { label: 'Contact', type: 'contact', path: '/contacts' },
    { label: 'Company', type: 'company', path: '/companies' },
    { label: 'Deal', type: 'deal', path: '/deals' },
    { label: 'Activity', type: 'activity', path: '/activities' },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>Quick Add</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
          {items.map(item => (
            <button
              key={item.type}
              onClick={() => { onSelect(item.type); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary/50 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sidebar
// ============================================================================

function GmailConnector() {
  const { isGmailConnected, isLoading, connect, disconnect, isDisconnecting, refreshStatus } = useGoogleConnector()
  const [isConnecting, setIsConnecting] = useState(false)

  // Re-check status when tab regains focus (after OAuth in new tab)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshStatus()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refreshStatus])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      const authUrl = await connect('gmail')
      if (authUrl) window.open(authUrl, '_blank', 'noopener')
    } catch (err) {
      console.error('[CRM] Gmail connect error:', err)
    } finally {
      setIsConnecting(false)
    }
  }, [connect])

  const handleDisconnect = useCallback(async () => {
    if (!confirm('Disconnect Gmail?')) return
    await disconnect()
  }, [disconnect])

  if (isLoading) return null

  return (
    <div className="px-3 pb-2">
      <div className="px-3 py-2 rounded-lg border border-border/50 bg-secondary/20">
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">Gmail</span>
          {isGmailConnected ? (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex items-center gap-1 text-[10px] text-success hover:text-destructive transition-colors"
              title="Click to disconnect"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{isDisconnecting ? '...' : 'Connected'}</span>
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-1 pl-5.5">
          Send emails from your Gmail account
        </p>
      </div>
    </div>
  )
}

function DeepSpaceEmailStatus() {
  const { emailAddress, hasEmail, isEmailLoading, refreshEmailStatus } = useCrm()

  // Re-check when tab regains focus (after setting up email in another tab)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshEmailStatus()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refreshEmailStatus])

  if (isEmailLoading) return null

  return (
    <div className="px-3 pb-2">
      <div className="px-3 py-2 rounded-lg border border-border/50 bg-secondary/20">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">DS Email</span>
          {hasEmail ? (
            <span className="flex items-center gap-1 text-[10px] text-success">
              <CheckCircle2 className="w-3 h-3" />
              <span>Active</span>
            </span>
          ) : (
            <button
              onClick={() => window.open('https://mail.app.space', '_blank', 'noopener')}
              className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
            >
              Set Up
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        {hasEmail && emailAddress ? (
          <p className="text-[10px] text-muted-foreground/70 mt-1 pl-5.5 truncate">
            {emailAddress}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground/70 mt-1 pl-5.5">
            Send emails from your CRM
          </p>
        )}
      </div>
    </div>
  )
}

function Sidebar({ onQuickAdd }: { onQuickAdd: (type: string) => void }) {
  const { user } = useUser()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      data-testid="sidebar"
      className="w-[220px] flex-shrink-0 bg-card/50 border-r border-border flex flex-col h-full"
    >
      {/* Brand */}
      <AppSwitcherTrigger>
        <div className="px-4 h-14 flex items-center gap-2.5 border-b border-border/50 w-full">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
            <CircleDollarSign className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">CRM</span>
        </div>
      </AppSwitcherTrigger>

      {/* Quick Add */}
      <div className="px-3 pt-3 pb-1">
        <QuickAddMenu onSelect={onQuickAdd} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* Email Integration */}
      <DeepSpaceEmailStatus />
      <GmailConnector />

      {/* User */}
      {user && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/30">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full ring-1 ring-border" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{user.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{user.email ?? ''}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

// ============================================================================
// App
// ============================================================================

function AppInner() {
  const { isLoading } = useUser()
  const [quickAddType, setQuickAddType] = useState<string | null>(null)

  const handleQuickAdd = useCallback((type: string) => {
    setQuickAddType(type)
  }, [])

  const clearQuickAdd = useCallback(() => {
    setQuickAddType(null)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading CRM...</span>
        </div>
      </div>
    )
  }

  return (
    <CrmPlatformProvider>
      <div
        data-testid="app-root"
        className="bg-background overflow-hidden flex"
        style={{
          height: 'calc(100vh - var(--mobile-header-height, 0px))',
          marginTop: 'var(--mobile-header-height, 0px)',
        }}
      >
        <Sidebar onQuickAdd={handleQuickAdd} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contacts" element={<ContactsPage quickAdd={quickAddType === 'contact'} onQuickAddDone={clearQuickAdd} />} />
            <Route path="/contacts/:id" element={<ContactDetailPage />} />
            <Route path="/companies" element={<CompaniesPage quickAdd={quickAddType === 'company'} onQuickAddDone={clearQuickAdd} />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/deals" element={<DealsPage quickAdd={quickAddType === 'deal'} onQuickAddDone={clearQuickAdd} />} />
            <Route path="/deals/:id" element={<DealDetailPage />} />
            <Route path="/email" element={<EmailPage />} />
            <Route path="/activities" element={<ActivitiesPage quickAdd={quickAddType === 'activity'} onQuickAddDone={clearQuickAdd} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </CrmPlatformProvider>
  )
}

export default function App() {
  return <AppInner />
}
