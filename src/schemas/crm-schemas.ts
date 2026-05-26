/**
 * CRM Table-Mode Schemas
 *
 * Defines CRM business collections with typed columns.
 * Stored in real SQL tables (table-mode) inside the app's RecordRoom DO.
 */

import type { CollectionSchema } from 'deepspace/worker'

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
    { name: 'OwnerId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'OwnerId',
  permissions: {
    // Per-user CRM rooms: the room owner is the user themselves
    // (derived from the per-user roomId in worker.ts AppRecordRoom).
    // Only the owner has access; other roles, including anonymous,
    // are implicitly denied because no '*' wildcard is set.
    owner: { read: true, create: true, update: true, delete: true },
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
    { name: 'OwnerId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'Status', storage: 'text', interpretation: { kind: 'select', options: ['open', 'won', 'lost', 'stale'] } },
    { name: 'LossReason', storage: 'text', interpretation: 'plain' },
    { name: 'Source', storage: 'text', interpretation: { kind: 'select', options: ['inbound', 'outbound', 'referral', 'partner', 'other'] } },
    { name: 'Notes', storage: 'text', interpretation: 'plain' },
  ],
  ownerField: 'OwnerId',
  permissions: {
    // Per-user CRM rooms: the room owner is the user themselves
    // (derived from the per-user roomId in worker.ts AppRecordRoom).
    // Only the owner has access; other roles, including anonymous,
    // are implicitly denied because no '*' wildcard is set.
    owner: { read: true, create: true, update: true, delete: true },
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
    // Per-user CRM rooms: the room owner is the user themselves
    // (derived from the per-user roomId in worker.ts AppRecordRoom).
    // Only the owner has access; other roles, including anonymous,
    // are implicitly denied because no '*' wildcard is set.
    owner: { read: true, create: true, update: true, delete: true },
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
    { name: 'OwnerId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'OwnerId',
  permissions: {
    // Per-user CRM rooms: the room owner is the user themselves
    // (derived from the per-user roomId in worker.ts AppRecordRoom).
    // Only the owner has access; other roles, including anonymous,
    // are implicitly denied because no '*' wildcard is set.
    owner: { read: true, create: true, update: true, delete: true },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const dealContactsSchema: CollectionSchema = {
  name: 'deal_contacts',
  columns: [
    { name: 'DealId', storage: 'text', interpretation: 'plain' },
    { name: 'ContactId', storage: 'text', interpretation: 'plain' },
    { name: 'Role', storage: 'text', interpretation: { kind: 'select', options: ['decision_maker', 'influencer', 'champion', 'blocker', 'user'] } },
  ],
  permissions: {
    // Same model as the other CRM collections — owner-only.
    owner: { read: true, create: true, update: true, delete: true },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const peopleSchema: CollectionSchema = {
  name: 'people',
  columns: [
    { name: 'Name', storage: 'text', interpretation: 'plain' },
    { name: 'Email', storage: 'text', interpretation: 'plain' },
    { name: 'Department', storage: 'text', interpretation: 'plain' },
    { name: 'Title', storage: 'text', interpretation: 'plain' },
    { name: 'Type', storage: 'text', interpretation: { kind: 'select', options: ['employee', 'customer', 'vendor', 'contact'] } },
    { name: 'Status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'inactive', 'archived'] } },
    { name: 'CompanyId', storage: 'text', interpretation: 'plain' },
    { name: 'LastContactedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'Metadata', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    // Per-user CRM rooms: the room owner is the user themselves
    // (derived from the per-user roomId in worker.ts AppRecordRoom).
    // Only the owner has access; other roles, including anonymous,
    // are implicitly denied because no '*' wildcard is set.
    owner: { read: true, create: true, update: true, delete: true },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const crmSchemas: CollectionSchema[] = [
  companiesSchema,
  dealsSchema,
  pipelineStagesSchema,
  activitiesSchema,
  dealContactsSchema,
  peopleSchema,
]
