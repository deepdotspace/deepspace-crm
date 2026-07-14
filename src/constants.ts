/** App name — replaced by the CLI during scaffolding */
export const APP_NAME = 'deepspace-crm'
/** Immutable app identity — data scope keys to this, so renames never
 *  strand your records. Legacy app: the backfilled id equals the name.
 *  Must match DEEPSPACE_APP_ID in wrangler.toml. */
export const APP_ID = 'deepspace-crm'

/** Primary scope ID for the app's RecordRoom DO */
export const SCOPE_ID = `app:${APP_ID}`

/** Roles and display config — imported from SDK (single source of truth) */
export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'

/** Default pipeline stages bootstrapped on first connect */
export const PIPELINE_STAGES_BOOTSTRAP = [
  { name: 'Lead', position: 0, color: '#94a3b8', default_probability: 10 },
  { name: 'Qualified', position: 1, color: '#60a5fa', default_probability: 25 },
  { name: 'Proposal', position: 2, color: '#a78bfa', default_probability: 50 },
  { name: 'Negotiation', position: 3, color: '#f59e0b', default_probability: 75 },
  { name: 'Closed Won', position: 4, color: '#10b981', default_probability: 100 },
  { name: 'Closed Lost', position: 5, color: '#ef4444', default_probability: 0 },
]
