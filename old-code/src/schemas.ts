/**
 * Collection Schemas
 * 
 * Defines all collections with fields and RBAC permissions.
 * This is the SINGLE SOURCE OF TRUTH - imported by both worker and frontend.
 * 
 * Roles (stored on user records):
 * - viewer: Read-only access (default for new users)
 * - member: Can create and edit own content
 * - admin: Full access (automatically assigned to global admins)
 * 
 * To add features, copy schema files to src/schemas/ then import:
 *   import { itemsSchema } from './schemas/items-schema'
 *   import { challengesSchema } from './schemas/tasks-schema'
 *   import { teamsSchemas } from './schemas/teams-schema'
 */

import type { CollectionSchema } from '@spaces/sdk/worker'
import { USERS_COLLECTION_FIELDS, ADMIN_SETTINGS_SCHEMA as settingsSchema } from '@spaces/sdk/worker'
import { crmPlatformSchemas } from './schemas/crm-schemas'

// ============================================================================
// Users Collection (required)
// ============================================================================

const usersSchema: CollectionSchema = {
  name: 'users',
  fields: {
    ...USERS_COLLECTION_FIELDS,
  },
  permissions: {
    viewer: { 
      read: 'own',
      create: false,
      update: 'own', 
      delete: false,
      writableFields: [],
    },
    member: { 
      read: true,
      create: false,
      update: 'own', 
      delete: false,
      writableFields: [],
    },
    admin: { read: true, create: false, update: true, delete: true },
  },
}

// ============================================================================
// Export all schemas
// ============================================================================

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  ...crmPlatformSchemas,
]
