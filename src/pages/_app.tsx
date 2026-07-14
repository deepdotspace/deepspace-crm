/**
 * App — global providers + shell.
 *
 * Generouted renders this around all routes.
 * Providers → auth gate → nav + page outlet.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuth, useAuthUser, AuthOverlay } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import { ToastProvider } from '../components/ui'
import Navigation from '../components/Navigation'
import { CrmPlatformProvider } from '../platform/CrmPlatformProvider'
import { APP_ID } from '../constants'
import { schemas } from '../schemas'

// Routes that render WITHOUT auth or the RecordRoom mounted. Required so
// Google's OAuth verification reviewer can fetch /privacy and /terms
// anonymously from the consent-screen links, and so users who hit those
// links from outside the app don't get bounced to a sign-in modal.
const PUBLIC_PATHS = new Set(['/privacy', '/terms'])

export default function App() {
  const location = useLocation()
  const isPublic = PUBLIC_PATHS.has(location.pathname)

  // Public legal pages render outside AuthGate / RecordScope. They don't
  // need the CRM data layer, and they MUST be reachable without sign-in.
  if (isPublic) {
    return (
      <ToastProvider>
        <DeepSpaceAuthProvider>
          <div className="min-h-screen flex flex-col bg-background">
            <main className="flex-1">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                <Outlet />
              </Suspense>
            </main>
            <LegalFooter />
          </div>
        </DeepSpaceAuthProvider>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <DeepSpaceAuthProvider>
        <AuthGate>
          <CrmPlatformProvider>
            <div className="flex h-screen flex-col bg-background overflow-hidden">
              <Navigation />
              <main className="flex-1 overflow-y-auto min-h-0">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <Outlet />
                </Suspense>
                {/* Legal footer — required by Google OAuth verification.
                    The Privacy / Terms links must be reachable from every
                    page so the consent-screen URLs resolve to live pages
                    the assessor can review. */}
                <LegalFooter />
              </main>
            </div>
          </CrmPlatformProvider>
        </AuthGate>
      </DeepSpaceAuthProvider>
    </ToastProvider>
  )
}

function LegalFooter() {
  return (
    <footer className="border-t border-border bg-card/40 mt-8 px-4 sm:px-6 lg:px-8 py-4 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <span>© {new Date().getFullYear()} DeepSpace</span>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  )
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()
  // useAuthUser is the auth-layer hook — it reads the JWT directly and
  // doesn't depend on RecordProvider, so it's safe to call up here
  // (where RecordProvider hasn't mounted yet). useUser, by contrast,
  // queries the records system and must run *inside* RecordProvider.
  const { isSignedIn, user } = useAuthUser()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  // Sign-in is required. The CRM stores per-user data and exposing it
  // anonymously would leak everyone's contacts/deals/etc. to anyone who
  // finds the URL. AuthOverlay opens the sign-in modal in front of the
  // background; on completion the page re-renders with isSignedIn true.
  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <AuthOverlay onClose={() => { /* sign-in is required, no close */ }} />
      </div>
    )
  }

  // Wait for the auth user to materialize before opening the room —
  // we key the RecordRoom on the user's id so the data is isolated
  // per-account rather than shared across every signed-in user.
  if (!user?.id) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading account…
      </div>
    )
  }

  // Per-user RecordRoom: each user's CRM data lives in its own DO
  // instance keyed by their userId. Cross-user access requires hitting
  // a different DO (the worker's wsRoute reads roomId from the URL but
  // the SDK is the only thing that writes the URL — and it always
  // writes the user's own scope here). Belt-and-suspenders alongside
  // schema-level permissions.
  const roomId = `app:${APP_ID}:user:${user.id}`

  return (
    <RecordProvider>
      <RecordScope roomId={roomId} schemas={schemas} appId={APP_ID}>
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
