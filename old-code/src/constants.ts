import type { BadgeProps } from './components/ui'

type BadgeVariant = NonNullable<BadgeProps['variant']>

export const APP_ID = __APP_ID__
export const SCOPE_ID = `app:${APP_ID}`

/** Shared DO connections — people data lives in workspace:default. */
export const SHARED_CONNECTIONS: { type: string; instanceId?: string }[] = [
  { type: 'workspace', instanceId: 'default' },
]

import { ROLES, type Role } from '@spaces/sdk/worker'
export { ROLES, type Role }

export const ROLE_CONFIG: Record<Role, { title: string; badgeVariant: BadgeVariant; description: string }> = {
  [ROLES.VIEWER]: {
    title: 'Viewer',
    badgeVariant: 'secondary',
    description: 'Read-only access',
  },
  [ROLES.MEMBER]: {
    title: 'Member',
    badgeVariant: 'default',
    description: 'Can create and edit own content',
  },
  [ROLES.ADMIN]: {
    title: 'Admin',
    badgeVariant: 'warning',
    description: 'Full access to all features',
  },
}

export const PIPELINE_STAGES_BOOTSTRAP = [
  { name: 'Lead', position: 0, color: '#94a3b8', default_probability: 10 },
  { name: 'Qualified', position: 1, color: '#60a5fa', default_probability: 25 },
  { name: 'Proposal', position: 2, color: '#a78bfa', default_probability: 50 },
  { name: 'Negotiation', position: 3, color: '#f59e0b', default_probability: 75 },
  { name: 'Closed Won', position: 4, color: '#10b981', default_probability: 100 },
  { name: 'Closed Lost', position: 5, color: '#ef4444', default_probability: 0 },
]
