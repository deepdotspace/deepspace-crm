/**
 * useGoogleContacts — read the signed-in user's Google Contacts (People API,
 * contacts.readonly scope) so they can be imported into the CRM.
 *
 * Rides the SDK `google/contacts-list` endpoint through `withGoogleConsent`,
 * so the first import transparently prompts for the contacts.readonly grant
 * (Google incremental auth) and replays once — no popup code at the call site.
 *
 * Read-only: this hook never writes back to Google. Importing creates local
 * CRM `people` records only.
 *
 * SECURITY: invoked only from an explicit user gesture (the Import dialog). Not
 * exposed to the AI agent surface (src/ai/tools.ts only wraps read-only
 * BUILT_IN_TOOLS and never calls integration.post).
 */

import { useState, useCallback } from 'react'
import { withGoogleConsent } from './googleConsent'

export interface GoogleContact {
  /** People API resource name, e.g. "people/c123" — stable id for dedupe/sync. */
  resourceName: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  title: string | null
  department: string | null
  notes: string | null
}

interface PeoplePerson {
  resourceName?: string
  names?: Array<{ displayName?: string }>
  emailAddresses?: Array<{ value?: string }>
  phoneNumbers?: Array<{ value?: string }>
  organizations?: Array<{ name?: string; title?: string; department?: string }>
  occupations?: Array<{ value?: string }>
  biographies?: Array<{ value?: string }>
}

interface PeoplePayload {
  connections?: PeoplePerson[]
  totalPeople?: number
}

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,occupations,biographies'

function first<T>(arr?: T[]): T | undefined {
  return arr && arr.length > 0 ? arr[0] : undefined
}

function mapPerson(p: PeoplePerson): GoogleContact {
  const org = first(p.organizations) ?? {}
  return {
    resourceName: p.resourceName ?? '',
    name: first(p.names)?.displayName ?? '',
    email: first(p.emailAddresses)?.value ?? null,
    phone: first(p.phoneNumbers)?.value ?? null,
    company: org.name ?? null,
    title: org.title ?? first(p.occupations)?.value ?? null,
    department: org.department ?? null,
    notes: first(p.biographies)?.value ?? null,
  }
}

export interface FetchContactsResult {
  contacts: GoogleContact[]
  /** User dismissed the consent popup without granting. */
  cancelled?: boolean
  error?: string
}

export function useGoogleContacts() {
  const [loading, setLoading] = useState(false)

  const fetchContacts = useCallback(async (): Promise<FetchContactsResult> => {
    setLoading(true)
    try {
      const res = await withGoogleConsent('google/contacts-list', {
        personFields: PERSON_FIELDS,
        pageSize: 1000,
      })
      if (!res.success) {
        return { contacts: [], cancelled: res.cancelled, error: res.cancelled ? undefined : res.error }
      }
      const payload = (res.data ?? {}) as PeoplePayload
      const contacts = (payload.connections ?? [])
        .map(mapPerson)
        // A People connection with neither a name nor an email isn't useful as
        // a CRM contact — drop it.
        .filter((c) => c.name || c.email)
      return { contacts }
    } finally {
      setLoading(false)
    }
  }, [])

  return { fetchContacts, loading }
}
