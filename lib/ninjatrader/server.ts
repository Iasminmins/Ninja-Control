import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '@/lib/db/schema'

const provider = 'NinjaTrader'

export async function getNinjaTraderAccountState(db: NeonHttpDatabase<typeof schema>, workspaceId: string) {
  const [mappings, connection] = await Promise.all([
    db.select().from(schema.integrationAccountMappings).where(eq(schema.integrationAccountMappings.workspaceId, workspaceId)).orderBy(desc(schema.integrationAccountMappings.lastSeenAt)),
    db.select().from(schema.integrationConnections).where(and(eq(schema.integrationConnections.workspaceId, workspaceId), eq(schema.integrationConnections.provider, 'ninjatrader-desktop'))).limit(1).then((rows) => rows[0] ?? null),
  ])
  const accountIds = [...new Set(mappings.flatMap((mapping) => mapping.tradingAccountId ? [mapping.tradingAccountId] : []))]
  const [positions, snapshotHistoryByAccount, peakRows, orders, executions] = accountIds.length ? await Promise.all([
    db.select().from(schema.integrationPositions).where(eq(schema.integrationPositions.workspaceId, workspaceId)).orderBy(desc(schema.integrationPositions.capturedAt)),
    Promise.all(accountIds.map((accountId) => db.select().from(schema.accountRiskSnapshots).where(and(eq(schema.accountRiskSnapshots.workspaceId, workspaceId), eq(schema.accountRiskSnapshots.accountId, accountId))).orderBy(desc(schema.accountRiskSnapshots.createdAt)).limit(500))),
    db.select({ accountId: schema.accountRiskSnapshots.accountId, peakEquityCents: max(schema.accountRiskSnapshots.equityCents) }).from(schema.accountRiskSnapshots).where(and(eq(schema.accountRiskSnapshots.workspaceId, workspaceId), inArray(schema.accountRiskSnapshots.accountId, accountIds))).groupBy(schema.accountRiskSnapshots.accountId),
    db.select().from(schema.tradingOrders).where(and(eq(schema.tradingOrders.workspaceId, workspaceId), inArray(schema.tradingOrders.accountId, accountIds), eq(schema.tradingOrders.provider, provider))).orderBy(desc(schema.tradingOrders.lastUpdatedAt), desc(schema.tradingOrders.submittedAt)).limit(300),
    db.select().from(schema.tradeExecutions).where(and(eq(schema.tradeExecutions.workspaceId, workspaceId), inArray(schema.tradeExecutions.accountId, accountIds), eq(schema.tradeExecutions.provider, provider), isNull(schema.tradeExecutions.voidedAt))).orderBy(desc(schema.tradeExecutions.executedAt)).limit(300),
  ]) : [[], [], [], [], []]
  const snapshotHistory = snapshotHistoryByAccount.flat()
  const latestSnapshot = new Map<string, typeof snapshotHistory[number]>()
  for (const snapshot of snapshotHistory) if (!latestSnapshot.has(snapshot.accountId)) latestSnapshot.set(snapshot.accountId, snapshot)
  const peakByAccount = new Map(peakRows.map((row) => [row.accountId, row.peakEquityCents === null ? null : Number(row.peakEquityCents)]))
  const now = Date.now()
  return mappings.map((mapping) => {
    const accountId = mapping.tradingAccountId
    const lastSeenAt = mapping.lastSeenAt.toISOString()
    const ageMs = now - mapping.lastSeenAt.getTime()
    const freshness = ageMs <= 180_000 ? 'online' : ageMs <= 900_000 ? 'stale' : 'offline'
    const snapshot = accountId ? latestSnapshot.get(accountId) : undefined
    const providerDelayMs = snapshot ? snapshot.createdAt.getTime() - snapshot.capturedAt.getTime() : null
    const providerAgeMs = snapshot ? now - snapshot.capturedAt.getTime() : null
    const dataFreshness = providerAgeMs !== null && providerDelayMs !== null && providerAgeMs <= 180_000 && Math.abs(providerDelayMs) <= 180_000 ? 'online' : providerAgeMs !== null && providerAgeMs <= 900_000 ? 'stale' : 'offline'
    const peakEquityCents = accountId ? peakByAccount.get(accountId) ?? null : null
    return {
      mappingId: mapping.id,
      tradingAccountId: accountId,
      accountName: mapping.externalAccountName,
      externalAccountId: mapping.externalAccountId,
      lastSeenAt,
      freshness,
      dataFreshness,
      snapshotReceivedAt: snapshot?.createdAt.toISOString() ?? null,
      providerDelayMs,
      connectionStatus: connection?.status ?? 'disconnected',
      snapshot: snapshot ? {
        capturedAt: snapshot.capturedAt.toISOString(),
        receivedAt: snapshot.createdAt.toISOString(),
        balanceCents: snapshot.balanceCents,
        equityCents: snapshot.equityCents,
        peakEquityCents,
        observedDrawdownCents: peakEquityCents !== null && snapshot.equityCents !== null ? Math.max(0, peakEquityCents - snapshot.equityCents) : null,
        dailyLossCents: snapshot.dailyLossCents,
        providerValues: snapshot.providerValues,
        currency: snapshot.currency,
        equityMethod: snapshot.equityMethod,
        source: snapshot.source,
      } : null,
      equityHistory: accountId ? (snapshotHistoryByAccount[accountIds.indexOf(accountId)] ?? []).filter((point) => point.equityCents !== null).reverse().map((point) => ({ receivedAt: point.createdAt.toISOString(), occurredAt: point.capturedAt.toISOString(), equityCents: point.equityCents!, currency: point.currency, source: point.source })) : [],
      positions: positions.filter((position) => position.mappingId === mapping.id && position.quantity !== 0).map((position) => ({ instrument: position.instrument, quantity: position.quantity, averagePrice: position.averagePrice, unrealizedPnlCents: position.unrealizedPnlCents, capturedAt: position.capturedAt.toISOString() })),
      orders: accountId ? orders.filter((order) => order.accountId === accountId && order.isActive).map((order) => ({ id: order.id, instrument: order.instrument, side: order.side, quantity: order.quantity, filledQuantity: order.filledQuantity, remainingQuantity: Math.max(0, order.quantity - order.filledQuantity), status: order.status, providerStatus: order.providerStatus, orderType: order.orderType, limitPrice: order.limitPrice, stopPrice: order.stopPrice, averageFillPrice: order.averageFillPrice, timeInForce: order.timeInForce, submittedAt: order.submittedAt.toISOString(), lastUpdatedAt: order.lastUpdatedAt?.toISOString() ?? order.submittedAt.toISOString() })) : [],
      recentExecutions: accountId ? executions.filter((execution) => execution.accountId === accountId).slice(0, 30).map((execution) => ({ id: execution.id, instrument: execution.instrument, side: execution.side, quantity: execution.quantity, price: execution.price, executedAt: execution.executedAt.toISOString(), providerOrderId: execution.providerOrderId })) : [],
    }
  })
}
