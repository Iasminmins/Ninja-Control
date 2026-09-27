import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { strategies, strategyVersions, trades, tradingAccounts } from '@/lib/db/schema'

export type CompareType = 'account' | 'strategy'
export type CompareMetrics = { sampleSize: number; wins: number; losses: number; netCents: number; winRate: number | null; profitFactor: number | null; expectancyCents: number | null }
const blank: CompareMetrics = { sampleSize: 0, wins: 0, losses: 0, netCents: 0, winRate: null, profitFactor: null, expectancyCents: null }

async function metricsFor(db: NonNullable<Awaited<ReturnType<typeof requireWorkspace>>>['db'], workspaceId: string, type: CompareType, id: string, days: number): Promise<CompareMetrics> {
  const conditions = [eq(trades.workspaceId, workspaceId), isNotNull(trades.closedAt), isNotNull(trades.netPnlCents)]
  if (days > 0) conditions.push(gte(trades.closedAt, new Date(Date.now() - days * 86_400_000)))
  const base = {
    sampleSize: count(trades.netPnlCents),
    wins: sql<number>`count(${trades.id}) filter (where ${trades.netPnlCents} > 0)::int`,
    losses: sql<number>`count(${trades.id}) filter (where ${trades.netPnlCents} < 0)::int`,
    netCents: sql<number>`coalesce(sum(${trades.netPnlCents}), 0)::float8`,
    grossWins: sql<number>`coalesce(sum(${trades.netPnlCents}) filter (where ${trades.netPnlCents} > 0), 0)::float8`,
    grossLosses: sql<number>`coalesce(sum(abs(${trades.netPnlCents})) filter (where ${trades.netPnlCents} < 0), 0)::float8`,
  }
  const query = type === 'account'
    ? db.select(base).from(trades).where(and(...conditions, eq(trades.accountId, id)))
    : db.select(base).from(trades).innerJoin(strategyVersions, eq(trades.strategyVersionId, strategyVersions.id)).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id)).where(and(...conditions, eq(strategies.id, id), eq(strategies.workspaceId, workspaceId)))
  const [row] = await query
  const sampleSize = Number(row?.sampleSize ?? 0)
  const wins = Number(row?.wins ?? 0)
  const losses = Number(row?.losses ?? 0)
  const netCents = Number(row?.netCents ?? 0)
  const grossLosses = Number(row?.grossLosses ?? 0)
  return { sampleSize, wins, losses, netCents, winRate: sampleSize ? wins / sampleSize * 100 : null, profitFactor: grossLosses ? Number(row?.grossWins ?? 0) / grossLosses : null, expectancyCents: sampleSize ? netCents / sampleSize : null }
}

export async function getComparatorData(type: CompareType, requestedA: string, requestedB: string, days: number) {
  const access = await requireWorkspace()
  if (!access) return null
  const choices = type === 'account'
    ? await access.db.select({ id: tradingAccounts.id, name: tradingAccounts.name }).from(tradingAccounts).where(eq(tradingAccounts.workspaceId, access.workspace.id)).orderBy(tradingAccounts.name)
    : await access.db.select({ id: strategies.id, name: strategies.name }).from(strategies).where(eq(strategies.workspaceId, access.workspace.id)).orderBy(strategies.name)
  const a = choices.find((item) => item.id === requestedA) ?? choices[0]
  const b = choices.find((item) => item.id === requestedB) ?? choices[1] ?? a
  if (!a || !b) return { type, days, choices, first: null, second: null }
  const [first, second] = await Promise.all([
    metricsFor(access.db, access.workspace.id, type, a.id, days),
    metricsFor(access.db, access.workspace.id, type, b.id, days),
  ])
  return { type, days, choices, first: { entity: a, metrics: first }, second: { entity: b, metrics: second } }
}

export type ComparatorData = NonNullable<Awaited<ReturnType<typeof getComparatorData>>>
