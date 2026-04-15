import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, toConnectionStatus } from 'deepspace'
import type { Company } from './types'

function toCompany(r: { recordId: string; data: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string }): Company {
  const d = r.data
  return {
    id: r.recordId,
    name: (d.Name as string) ?? '',
    domain: (d.Domain as string) ?? null,
    industry: (d.Industry as string) ?? null,
    size: (d.Size as string) ?? null,
    address: (d.Address as string) ?? null,
    website: (d.Website as string) ?? null,
    notes: (d.Notes as string) ?? null,
    ownerId: (d.OwnerId as string) ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export function useCompanies() {
  const { records, status: queryStatus } = useQuery<Record<string, unknown>>('companies')
  const { create, put, remove } = useMutations<Record<string, unknown>>('companies')

  const companies = useMemo<Company[]>(
    () => records.map(toCompany),
    [records],
  )

  const status = useMemo(() => toConnectionStatus(queryStatus), [queryStatus])

  const addCompany = useCallback(async (data: Partial<Omit<Company, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => {
    await create({
      Name: data.name ?? '',
      Domain: data.domain ?? null,
      Industry: data.industry ?? null,
      Size: data.size ?? null,
      Address: data.address ?? null,
      Website: data.website ?? null,
      Notes: data.notes ?? null,
      OwnerId: data.ownerId ?? null,
    })
  }, [create])

  const updateCompany = useCallback(async (id: string, changes: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      mapped[key.charAt(0).toUpperCase() + key.slice(1)] = value
    }
    await put(id, mapped)
  }, [put])

  const removeCompany = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  return { companies, status, addCompany, updateCompany, removeCompany }
}
