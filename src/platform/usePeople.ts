import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, toConnectionStatus, parseMessageMetadata } from 'deepspace'
import type { Person, PersonType, PersonStatus } from './types'

function toPerson(r: { recordId: string; data: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string }): Person {
  const d = r.data
  return {
    id: r.recordId,
    name: (d.Name as string) ?? '',
    email: (d.Email as string) ?? null,
    department: (d.Department as string) ?? null,
    title: (d.Title as string) ?? null,
    type: (d.Type as PersonType) ?? 'contact',
    status: (d.Status as PersonStatus) ?? 'active',
    companyId: (d.CompanyId as string) ?? null,
    lastContactedAt: (d.LastContactedAt as string) ?? null,
    metadata: parseMessageMetadata(d.Metadata),
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export function usePeople() {
  const { records, status: queryStatus } = useQuery<Record<string, unknown>>('people')
  const { create, put, remove } = useMutations<Record<string, unknown>>('people')

  const people = useMemo<Person[]>(
    () => records.map(toPerson),
    [records],
  )

  const status = useMemo(() => toConnectionStatus(queryStatus), [queryStatus])

  const addPerson = useCallback(async (data: Partial<Omit<Person, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => {
    await create({
      Name: data.name ?? '',
      Email: data.email ?? null,
      Department: data.department ?? null,
      Title: data.title ?? null,
      Type: data.type ?? 'contact',
      Status: data.status ?? 'active',
      CompanyId: data.companyId ?? null,
      LastContactedAt: data.lastContactedAt ?? null,
      Metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    })
  }, [create])

  const updatePerson = useCallback(async (id: string, changes: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      const colName = key.charAt(0).toUpperCase() + key.slice(1)
      mapped[colName] = key === 'metadata' ? (value ? JSON.stringify(value) : null) : value
    }
    await put(id, mapped)
  }, [put])

  const removePerson = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  return { people, status, addPerson, updatePerson, removePerson }
}
