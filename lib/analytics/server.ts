import { and, avg, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountRiskSnapshots, tradeContexts, trades, tradingAccounts } from '@/lib/db/schema'

export type AnalyticsFilters = { days: number; accountId: string; hunterFamily: string; setup: string; side: string }
export const defaultAnalyticsFilters: AnalyticsFilters = { days: 30, accountId: 'all', hunterFamily: 'all', setup: 'all', side: 'all' }

export async function getAnalyticsSnapshot(filters: AnalyticsFilters = defaultAnalyticsFilters) {
  const access = await requireWorkspace()
  if (!access) return null
  const conditions = [eq(trades.workspaceId, access.workspace.id), isNotNull(trades.closedAt)]
  if (filters.days > 0) conditions.push(gte(trades.closedAt, new Date(Date.now() - filters.days * 86_400_000)))
  if (filters.accountId !== 'all' && /^[0-9a-f-]{36}$/i.test(filters.accountId)) conditions.push(eq(trades.accountId, filters.accountId))
  if (filters.hunterFamily !== 'all') conditions.push(eq(tradeContexts.hunterFamily, filters.hunterFamily))
  if (filters.setup !== 'all') conditions.push(eq(tradeContexts.setupCode, filters.setup))
  if (filters.side !== 'all') conditions.push(eq(trades.side, filters.side === 'long' ? 'buy' : 'sell'))

  const [aggregates, dailyRows, riskRows, accountRows, familyRows, setupRows] = await Promise.all([
    access.db.select({
      tradeCount: sql<number>`count(${trades.id})::int`,
      wins: sql<number>`count(${trades.id}) filter (where ${trades.netPnlCents} > 0)::int`,
      losses: sql<number>`count(${trades.id}) filter (where ${trades.netPnlCents} < 0)::int`,
      netCents: sql<number>`coalesce(sum(${trades.netPnlCents}), 0)::float8`,
      grossWinsCents: sql<number>`coalesce(sum(${trades.netPnlCents}) filter (where ${trades.netPnlCents} > 0), 0)::float8`,
      grossLossesCents: sql<number>`coalesce(sum(abs(${trades.netPnlCents})) filter (where ${trades.netPnlCents} < 0), 0)::float8`,
      averageWinCents: sql<number | null>`avg(${trades.netPnlCents}) filter (where ${trades.netPnlCents} > 0)`,
      averageLossCents: sql<number | null>`avg(abs(${trades.netPnlCents})) filter (where ${trades.netPnlCents} < 0)`,
      averageMaeCents: avg(tradeContexts.maeCents),
      averageMfeCents: avg(tradeContexts.mfeCents),
      averageRiskReward: avg(tradeContexts.riskReward),
    }).from(trades).leftJoin(tradeContexts, and(eq(tradeContexts.tradeId, trades.id), eq(tradeContexts.workspaceId, access.workspace.id))).where(and(...conditions)),
    access.db.select({ day: sql<string>`to_char(date(${trades.closedAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`, netCents: sql<number>`sum(${trades.netPnlCents})::float8` })
      .from(trades).leftJoin(tradeContexts, and(eq(tradeContexts.tradeId, trades.id), eq(tradeContexts.workspaceId, access.workspace.id))).where(and(...conditions)).groupBy(sql`date(${trades.closedAt} at time zone 'America/Sao_Paulo')`).orderBy(sql`date(${trades.closedAt} at time zone 'America/Sao_Paulo')`),
    access.db.select({ maxObservedDrawdownCents: sql<number | null>`max(${accountRiskSnapshots.currentDrawdownCents})` })
      .from(accountRiskSnapshots).where(eq(accountRiskSnapshots.workspaceId, access.workspace.id)),
    access.db.select({ id: tradingAccounts.id, name: tradingAccounts.name }).from(tradingAccounts).where(eq(tradingAccounts.workspaceId, access.workspace.id)).orderBy(tradingAccounts.name),
    access.db.selectDistinct({ value: tradeContexts.hunterFamily }).from(tradeContexts).where(eq(tradeContexts.workspaceId, access.workspace.id)),
    access.db.selectDistinct({ value: tradeContexts.setupCode }).from(tradeContexts).where(eq(tradeContexts.workspaceId, access.workspace.id)),
  ])

  const row = aggregates[0]
  const tradeCount = Number(row?.tradeCount ?? 0)
  const wins = Number(row?.wins ?? 0)
  const losses = Number(row?.losses ?? 0)
  const grossWinsCents = Number(row?.grossWinsCents ?? 0)
  const grossLossesCents = Number(row?.grossLossesCents ?? 0)
  const netCents = Number(row?.netCents ?? 0)
  const maxDrawdown = riskRows[0]?.maxObservedDrawdownCents === null || riskRows[0]?.maxObservedDrawdownCents === undefined ? null : Number(riskRows[0].maxObservedDrawdownCents)
  return {
    filters,
    accounts: accountRows,
    hunterFamilies: familyRows.map((item) => item.value).filter((value): value is string => Boolean(value)).sort(),
    setups: setupRows.map((item) => item.value).filter((value): value is string => Boolean(value)).sort(),
    summary: {
      tradeCount, wins, losses, winRate: tradeCount ? wins / tradeCount * 100 : null,
      averageWinCents: row?.averageWinCents === null || row?.averageWinCents === undefined ? null : Number(row.averageWinCents),
      averageLossCents: row?.averageLossCents === null || row?.averageLossCents === undefined ? null : Number(row.averageLossCents),
      profitFactor: grossLossesCents ? grossWinsCents / grossLossesCents : null,
      expectancyCents: tradeCount ? netCents / tradeCount : null,
      averageRiskReward: row?.averageRiskReward === null || row?.averageRiskReward === undefined ? null : Number(row.averageRiskReward),
      averageMaeCents: row?.averageMaeCents === null || row?.averageMaeCents === undefined ? null : Number(row.averageMaeCents),
      averageMfeCents: row?.averageMfeCents === null || row?.averageMfeCents === undefined ? null : Number(row.averageMfeCents),
      netCents, maxObservedDrawdownCents: maxDrawdown,
      recoveryFactor: maxDrawdown && maxDrawdown > 0 ? netCents / maxDrawdown : null,
    },
    daily: dailyRows.map((item) => ({ day: item.day, netCents: Number(item.netCents) })),
    drawdownIsWorkspaceWide: filters.accountId === 'all',
  }
}

export type AnalyticsSnapshot = NonNullable<Awaited<ReturnType<typeof getAnalyticsSnapshot>>>
