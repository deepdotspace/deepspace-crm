/**
 * Navigation Config
 *
 * Add one entry per nav item. Routes are handled by generouted
 * (file-based routing in src/pages/), this just controls what
 * appears in the navigation bar.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
}

export const nav: NavItem[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/contacts', label: 'Contacts' },
  { path: '/companies', label: 'Companies' },
  { path: '/deals', label: 'Deals' },
  { path: '/email', label: 'Email' },
  { path: '/activities', label: 'Activities' },
  // ── Features add nav items below this line ──
]
