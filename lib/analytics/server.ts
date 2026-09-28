import { and, avg, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountRiskSnapshots, tradeContexts, tradeExecutions, trades, tradingAccounts } from '@/lib/db/schema'
import { buildClosedRoundTrips } from '@/lib/ninjatrader/round-trips'

export type AnalyticsFilters = { days: number; accountId: string; hunterFamily: string; setup: string; side: string }
export const defaultAnalyticsFilters: AnalyticsFilters = { days: 30, accountId: 'all', hunterFamily: 'all', setup: 'all', side: 'all' }

export async function getAnalyticsSnapshot(filters: AnalyticsFilters = defaultAnalyticsFilters) {
  const access = await requireWorkspace()
  if (!access) return null
  const conditions = [eq(trades.workspaceId, access.workspace.id), isNotNull(trades.closedAt), isNotNull(trades.netPnlCents)]
  if (filters.days > 0) conditions.push(gte(trades.closedAt, new Date(Date.now() - filters.days * 86_400_000)))
  if (filters.accountId !== 'all' && /^[0-9a-f-]{36}$/i.test(filters.accountId)) conditions.push(eq(trades.accountId, filters.accountId))
  if (filters.hunterFamily !== 'all') conditions.push(eq(tradeContexts.hunterFamily, filters.hunterFamily))
  if (filters.setup !== 'all') conditions.push(eq(tradeContexts.setupCode, filters.setup))
  if (filters.side !== 'all') conditions.push(eq(trades.side, filters.side === 'long' ? 'buy' : 'sell'))

  const since = filters.days > 0 ? new Date(Date.now() - filters.days * 86_400_000) : null
  const riskConditions = [eq(accountRiskSnapshots.workspaceId, access.workspace.id)]
  if (filters.accountId !== 'all' && /^[0-9a-f-]{36}$/i.test(filters.accountId)) riskConditions.push(eq(accountRiskSnapshots.accountId, filters.accountId))
  if (since) riskConditions.push(gte(accountRiskSnapshots.createdAt, since))
  const [aggregates, dailyRows, riskRows, executions, accountRows, familyRows, setupRows] = await Promise.all([
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
    access.db.select({ accountId: accountRiskSnapshots.accountId, equityCents: accountRiskSnapshots.equityCents, capturedAt: accountRiskSnapshots.capturedAt })
      .from(accountRiskSnapshots).where(and(...riskConditions)).orderBy(accountRiskSnapshots.createdAt),
    access.db.select({ id: tradeExecutions.id, accountId: tradeExecutions.accountId, instrument: tradeExecutions.instrument, side: tradeExecutions.side, quantity: tradeExecutions.quantity, price: tradeExecutions.price, pointValue: tradeExecutions.pointValue, commissionCents: tradeExecutions.commissionCents, commissionCurrency: tradeExecutions.commissionCurrency, currency: tradeExecutions.currency, executedAt: tradeExecutions.executedAt })
      .from(tradeExecutions).where(and(eq(tradeExecutions.workspaceId, access.workspace.id), eq(tradeExecutions.provider, 'NinjaTrader'), isNull(tradeExecutions.voidedAt), filters.accountId === 'all' ? sql`true` : eq(tradeExecutions.accountId, filters.accountId))).orderBy(desc(tradeExecutions.executedAt)).limit(20_000),
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
  const drawdownByAccount = new Map<string, { peak: number; max: number }>()
  for (const point of riskRows) {
    if (point.equityCents === null) continue
    const equity = Number(point.equityCents)
    const state = drawdownByAccount.get(point.accountId) ?? { peak: equity, max: 0 }
    state.max = Math.max(state.max, state.peak - equity)
    state.peak = Math.max(state.peak, equity)
    drawdownByAccount.set(point.accountId, state)
  }
  const maxDrawdown = drawdownByAccount.size ? Math.max(...[...drawdownByAccount.values()].map((item) => item.max)) : null
  const derived = buildClosedRoundTrips(executions.map((row) => ({ ...row, price: Number(row.price), pointValue: row.pointValue === null ? null : Number(row.pointValue) })))
  const contextFiltersActive = filters.hunterFamily !== 'all' || filters.setup !== 'all'
  const grossTrips = derived.closed.filter((trip) => (!since || trip.closedAt >= since) && (filters.accountId === 'all' || trip.accountId === filters.accountId) && (filters.side === 'all' || trip.side === filters.side) && !contextFiltersActive)
  const grossByCurrency = [...new Set(grossTrips.map((trip) => trip.currency ?? 'Moeda desconhecida'))].sort().map((currency) => {
    const trips = grossTrips.filter((trip) => (trip.currency ?? 'Moeda desconhecida') === currency)
    let cumulativeCents = 0
    return { currency, sampleSize: trips.length, wins: trips.filter((trip) => trip.grossPnlCents > 0).length, losses: trips.filter((trip) => trip.grossPnlCents < 0).length, grossPnlCents: trips.reduce((sum, trip) => sum + trip.grossPnlCents, 0), grossWinsCents: trips.filter((trip) => trip.grossPnlCents > 0).reduce((sum, trip) => sum + trip.grossPnlCents, 0), grossLossesCents: Math.abs(trips.filter((trip) => trip.grossPnlCents < 0).reduce((sum, trip) => sum + trip.grossPnlCents, 0)), feesCents: trips.every((trip) => trip.feesCents !== null) ? trips.reduce((sum, trip) => sum + (trip.feesCents ?? 0), 0) : null, netPnlCents: trips.every((trip) => trip.netPnlCents !== null) ? trips.reduce((sum, trip) => sum + (trip.netPnlCents ?? 0), 0) : null, daily: [...new Set(trips.map((trip) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(trip.closedAt)))].sort().map((day) => ({ day, grossPnlCents: trips.filter((trip) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(trip.closedAt) === day).reduce((sum, trip) => sum + trip.grossPnlCents, 0) })), curve: trips.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime()).map((trip) => { cumulativeCents += trip.grossPnlCents; return { at: trip.closedAt.toISOString(), grossPnlCents: cumulativeCents } }) }
  })
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
      recoveryFactor: filters.accountId !== 'all' && maxDrawdown && maxDrawdown > 0 ? netCents / maxDrawdown : null,
    },
    ninjaTraderGross: { byCurrency: grossByCurrency, incompleteFillCount: derived.incompleteFillCount, historyTruncated: executions.length === 20_000, unavailableBecauseContextFilter: contextFiltersActive },
    daily: dailyRows.map((item) => ({ day: item.day, netCents: Number(item.netCents) })),
    drawdownIsWorkspaceWide: filters.accountId === 'all',
  }
}

export type AnalyticsSnapshot = NonNullable<Awaited<ReturnType<typeof getAnalyticsSnapshot>>>
