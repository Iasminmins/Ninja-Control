import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { strategyVersions, strategies, tradeContexts, trades, tradingAccounts } from '@/lib/db/schema'

export type ReportFilters = { days: number; accountId: string; strategyId: string }

export async function getWorkspaceTradeReport(filters: ReportFilters) {
  const access = await requireWorkspace()
  if (!access) return null
  const conditions = [eq(trades.workspaceId, access.workspace.id), isNotNull(trades.closedAt)]
  if (filters.days > 0) conditions.push(gte(trades.closedAt, new Date(Date.now() - filters.days * 86_400_000)))
  if (filters.accountId !== 'all' && /^[0-9a-f-]{36}$/i.test(filters.accountId)) conditions.push(eq(trades.accountId, filters.accountId))
  if (filters.strategyId !== 'all' && /^[0-9a-f-]{36}$/i.test(filters.strategyId)) conditions.push(eq(strategies.id, filters.strategyId))
  const [rows, accounts, strategyRows] = await Promise.all([
    access.db.select({
      id: trades.id,
      accountId: trades.accountId,
      accountName: tradingAccounts.name,
      strategyName: strategies.name,
      displayVersion: sql<string | null>`${strategyVersions.parameters}->>'displayVersion'`,
      instrument: trades.instrument,
      side: trades.side,
      openedAt: trades.openedAt,
      closedAt: trades.closedAt,
      netPnlCents: trades.netPnlCents,
      entryPrice: tradeContexts.entryPrice,
      exitPrice: tradeContexts.exitPrice,
      quantity: tradeContexts.quantity,
      maeCents: tradeContexts.maeCents,
      mfeCents: tradeContexts.mfeCents,
      riskReward: tradeContexts.riskReward,
      setupCode: tradeContexts.setupCode,
      hunterFamily: tradeContexts.hunterFamily,
      hunterVersion: tradeContexts.hunterVersion,
    }).from(trades)
      .innerJoin(tradingAccounts, and(eq(trades.accountId, tradingAccounts.id), eq(tradingAccounts.workspaceId, access.workspace.id)))
      .leftJoin(tradeContexts, and(eq(tradeContexts.tradeId, trades.id), eq(tradeContexts.workspaceId, access.workspace.id)))
      .leftJoin(strategyVersions, and(eq(strategyVersions.id, trades.strategyVersionId), sql`exists (select 1 from strategies owned_strategy where owned_strategy.id = ${strategyVersions.strategyId} and owned_strategy.workspace_id = ${access.workspace.id})`))
      .leftJoin(strategies, and(eq(strategies.id, strategyVersions.strategyId), eq(strategies.workspaceId, access.workspace.id)))
      .where(and(...conditions)).orderBy(desc(trades.closedAt)).limit(2000),
    access.db.select({ id: tradingAccounts.id, name: tradingAccounts.name }).from(tradingAccounts).where(eq(tradingAccounts.workspaceId, access.workspace.id)).orderBy(tradingAccounts.name),
    access.db.select({ id: strategies.id, name: strategies.name }).from(strategies).where(eq(strategies.workspaceId, access.workspace.id)).orderBy(strategies.name),
  ])
  return {
    filters,
    accounts,
    strategies: strategyRows,
    capped: rows.length === 2000,
    trades: rows.map((row) => ({ ...row, openedAt: row.openedAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null,
      netPnlCents: row.netPnlCents === null ? null : Number(row.netPnlCents), maeCents: row.maeCents === null ? null : Number(row.maeCents), mfeCents: row.mfeCents === null ? null : Number(row.mfeCents),
      entryPrice: row.entryPrice === null ? null : Number(row.entryPrice), exitPrice: row.exitPrice === null ? null : Number(row.exitPrice), riskReward: row.riskReward === null ? null : Number(row.riskReward),
    })),
  }
}

export type WorkspaceTradeReport = NonNullable<Awaited<ReturnType<typeof getWorkspaceTradeReport>>>
