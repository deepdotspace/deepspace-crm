import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, toConnectionStatus } from 'deepspace'
import type { Activity, ActivityType } from './types'

function toActivity(r: { recordId: string; data: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string }): Activity {
  const d = r.data
  return {
    id: r.recordId,
    type: (d.Type as ActivityType) ?? 'note',
    title: (d.Title as string) ?? '',
    description: (d.Description as string) ?? null,
    contactId: (d.ContactId as string) ?? null,
    companyId: (d.CompanyId as string) ?? null,
    dealId: (d.DealId as string) ?? null,
    conversationId: (d.ConversationId as string) ?? null,
    eventId: (d.EventId as string) ?? null,
    taskId: (d.TaskId as string) ?? null,
    completedAt: (d.CompletedAt as string) ?? null,
    dueAt: (d.DueAt as string) ?? null,
    ownerId: (d.OwnerId as string) ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export function useActivities() {
  const { records, status: queryStatus } = useQuery<Record<string, unknown>>('activities')
  const { create, put, remove } = useMutations<Record<string, unknown>>('activities')

  const activities = useMemo<Activity[]>(
    () => records.map(toActivity).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [records],
  )

  const status = useMemo(() => toConnectionStatus(queryStatus), [queryStatus])

  const addActivity = useCallback(async (data: Partial<Omit<Activity, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => {
    await create({
      Type: data.type ?? 'note',
      Title: data.title ?? '',
      Description: data.description ?? null,
      ContactId: data.contactId ?? null,
      CompanyId: data.companyId ?? null,
      DealId: data.dealId ?? null,
      ConversationId: data.conversationId ?? null,
      EventId: data.eventId ?? null,
      TaskId: data.taskId ?? null,
      CompletedAt: data.completedAt ?? null,
      DueAt: data.dueAt ?? null,
      OwnerId: data.ownerId ?? null,
    })
  }, [create])

  const updateActivity = useCallback(async (id: string, changes: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      mapped[key.charAt(0).toUpperCase() + key.slice(1)] = value
    }
    await put(id, mapped)
  }, [put])

  const removeActivity = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  return { activities, status, addActivity, updateActivity, removeActivity }
}
