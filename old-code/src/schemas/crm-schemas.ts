/**
 * CRM Table-Mode Schemas
 *
 * Defines shared business collections with typed columns.
 * These are registered with the platform worker's SharedRecordRoom
 * and stored in real SQL tables (table-mode).
 */

import type { CollectionSchema } from '@spaces/sdk/worker'

export const companiesSchema: CollectionSchema = {
  name: 'companies',
  columns: [
    { name: 'Name', storage: 'text', interpretation: 'plain' },
    { name: 'Domain', storage: 'text', interpretation: 'plain' },
    { name: 'Industry', storage: 'text', interpretation: 'plain' },
    { name: 'Size', storage: 'text', interpretation: 'plain' },
    { name: 'Address', storage: 'text', interpretation: 'plain' },
    { name: 'Website', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'Notes', storage: 'text', interpretation: 'plain' },
    { name: 'OwnerId', storage: 'text', interpretation: 'plain' },
  ],
  ownerField: 'OwnerId',
  permissions: {
    '*': { read: true, create: true, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const dealsSchema: CollectionSchema = {
  name: 'deals',
  columns: [
    { name: 'Title', storage: 'text', interpretation: 'plain' },
    { name: 'CompanyId', storage: 'text', interpretation: 'plain' },
    { name: 'StageId', storage: 'text', interpretation: 'plain' },
    { name: 'Amount', storage: 'number', interpretation: { kind: 'currency', symbol: '$', decimals: 2 } },
    { name: 'Currency', storage: 'text', interpretation: 'plain' },
    { name: 'CloseDate', storage: 'text', interpretation: { kind: 'date' } },
    { name: 'Probability', storage: 'number', interpretation: { kind: 'percent', decimals: 0 } },
    { name: 'OwnerId', storage: 'text', interpretation: 'plain' },
    { name: 'Status', storage: 'text', interpretation: { kind: 'select', options: ['open', 'won', 'lost', 'stale'] } },
    { name: 'LossReason', storage: 'text', interpretation: 'plain' },
    { name: 'Source', storage: 'text', interpretation: { kind: 'select', options: ['inbound', 'outbound', 'referral', 'partner', 'other'] } },
    { name: 'Notes', storage: 'text', interpretation: 'plain' },
  ],
  ownerField: 'OwnerId',
  permissions: {
    '*': { read: true, create: true, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const pipelineStagesSchema: CollectionSchema = {
  name: 'pipeline_stages',
  columns: [
    { name: 'Name', storage: 'text', interpretation: 'plain' },
    { name: 'Position', storage: 'number', interpretation: 'plain' },
    { name: 'Color', storage: 'text', interpretation: 'plain' },
    { name: 'DefaultProbability', storage: 'number', interpretation: { kind: 'percent', decimals: 0 } },
  ],
  permissions: {
    '*': { read: true, create: true, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const activitiesSchema: CollectionSchema = {
  name: 'activities',
  columns: [
    { name: 'Type', storage: 'text', interpretation: { kind: 'select', options: ['email', 'call', 'meeting', 'note', 'task'] } },
    { name: 'Title', storage: 'text', interpretation: 'plain' },
    { name: 'Description', storage: 'text', interpretation: 'plain' },
    { name: 'ContactId', storage: 'text', interpretation: 'plain' },
    { name: 'CompanyId', storage: 'text', interpretation: 'plain' },
    { name: 'DealId', storage: 'text', interpretation: 'plain' },
    { name: 'ConversationId', storage: 'text', interpretation: 'plain' },
    { name: 'EventId', storage: 'text', interpretation: 'plain' },
    { name: 'TaskId', storage: 'text', interpretation: 'plain' },
    { name: 'CompletedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'DueAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'OwnerId', storage: 'text', interpretation: 'plain' },
  ],
  ownerField: 'OwnerId',
  permissions: {
    '*': { read: true, create: true, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

// People schema lives in workspace:default (see workspace-schemas.ts).
// CRM connects to it via SHARED_CONNECTIONS in constants.ts.

export const dealContactsSchema: CollectionSchema = {
  name: 'deal_contacts',
  columns: [
    { name: 'DealId', storage: 'text', interpretation: 'plain' },
    { name: 'ContactId', storage: 'text', interpretation: 'plain' },
    { name: 'Role', storage: 'text', interpretation: { kind: 'select', options: ['decision_maker', 'influencer', 'champion', 'blocker', 'user'] } },
  ],
  permissions: {
    '*': { read: true, create: true, update: true, delete: true },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const crmPlatformSchemas: CollectionSchema[] = [
  companiesSchema,
  dealsSchema,
  pipelineStagesSchema,
  activitiesSchema,
  dealContactsSchema,
]
