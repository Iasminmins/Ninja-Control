import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { strategies, strategyExperiments, strategyVersions } from '@/lib/db/schema'

export async function getHunterLabData() {
  const access = await requireWorkspace()
  if (!access) return null
  const strategyRows = await access.db.select().from(strategies).where(eq(strategies.workspaceId, access.workspace.id)).orderBy(strategies.name)
  const ids = strategyRows.map((row) => row.id)
  if (!ids.length) return { areas: strategyRows.map((strategy) => ({ strategy, versions: [] })), experiments: [] }
  const [versions, experiments] = await Promise.all([
    access.db.select().from(strategyVersions).where(inArray(strategyVersions.strategyId, ids)).orderBy(desc(strategyVersions.createdAt)),
    access.db.select({ experiment: strategyExperiments, version: strategyVersions, strategy: strategies })
      .from(strategyExperiments).innerJoin(strategyVersions, eq(strategyExperiments.strategyVersionId, strategyVersions.id))
      .innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id))
      .where(eq(strategies.workspaceId, access.workspace.id)).orderBy(desc(strategyExperiments.createdAt)),
  ])
  return {
    areas: strategyRows.map((strategy) => ({ strategy, versions: versions.filter((version) => version.strategyId === strategy.id) })),
    experiments: experiments.map(({ experiment, version, strategy }) => ({ experiment, version, strategy })),
  }
}

export type HunterLabData = NonNullable<Awaited<ReturnType<typeof getHunterLabData>>>
