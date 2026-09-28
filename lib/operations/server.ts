import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { alertEvents, executionDivergences, executionNodes, operationEvents, propFirmPlans, propFirms, tradingAccounts, tradingOrders, trades } from '@/lib/db/schema'
import { getNinjaTraderAccountState } from '@/lib/ninjatrader/server'

export async function getOperationsSnapshot() {
  const access = await requireWorkspace()
  if (!access) return null
  const { db, workspace } = access
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

  const [accounts, orders, events, nodes, divergenceRows, alertRows, todayPnl] = await Promise.all([
    db.select({ account: tradingAccounts, firmName: sql<string | null>`prop_firms.name`, logoUrl: sql<string | null>`prop_firms.logo_url` })
      .from(tradingAccounts)
      .leftJoin(propFirmPlans, eq(tradingAccounts.propFirmPlanId, propFirmPlans.id))
      .leftJoin(propFirms, eq(propFirmPlans.propFirmId, propFirms.id))
      .where(eq(tradingAccounts.workspaceId, workspace.id)),
    db.select({ id: tradingOrders.id, instrument: tradingOrders.instrument, side: tradingOrders.side, status: tradingOrders.status, submittedAt: tradingOrders.submittedAt })
      .from(tradingOrders).where(eq(tradingOrders.workspaceId, workspace.id)).orderBy(desc(tradingOrders.submittedAt)).limit(10),
    db.select({ id: operationEvents.id, eventType: operationEvents.eventType, status: operationEvents.status, occurredAt: operationEvents.occurredAt })
      .from(operationEvents).where(eq(operationEvents.workspaceId, workspace.id)).orderBy(desc(operationEvents.occurredAt)).limit(10),
    db.select({ id: executionNodes.id, name: executionNodes.name, role: executionNodes.role, status: executionNodes.status, lastHeartbeatAt: executionNodes.lastHeartbeatAt })
      .from(executionNodes).where(eq(executionNodes.workspaceId, workspace.id)).orderBy(desc(executionNodes.lastHeartbeatAt)).limit(16),
    db.select({ value: count() }).from(executionDivergences).where(and(eq(executionDivergences.workspaceId, workspace.id), isNull(executionDivergences.resolvedAt))),
    db.select({ value: count() }).from(alertEvents).where(and(eq(alertEvents.workspaceId, workspace.id), sql`lower(${alertEvents.severity}) = 'critical'`, isNull(alertEvents.readAt))),
    db.select({ cents: sql<number | null>`sum(${trades.netPnlCents})` }).from(trades)
      .where(and(eq(trades.workspaceId, workspace.id), sql`DATE(${trades.closedAt} AT TIME ZONE 'America/Sao_Paulo') = ${today}`)),
  ])
  const liveAccountStates = await getNinjaTraderAccountState(db, workspace.id)
  const liveByAccount = new Map(liveAccountStates.flatMap((state) => state.tradingAccountId ? [[state.tradingAccountId, state] as const] : []))

  return {
    accounts: accounts.map((row) => ({ id: row.account.id, name: row.account.name, firm: row.firmName ?? 'Prop firm', logoUrl: row.logoUrl, status: row.account.status, kind: row.account.kind, stage: row.account.stage, liveState: liveByAccount.get(row.account.id) ?? null })),
    activeAccountCount: accounts.filter((row) => row.account.status === 'active').length,
    totalAccountCount: accounts.length,
    orders: orders.map((order) => ({ ...order, submittedAt: order.submittedAt.toISOString() })),
    events: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
    nodes: nodes.map((node) => ({ ...node, lastHeartbeatAt: node.lastHeartbeatAt?.toISOString() ?? null })),
    openDivergences: Number(divergenceRows[0]?.value ?? 0),
    criticalAlerts: Number(alertRows[0]?.value ?? 0),
    todayPnlCents: todayPnl[0]?.cents === null || todayPnl[0]?.cents === undefined ? null : Number(todayPnl[0].cents),
    liveAccountStates,
  }
}
