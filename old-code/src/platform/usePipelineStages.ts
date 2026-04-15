import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, toConnectionStatus } from '@spaces/sdk/storage'
import type { PipelineStage } from './types'

function toStage(r: { recordId: string; data: Record<string, unknown> }): PipelineStage {
  const d = r.data
  return {
    id: r.recordId,
    name: (d.Name as string) ?? '',
    position: (d.Position as number) ?? 0,
    color: (d.Color as string) ?? '#94a3b8',
    defaultProbability: (d.DefaultProbability as number) ?? 0,
  }
}

export function usePipelineStages() {
  const { records, status: queryStatus } = useQuery<Record<string, unknown>>('pipeline_stages')
  const { create } = useMutations<Record<string, unknown>>('pipeline_stages')

  const stages = useMemo<PipelineStage[]>(
    () => records.map(toStage).sort((a, b) => a.position - b.position),
    [records],
  )

  const status = useMemo(() => toConnectionStatus(queryStatus), [queryStatus])

  const bootstrapStages = useCallback(async (stageData: Array<{ name: string; position: number; color: string; default_probability: number }>) => {
    for (const s of stageData) {
      await create({
        Name: s.name,
        Position: s.position,
        Color: s.color,
        DefaultProbability: s.default_probability,
      })
    }
  }, [create])

  return { stages, status, bootstrapStages }
}
