import { and, count, eq, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { strategies, strategyVersions, trades } from '@/lib/db/schema'

export async function getStrategyCatalog() {
  const access = await requireWorkspace()
  if (!access) return null
  const [items, versions, metrics] = await Promise.all([
    access.db.select().from(strategies).where(eq(strategies.workspaceId, access.workspace.id)).orderBy(strategies.name),
    access.db.select({ strategyId: strategyVersions.strategyId, value: count() }).from(strategyVersions).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id)).where(eq(strategies.workspaceId, access.workspace.id)).groupBy(strategyVersions.strategyId),
    access.db.select({ strategyId: strategyVersions.strategyId, tradeCount: count(trades.id), pnlTradeCount: count(trades.netPnlCents), netPnlCents: sql<number>`coalesce(sum(${trades.netPnlCents}), 0)::float8` })
      .from(trades).innerJoin(strategyVersions, eq(trades.strategyVersionId, strategyVersions.id)).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id))
      .where(and(eq(strategies.workspaceId, access.workspace.id), eq(trades.workspaceId, access.workspace.id))).groupBy(strategyVersions.strategyId),
  ])
  return items.map((strategy) => ({
    ...strategy,
    versionCount: Number(versions.find((row) => row.strategyId === strategy.id)?.value ?? 0),
    tradeCount: Number(metrics.find((row) => row.strategyId === strategy.id)?.tradeCount ?? 0),
    pnlTradeCount: Number(metrics.find((row) => row.strategyId === strategy.id)?.pnlTradeCount ?? 0),
    netPnlCents: Number(metrics.find((row) => row.strategyId === strategy.id)?.pnlTradeCount ?? 0) ? Number(metrics.find((row) => row.strategyId === strategy.id)?.netPnlCents ?? 0) : null,
  }))
}

export type StrategyCatalog = NonNullable<Awaited<ReturnType<typeof getStrategyCatalog>>>
