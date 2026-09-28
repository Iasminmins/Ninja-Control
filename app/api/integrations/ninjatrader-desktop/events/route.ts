import { createHash, timingSafeEqual, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { requireDatabase } from '@/lib/db'
import { integrationAccountMappings, integrationConnections } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const provider = 'ninjatrader-desktop'
const providerItems = new Set(['BuyingPower', 'CashValue', 'Commission', 'ExcessIntradayMargin', 'ExcessInitialMargin', 'ExcessMaintenanceMargin', 'ExcessPositionMargin', 'Fee', 'GrossRealizedProfitLoss', 'InitialMargin', 'IntradayMargin', 'LongOptionValue', 'LookAheadMaintenanceMargin', 'LongStockValue', 'MaintenanceMargin', 'NetLiquidation', 'PositionMargin', 'RealizedProfitLoss', 'ShortOptionValue', 'ShortStockValue', 'SodCashValue', 'SodLiquidatingValue', 'UnrealizedProfitLoss', 'TotalCashBalance'])
type Event = Record<string, unknown> & { eventId: string; type: string; occurredAt: string; occurred: Date; accountId?: string; syncId?: string }
const boundedText = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null
const integer = (v: unknown, min = -2_000_000_000, max = 2_000_000_000) => Number.isInteger(v) && Number(v) >= min && Number(v) <= max ? Number(v) : null
const number = (v: unknown, min = -1_000_000_000, max = 1_000_000_000) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null

function validate(input: unknown): Event | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const eventId = boundedText(raw.eventId, 240)
  const type = boundedText(raw.type, 40)
  const occurredAt = boundedText(raw.occurredAt, 60)
  const occurred = occurredAt ? new Date(occurredAt) : null
  if (!eventId || !/^[A-Za-z0-9._:-]+$/.test(eventId) || !type || !occurred || !Number.isFinite(occurred.getTime())) return null
  const common = { ...raw, eventId, type, occurredAt, occurred } as Event
  if (type === 'account_discovered') {
    const accountMode = raw.accountMode === undefined ? 'simulation' : raw.accountMode
    if (accountMode !== 'live' && accountMode !== 'simulation') return null
    return boundedText(raw.accountId, 240) && boundedText(raw.accountName, 120) ? { ...common, accountMode } : null
  }
  if (type === 'account_snapshot') {
    const accountId = boundedText(raw.accountId, 240)
    if (!accountId) return null
    for (const key of ['balanceCents', 'equityCents', 'dailyLossCents', 'unrealizedPnlCents']) if (raw[key] !== undefined && raw[key] !== null && integer(raw[key]) === null) return null
    if (raw.currency !== undefined && (typeof raw.currency !== 'string' || raw.currency.length > 12)) return null
    if (raw.equityMethod !== undefined && !['net_liquidation_reported', 'cash_plus_unrealized_calculated'].includes(String(raw.equityMethod))) return null
    if (raw.providerValues !== undefined) {
      if (!raw.providerValues || typeof raw.providerValues !== 'object' || Array.isArray(raw.providerValues)) return null
      for (const [key, entry] of Object.entries(raw.providerValues as Record<string, unknown>)) {
        if (!providerItems.has(key) || !entry || typeof entry !== 'object' || Array.isArray(entry)) return null
        const item = entry as Record<string, unknown>
        if (integer(item.valueCents) === null || typeof item.observed !== 'boolean') return null
      }
    }
    return { ...common, accountId }
  }
  if (type === 'position_snapshot') {
    const accountId = boundedText(raw.accountId, 240)
    if (!accountId || !boundedText(raw.instrument, 80) || integer(raw.quantity) === null) return null
    if (raw.averagePrice !== undefined && raw.averagePrice !== null && number(raw.averagePrice, 0) === null) return null
    if (raw.unrealizedPnlCents !== undefined && raw.unrealizedPnlCents !== null && integer(raw.unrealizedPnlCents) === null) return null
    if (raw.syncId !== undefined && !boundedText(raw.syncId, 80)) return null
    return { ...common, accountId }
  }
  if (type === 'order') {
    const accountId = boundedText(raw.accountId, 240)
    if (!accountId || !boundedText(raw.orderId, 240) || !boundedText(raw.instrument, 80) || !['buy', 'sell'].includes(String(raw.side)) || integer(raw.quantity, 1) === null) return null
    if (raw.providerOrderId !== undefined && raw.providerOrderId !== null && !boundedText(raw.providerOrderId, 240)) return null
    if (!['pending', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected'].includes(String(raw.status))) return null
    if (raw.filledQuantity !== undefined && integer(raw.filledQuantity, 0) === null) return null
    for (const key of ['averageFillPrice', 'limitPrice', 'stopPrice']) if (raw[key] !== undefined && raw[key] !== null && number(raw[key], 0) === null) return null
    if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') return null
    if (raw.syncId !== undefined && !boundedText(raw.syncId, 80)) return null
    return { ...common, accountId }
  }
  if (type === 'execution' || type === 'execution_removed') {
    const accountId = boundedText(raw.accountId, 240)
    if (!accountId || !boundedText(raw.executionId, 240)) return null
    if (type === 'execution_removed') return { ...common, accountId }
    if (!boundedText(raw.instrument, 80) || (raw.side !== null && raw.side !== undefined && !['buy', 'sell'].includes(String(raw.side))) || integer(raw.quantity, 1) === null || number(raw.price, 0) === null) return null
    if (raw.pointValue !== undefined && raw.pointValue !== null && number(raw.pointValue, 0.00000001) === null) return null
    if (raw.commissionCents !== undefined && raw.commissionCents !== null && integer(raw.commissionCents) === null) return null
    if (raw.currency !== undefined && raw.currency !== null && (typeof raw.currency !== 'string' || raw.currency.length > 12)) return null
    if (raw.commissionCurrency !== undefined && raw.commissionCurrency !== null && (typeof raw.commissionCurrency !== 'string' || raw.commissionCurrency.length > 12)) return null
    const executedAt = raw.executedAt === undefined ? occurred : typeof raw.executedAt === 'string' ? new Date(raw.executedAt) : null
    if (!executedAt || !Number.isFinite(executedAt.getTime())) return null
    return { ...common, accountId, executedAt }
  }
  if (type === 'sync_start' || type === 'sync_complete') {
    const accountId = boundedText(raw.accountId, 240)
    const syncId = boundedText(raw.syncId, 80)
    if (!accountId || !syncId) return null
    if (type === 'sync_complete') for (const key of ['positionCount', 'orderCount', 'executionCount']) if (integer(raw[key], 0, 100_000) === null) return null
    return { ...common, accountId, syncId }
  }
  return null
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,})$/)?.[1]
  if (!bearer) return NextResponse.json({ accepted: false, code: 'invalid_token', error: 'Bearer token ausente ou inválido.' }, { status: 401 })
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return NextResponse.json({ accepted: false, code: 'database_unavailable', error: 'Banco não configurado.' }, { status: 503 })
  const rawText = await request.text()
  if (Buffer.byteLength(rawText, 'utf8') > 64_000) return NextResponse.json({ accepted: false, code: 'payload_too_large', error: 'Evento excede o limite de 64 KB.' }, { status: 413 })
  let raw: unknown
  try { raw = JSON.parse(rawText) } catch { return NextResponse.json({ accepted: false, code: 'invalid_json', error: 'JSON inválido.' }, { status: 400 }) }
  const event = validate(raw)
  if (!event) return NextResponse.json({ accepted: false, code: 'invalid_event', error: 'Evento inválido ou tipo não suportado.' }, { status: 400 })
  try {
    const db = requireDatabase()
    const rows = await db.select({ id: integrationConnections.id, workspaceId: integrationConnections.workspaceId, metadata: integrationConnections.metadata }).from(integrationConnections).where(eq(integrationConnections.provider, provider))
    const digest = createHash('sha256').update(bearer).digest()
    const connection = rows.find((row) => {
      const hash = row.metadata.tokenHash
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return false
      const stored = Buffer.from(hash, 'hex')
      return stored.length === digest.length && timingSafeEqual(stored, digest)
    })
    if (!connection) return NextResponse.json({ accepted: false, code: 'unauthorized', error: 'Token não autorizado.' }, { status: 401 })

    let mapping: typeof integrationAccountMappings.$inferSelect | undefined
    if (event.type !== 'account_discovered') {
      mapping = (await db.select().from(integrationAccountMappings).where(and(eq(integrationAccountMappings.connectionId, connection.id), eq(integrationAccountMappings.externalAccountId, String(event.accountId)))).limit(1))[0]
      if (!mapping?.tradingAccountId) return NextResponse.json({ accepted: false, code: 'account_unlinked', error: 'Conta ainda não vinculada no Ninja Control.' }, { status: 409 })
    }

    const sql = neon(databaseUrl)
    const now = new Date()
    const payload = { ...event, occurredAt: event.occurred.toISOString() }
    const statements = [sql`INSERT INTO integration_events (id, workspace_id, provider, event_type, idempotency_key, payload, received_at) VALUES (${randomUUID()}, ${connection.workspaceId}, ${provider}, ${event.type}, ${event.eventId}, ${JSON.stringify(payload)}::jsonb, ${now}) ON CONFLICT (workspace_id, provider, idempotency_key) DO NOTHING RETURNING id`]
    const accepted = sql`EXISTS (SELECT 1 FROM integration_events WHERE workspace_id = ${connection.workspaceId} AND provider = ${provider} AND idempotency_key = ${event.eventId} AND processed_at IS NULL)`
    if (event.type === 'account_discovered') {
      const accountLabel = `${String(event.accountName)} · ${event.accountMode === 'live' ? 'LIVE' : 'SIM'}`
      statements.push(sql`INSERT INTO integration_account_mappings (id, workspace_id, connection_id, external_account_id, external_account_name, last_seen_at) SELECT ${randomUUID()}, ${connection.workspaceId}, ${connection.id}, ${String(event.accountId)}, ${accountLabel}, ${now} WHERE ${accepted} ON CONFLICT (connection_id, external_account_id) DO UPDATE SET external_account_name = EXCLUDED.external_account_name, last_seen_at = EXCLUDED.last_seen_at, updated_at = now()`)
    }
    if (event.type === 'sync_start' && mapping) statements.push(sql`INSERT INTO integration_sync_batches (id, workspace_id, mapping_id, sync_id, status, started_at) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.id}, ${String(event.syncId)}, 'in_progress', ${event.occurred} WHERE ${accepted} ON CONFLICT (mapping_id, sync_id) DO NOTHING`)
    if (event.type === 'account_snapshot' && mapping?.tradingAccountId) statements.push(sql`INSERT INTO account_risk_snapshots (id, workspace_id, account_id, captured_at, balance_cents, equity_cents, daily_loss_cents, source, provider_values, currency, equity_method) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.tradingAccountId}, ${event.occurred}, ${integer(event.balanceCents)}, ${integer(event.equityCents)}, ${integer(event.dailyLossCents)}, 'NinjaTrader', ${JSON.stringify(event.providerValues ?? {})}::jsonb, ${typeof event.currency === 'string' ? event.currency : null}, ${typeof event.equityMethod === 'string' ? event.equityMethod : null} WHERE ${accepted}`)
    if (event.type === 'position_snapshot' && mapping) statements.push(sql`INSERT INTO integration_positions (id, workspace_id, mapping_id, instrument, quantity, average_price, unrealized_pnl_cents, captured_at, last_sync_id, updated_at) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.id}, ${String(event.instrument)}, ${integer(event.quantity)}, ${number(event.averagePrice, 0)}, ${integer(event.unrealizedPnlCents)}, ${event.occurred}, ${event.syncId ? String(event.syncId) : null}, now() WHERE ${accepted} ON CONFLICT (mapping_id, instrument) DO UPDATE SET quantity = EXCLUDED.quantity, average_price = EXCLUDED.average_price, unrealized_pnl_cents = EXCLUDED.unrealized_pnl_cents, captured_at = EXCLUDED.captured_at, last_sync_id = coalesce(EXCLUDED.last_sync_id, integration_positions.last_sync_id), updated_at = now() WHERE integration_positions.captured_at <= EXCLUDED.captured_at`)
    if (event.type === 'order' && mapping?.tradingAccountId) statements.push(sql`INSERT INTO trading_orders (id, workspace_id, account_id, external_id, provider_order_id, instrument, side, quantity, filled_quantity, average_fill_price, status, provider_status, order_type, limit_price, stop_price, time_in_force, oco_id, is_active, submitted_at, last_updated_at, last_sync_id, origin, provider) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.tradingAccountId}, ${String(event.orderId)}, ${boundedText(event.providerOrderId, 240)}, ${String(event.instrument)}, ${String(event.side)}, ${integer(event.quantity, 1)}, ${integer(event.filledQuantity, 0) ?? 0}, ${number(event.averageFillPrice, 0)}, ${String(event.status)}, ${boundedText(event.providerStatus, 48)}, ${boundedText(event.orderType, 40)}, ${number(event.limitPrice, 0)}, ${number(event.stopPrice, 0)}, ${boundedText(event.timeInForce, 24)}, ${boundedText(event.ocoId, 240)}, ${event.isActive === true || (event.isActive === undefined && !['filled', 'cancelled', 'rejected'].includes(String(event.status)))}, ${event.occurred}, ${event.occurred}, ${event.syncId ? String(event.syncId) : null}, 'provider', 'NinjaTrader' WHERE ${accepted} ON CONFLICT (account_id, provider, external_id) DO UPDATE SET provider_order_id = EXCLUDED.provider_order_id, instrument = EXCLUDED.instrument, side = EXCLUDED.side, quantity = EXCLUDED.quantity, filled_quantity = EXCLUDED.filled_quantity, average_fill_price = EXCLUDED.average_fill_price, status = EXCLUDED.status, provider_status = EXCLUDED.provider_status, order_type = EXCLUDED.order_type, limit_price = EXCLUDED.limit_price, stop_price = EXCLUDED.stop_price, time_in_force = EXCLUDED.time_in_force, oco_id = EXCLUDED.oco_id, is_active = EXCLUDED.is_active, last_updated_at = EXCLUDED.last_updated_at, last_sync_id = coalesce(EXCLUDED.last_sync_id, trading_orders.last_sync_id) WHERE trading_orders.last_updated_at IS NULL OR trading_orders.last_updated_at <= EXCLUDED.last_updated_at`)
    if (event.type === 'execution' && mapping?.tradingAccountId) statements.push(sql`INSERT INTO trade_executions (id, workspace_id, account_id, external_id, provider_order_id, instrument, side, quantity, price, point_value, commission_cents, commission_currency, currency, executed_at, origin, provider) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.tradingAccountId}, ${String(event.executionId)}, ${boundedText(event.orderId, 240)}, ${String(event.instrument)}, ${event.side === 'buy' || event.side === 'sell' ? String(event.side) : null}, ${integer(event.quantity, 1)}, ${number(event.price, 0)}, ${number(event.pointValue, 0.00000001)}, ${integer(event.commissionCents)}, ${boundedText(event.commissionCurrency, 12)}, ${boundedText(event.currency, 12)}, ${event.executedAt instanceof Date ? event.executedAt : event.occurred}, 'provider', 'NinjaTrader' WHERE ${accepted} ON CONFLICT (account_id, provider, external_id) DO UPDATE SET provider_order_id = EXCLUDED.provider_order_id, instrument = EXCLUDED.instrument, side = EXCLUDED.side, quantity = EXCLUDED.quantity, price = EXCLUDED.price, point_value = coalesce(EXCLUDED.point_value, trade_executions.point_value), commission_cents = coalesce(EXCLUDED.commission_cents, trade_executions.commission_cents), commission_currency = coalesce(EXCLUDED.commission_currency, trade_executions.commission_currency), currency = coalesce(EXCLUDED.currency, trade_executions.currency), executed_at = EXCLUDED.executed_at, voided_at = null`)
    if (event.type === 'execution_removed' && mapping?.tradingAccountId) statements.push(sql`UPDATE trade_executions SET voided_at = ${event.occurred} WHERE account_id = ${mapping.tradingAccountId} AND provider = 'NinjaTrader' AND external_id = ${String(event.executionId)} AND ${accepted}`)
    if (event.type === 'sync_complete' && mapping) {
      const batch = sql`EXISTS (SELECT 1 FROM integration_sync_batches WHERE mapping_id = ${mapping.id} AND sync_id = ${String(event.syncId)} AND status = 'in_progress')`
      statements.push(sql`UPDATE integration_positions SET quantity = 0, unrealized_pnl_cents = 0, captured_at = ${event.occurred}, updated_at = now() WHERE mapping_id = ${mapping.id} AND coalesce(last_sync_id, '') <> ${String(event.syncId)} AND ${accepted} AND ${batch}`)
      if (mapping.tradingAccountId) statements.push(sql`UPDATE trading_orders SET is_active = false, last_updated_at = ${event.occurred}, last_sync_id = ${String(event.syncId)} WHERE account_id = ${mapping.tradingAccountId} AND provider = 'NinjaTrader' AND is_active = true AND coalesce(last_sync_id, '') <> ${String(event.syncId)} AND ${accepted} AND ${batch}`)
      statements.push(sql`UPDATE integration_sync_batches SET status = 'complete', completed_at = ${event.occurred}, position_count = ${integer(event.positionCount, 0)}, order_count = ${integer(event.orderCount, 0)}, execution_count = ${integer(event.executionCount, 0)} WHERE mapping_id = ${mapping.id} AND sync_id = ${String(event.syncId)} AND status = 'in_progress' AND ${accepted}`)
    }
    if (mapping) statements.push(sql`UPDATE integration_account_mappings SET last_seen_at = ${now}, updated_at = ${now} WHERE id = ${mapping.id} AND ${accepted}`)
    statements.push(sql`UPDATE integration_events SET processed_at = ${now} WHERE workspace_id = ${connection.workspaceId} AND provider = ${provider} AND idempotency_key = ${event.eventId} AND processed_at IS NULL`)
    statements.push(sql`UPDATE integration_connections SET status = 'connected', last_synced_at = ${now}, updated_at = ${now} WHERE id = ${connection.id} AND EXISTS (SELECT 1 FROM integration_events WHERE workspace_id = ${connection.workspaceId} AND provider = ${provider} AND idempotency_key = ${event.eventId} AND processed_at IS NOT NULL)`)
    const result = await sql.transaction(statements)
    const inserted = Array.isArray(result[0]) && result[0].length > 0
    return NextResponse.json({ accepted: inserted, duplicate: !inserted, eventId: event.eventId }, { status: inserted ? 202 : 200 })
  } catch {
    return NextResponse.json({ accepted: false, code: 'processing_failed', error: 'Evento não processado; reenvie com o mesmo eventId.' }, { status: 500 })
  }
}
