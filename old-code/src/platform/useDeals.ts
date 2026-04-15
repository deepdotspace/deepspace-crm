import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, toConnectionStatus } from '@spaces/sdk/storage'
import type { Deal, DealStatus, DealSource } from './types'

function toDeal(r: { recordId: string; data: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string }): Deal {
  const d = r.data
  return {
    id: r.recordId,
    title: (d.Title as string) ?? '',
    companyId: (d.CompanyId as string) ?? null,
    stageId: (d.StageId as string) ?? null,
    amount: (d.Amount as number) ?? 0,
    currency: (d.Currency as string) ?? 'USD',
    closeDate: (d.CloseDate as string) ?? null,
    probability: (d.Probability as number) ?? 0,
    ownerId: (d.OwnerId as string) ?? null,
    status: (d.Status as DealStatus) ?? 'open',
    lossReason: (d.LossReason as string) ?? null,
    source: (d.Source as DealSource) ?? null,
    notes: (d.Notes as string) ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export function useDeals() {
  const { records, status: queryStatus } = useQuery('deals')
  const { create, put, remove } = useMutations<Record<string, unknown>>('deals')

  const deals = useMemo<Deal[]>(
    () => records.map(toDeal),
    [records],
  )

  const status = useMemo(() => toConnectionStatus(queryStatus), [queryStatus])

  const addDeal = useCallback(async (data: Partial<Omit<Deal, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => {
    await create({
      Title: data.title ?? '',
      CompanyId: data.companyId ?? null,
      StageId: data.stageId ?? null,
      Amount: data.amount ?? 0,
      Currency: data.currency ?? 'USD',
      CloseDate: data.closeDate ?? null,
      Probability: data.probability ?? 0,
      OwnerId: data.ownerId ?? null,
      Status: data.status ?? 'open',
      LossReason: data.lossReason ?? null,
      Source: data.source ?? null,
      Notes: data.notes ?? null,
    })
  }, [create])

  const updateDeal = useCallback(async (id: string, changes: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      mapped[key.charAt(0).toUpperCase() + key.slice(1)] = value
    }
    await put(id, mapped)
  }, [put])

  const removeDeal = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  return { deals, status, addDeal, updateDeal, removeDeal }
}
