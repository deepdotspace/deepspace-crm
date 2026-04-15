import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, toConnectionStatus } from '@spaces/sdk/storage'
import type { DealContact, DealContactRole } from './types'

function toDealContact(r: { recordId: string; data: Record<string, unknown> }): DealContact {
  const d = r.data
  return {
    id: r.recordId,
    dealId: (d.DealId as string) ?? '',
    contactId: (d.ContactId as string) ?? '',
    role: (d.Role as DealContactRole) ?? 'user',
  }
}

export function useDealContacts() {
  const { records, status: queryStatus } = useQuery<Record<string, unknown>>('deal_contacts')
  const { create, remove } = useMutations<Record<string, unknown>>('deal_contacts')

  const dealContacts = useMemo<DealContact[]>(
    () => records.map(toDealContact),
    [records],
  )

  const contactsByDeal = useMemo(() => {
    const map: Record<string, DealContact[]> = {}
    for (const dc of dealContacts) {
      if (!map[dc.dealId]) map[dc.dealId] = []
      map[dc.dealId].push(dc)
    }
    return map
  }, [dealContacts])

  const status = useMemo(() => toConnectionStatus(queryStatus), [queryStatus])

  const linkContact = useCallback(async (dealId: string, contactId: string, role: DealContactRole = 'user') => {
    await create({
      DealId: dealId,
      ContactId: contactId,
      Role: role,
    })
  }, [create])

  const unlinkContact = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  return { dealContacts, contactsByDeal, status, linkContact, unlinkContact }
}
