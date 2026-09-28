import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountRiskSnapshots, trades } from '@/lib/db/schema'

export async function getDashboardChartsData() {
  const access = await requireWorkspace()
  if (!access) return null

  const since = new Date(Date.now() - 90 * 86_400_000)
  const [dailyRows, priorPeaks, riskRows] = await Promise.all([
    access.db.select({
      day: sql<string>`to_char(date(${trades.closedAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`,
      netCents: sql<number>`sum(${trades.netPnlCents})::float8`,
    }).from(trades).where(and(
      eq(trades.workspaceId, access.workspace.id),
      isNotNull(trades.closedAt),
      isNotNull(trades.netPnlCents),
      gte(trades.closedAt, since),
    )).groupBy(sql`date(${trades.closedAt} at time zone 'America/Sao_Paulo')`).orderBy(sql`date(${trades.closedAt} at time zone 'America/Sao_Paulo')`),
    access.db.select({
      accountId: accountRiskSnapshots.accountId,
      peakEquityCents: sql<number | null>`max(${accountRiskSnapshots.equityCents})`,
    }).from(accountRiskSnapshots).where(and(
      eq(accountRiskSnapshots.workspaceId, access.workspace.id),
      lt(accountRiskSnapshots.createdAt, since),
    )).groupBy(accountRiskSnapshots.accountId),
    access.db.select({
      accountId: accountRiskSnapshots.accountId,
      equityCents: accountRiskSnapshots.equityCents,
      capturedAt: accountRiskSnapshots.capturedAt,
    }).from(accountRiskSnapshots).where(and(
      eq(accountRiskSnapshots.workspaceId, access.workspace.id),
      gte(accountRiskSnapshots.createdAt, since),
      isNotNull(accountRiskSnapshots.equityCents),
    )).orderBy(accountRiskSnapshots.createdAt),
  ])

  const peakByAccount = new Map(priorPeaks.map((row) => [row.accountId, row.peakEquityCents === null ? null : Number(row.peakEquityCents)]))
  const drawdownByAccount = new Map<string, { at: string; drawdownCents: number }[]>()
  for (const row of riskRows) {
    if (row.equityCents === null) continue
    const equity = Number(row.equityCents)
    const peak = Math.max(peakByAccount.get(row.accountId) ?? equity, equity)
    peakByAccount.set(row.accountId, peak)
    const points = drawdownByAccount.get(row.accountId) ?? []
    points.push({ at: row.capturedAt.toISOString(), drawdownCents: Math.max(0, peak - equity) })
    drawdownByAccount.set(row.accountId, points)
  }

  return {
    daily: dailyRows.map((row) => ({ day: row.day, netCents: Number(row.netCents) })),
    drawdown: [...drawdownByAccount].map(([accountId, points]) => ({ accountId, points })),
  }
}
