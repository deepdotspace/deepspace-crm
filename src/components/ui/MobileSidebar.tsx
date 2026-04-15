/**
 * MobileSidebar — shared mobile navigation primitives.
 *
 * Provides a context + hook to toggle a sidebar overlay on mobile,
 * a hamburger button, and a backdrop. The sidebar itself is styled
 * via Tailwind responsive classes on the existing <aside>.
 *
 * Usage:
 *   1. Wrap your app (inside Router) with <MobileSidebarProvider>
 *   2. On your sidebar <aside>, add:
 *        className="fixed bottom-0 left-0 z-50 -translate-x-full
 *                   transition-transform duration-200
 *                   md:static md:translate-x-0 md:z-auto"
 *      and conditionally add "translate-x-0" when isOpen.
 *   3. Render <SidebarBackdrop /> next to the sidebar.
 *   4. Put <MobileMenuButton /> in your header.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/* ── Context ─────────────────────────────────────────────── */

interface MobileSidebarContextType {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const MobileSidebarCtx = createContext<MobileSidebarContextType>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
})

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const { pathname } = useLocation()

  // Auto-close on navigation
  useEffect(() => setIsOpen(false), [pathname])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return (
    <MobileSidebarCtx.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </MobileSidebarCtx.Provider>
  )
}

export const useMobileSidebar = () => useContext(MobileSidebarCtx)

/* ── Hamburger button (mobile only) ─────────────────────── */

export function MobileMenuButton({ className = '' }: { className?: string }) {
  const { toggle } = useMobileSidebar()
  return (
    <button
      onClick={toggle}
      className={`md:hidden p-1.5 rounded hover:bg-white/10 transition-colors ${className}`}
      aria-label="Toggle sidebar"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  )
}

/* ── Backdrop overlay (mobile only) ──────────────────────── */

export function SidebarBackdrop() {
  const { isOpen, close } = useMobileSidebar()
  return (
    <div
      className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-200 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={close}
    />
  )
}
