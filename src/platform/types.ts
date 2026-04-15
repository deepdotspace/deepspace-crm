export { type ConnectionStatus } from 'deepspace'

// ── Companies ─────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  domain: string | null
  industry: string | null
  size: string | null
  address: string | null
  website: string | null
  notes: string | null
  ownerId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Pipeline Stages ───────────────────────────────────────────────────────

export interface PipelineStage {
  id: string
  name: string
  position: number
  color: string
  defaultProbability: number
}

// ── Deals ─────────────────────────────────────────────────────────────────

export type DealStatus = 'open' | 'won' | 'lost' | 'stale'
export type DealSource = 'inbound' | 'outbound' | 'referral' | 'partner' | 'other'

export interface Deal {
  id: string
  title: string
  companyId: string | null
  stageId: string | null
  amount: number
  currency: string
  closeDate: string | null
  probability: number
  ownerId: string | null
  status: DealStatus
  lossReason: string | null
  source: DealSource | null
  notes: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Activities ────────────────────────────────────────────────────────────

export type ActivityType = 'email' | 'call' | 'meeting' | 'note' | 'task'

export interface Activity {
  id: string
  type: ActivityType
  title: string
  description: string | null
  contactId: string | null
  companyId: string | null
  dealId: string | null
  conversationId: string | null
  eventId: string | null
  taskId: string | null
  completedAt: string | null
  dueAt: string | null
  ownerId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Deal Contacts ─────────────────────────────────────────────────────────

export type DealContactRole = 'decision_maker' | 'influencer' | 'champion' | 'blocker' | 'user'

export interface DealContact {
  id: string
  dealId: string
  contactId: string
  role: DealContactRole
}

// ── People ────────────────────────────────────────────────────────────────

export type PersonType = 'employee' | 'customer' | 'vendor' | 'contact'
export type PersonStatus = 'active' | 'inactive' | 'archived'

export interface Person {
  id: string
  name: string
  email: string | null
  department: string | null
  title: string | null
  type: PersonType
  status: PersonStatus
  companyId: string | null
  lastContactedAt: string | null
  metadata: Record<string, unknown> | null
  createdBy: string
  createdAt: string
  updatedAt: string
}
