import { createHash, timingSafeEqual, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { requireDatabase } from '@/lib/db'
import { integrationAccountMappings, integrationConnections } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const provider = 'ninjatrader-desktop'
type Payload = Record<string, unknown> & { eventId: string; type: string; occurredAt: string; accountId?: string }
const boundedText = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null
const integer = (v: unknown, min = -2_000_000_000, max = 2_000_000_000) => Number.isInteger(v) && Number(v) >= min && Number(v) <= max ? Number(v) : null
const number = (v: unknown, min = -1_000_000_000, max = 1_000_000_000) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null

function validate(input: unknown): (Payload & { occurred: Date }) | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const eventId = boundedText(raw.eventId, 240)
  const type = boundedText(raw.type, 40)
  const occurredAt = boundedText(raw.occurredAt, 60)
  const occurred = occurredAt ? new Date(occurredAt) : null
  if (!eventId || !/^[A-Za-z0-9._:-]+$/.test(eventId) || !type || !occurred || !Number.isFinite(occurred.getTime())) return null
  if (type === 'account_discovered') {
    const accountMode = raw.accountMode === undefined ? 'simulation' : raw.accountMode
    if (accountMode !== 'live' && accountMode !== 'simulation') return null
    return boundedText(raw.accountId, 240) && boundedText(raw.accountName, 120) ? { ...raw, accountMode, eventId, type, occurredAt, occurred } as Payload & { occurred: Date } : null
  }
  const accountId = boundedText(raw.accountId, 240)
  if (!accountId) return null
  if (type === 'account_snapshot') {
    for (const key of ['balanceCents', 'equityCents', 'dailyLossCents', 'unrealizedPnlCents']) if (raw[key] !== undefined && raw[key] !== null && integer(raw[key]) === null) return null
    return { ...raw, eventId, type, accountId, occurredAt, occurred } as Payload & { occurred: Date }
  }
  if (type === 'position_snapshot') {
    if (!boundedText(raw.instrument, 80) || integer(raw.quantity) === null) return null
    if (raw.averagePrice !== undefined && raw.averagePrice !== null && number(raw.averagePrice, 0) === null) return null
    if (raw.unrealizedPnlCents !== undefined && raw.unrealizedPnlCents !== null && integer(raw.unrealizedPnlCents) === null) return null
    return { ...raw, eventId, type, accountId, occurredAt, occurred } as Payload & { occurred: Date }
  }
  if (type === 'order') {
    if (!boundedText(raw.instrument, 80) || !['buy', 'sell'].includes(String(raw.side)) || integer(raw.quantity, 1) === null || !['pending', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected'].includes(String(raw.status))) return null
    return { ...raw, eventId, type, accountId, occurredAt, occurred } as Payload & { occurred: Date }
  }
  if (type === 'execution') {
    if (!boundedText(raw.executionId, 240) || !boundedText(raw.instrument, 80) || !['buy', 'sell'].includes(String(raw.side)) || integer(raw.quantity, 1) === null || number(raw.price, 0) === null) return null
    return { ...raw, eventId, type, accountId, occurredAt, occurred } as Payload & { occurred: Date }
  }
  return null
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,})$/)?.[1]
  if (!bearer) return NextResponse.json({ error: 'Bearer token ausente ou inválido.' }, { status: 401 })
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return NextResponse.json({ error: 'Banco não configurado.' }, { status: 503 })
  const rawText = await request.text()
  if (Buffer.byteLength(rawText, 'utf8') > 64_000) return NextResponse.json({ error: 'Evento excede o limite de 64 KB.' }, { status: 413 })
  let raw: unknown
  try { raw = JSON.parse(rawText) } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }
  const event = validate(raw)
  if (!event) return NextResponse.json({ error: 'Evento inválido ou tipo não suportado.' }, { status: 400 })
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
    if (!connection) return NextResponse.json({ error: 'Token não autorizado.' }, { status: 401 })

    let mapping: typeof integrationAccountMappings.$inferSelect | undefined
    if (event.type !== 'account_discovered') {
      mapping = (await db.select().from(integrationAccountMappings).where(and(eq(integrationAccountMappings.connectionId, connection.id), eq(integrationAccountMappings.externalAccountId, String(event.accountId)))).limit(1))[0]
      if (!mapping?.tradingAccountId) return NextResponse.json({ error: 'Conta ainda não vinculada no Ninja Control.' }, { status: 409 })
    }

    const sql = neon(databaseUrl)
    const now = new Date()
    const payload = { ...event, occurredAt: event.occurred.toISOString() }
    const statements = [sql`INSERT INTO integration_events (id, workspace_id, provider, event_type, idempotency_key, payload, received_at) VALUES (${randomUUID()}, ${connection.workspaceId}, ${provider}, ${event.type}, ${event.eventId}, ${JSON.stringify(payload)}::jsonb, ${now}) ON CONFLICT (workspace_id, provider, idempotency_key) DO NOTHING RETURNING id`]
    const accepted = sql`EXISTS (SELECT 1 FROM integration_events WHERE workspace_id = ${connection.workspaceId} AND provider = ${provider} AND idempotency_key = ${event.eventId} AND processed_at IS NULL)`
    if (event.type === 'account_discovered') {
      const modeLabel = event.accountMode === 'live' ? 'LIVE' : 'SIM'
      const accountLabel = `${String(event.accountName)} · ${modeLabel}`
      statements.push(sql`INSERT INTO integration_account_mappings (id, workspace_id, connection_id, external_account_id, external_account_name, last_seen_at) SELECT ${randomUUID()}, ${connection.workspaceId}, ${connection.id}, ${String(event.accountId)}, ${accountLabel}, ${event.occurred} WHERE ${accepted} ON CONFLICT (connection_id, external_account_id) DO UPDATE SET external_account_name = EXCLUDED.external_account_name, last_seen_at = EXCLUDED.last_seen_at, updated_at = now()`)
    }
    if (event.type === 'account_snapshot' && mapping?.tradingAccountId) statements.push(sql`INSERT INTO account_risk_snapshots (id, workspace_id, account_id, captured_at, balance_cents, equity_cents, daily_loss_cents, source) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.tradingAccountId}, ${event.occurred}, ${integer(event.balanceCents, -2_000_000_000)}, ${integer(event.equityCents, -2_000_000_000)}, ${integer(event.dailyLossCents, -2_000_000_000)}, 'NinjaTrader' WHERE ${accepted}`)
    if (event.type === 'position_snapshot' && mapping) statements.push(sql`INSERT INTO integration_positions (id, workspace_id, mapping_id, instrument, quantity, average_price, unrealized_pnl_cents, captured_at, updated_at) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.id}, ${String(event.instrument)}, ${integer(event.quantity)}, ${number(event.averagePrice, 0)}, ${integer(event.unrealizedPnlCents, -2_000_000_000)}, ${event.occurred}, now() WHERE ${accepted} ON CONFLICT (mapping_id, instrument) DO UPDATE SET quantity = EXCLUDED.quantity, average_price = EXCLUDED.average_price, unrealized_pnl_cents = EXCLUDED.unrealized_pnl_cents, captured_at = EXCLUDED.captured_at, updated_at = now()`)
    if (event.type === 'order' && mapping?.tradingAccountId) statements.push(sql`INSERT INTO trading_orders (id, workspace_id, account_id, external_id, instrument, side, quantity, status, submitted_at, origin, provider) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.tradingAccountId}, ${String(event.orderId ?? event.eventId)}, ${String(event.instrument)}, ${String(event.side)}, ${integer(event.quantity, 1)}, ${String(event.status)}, ${event.occurred}, 'provider', 'NinjaTrader' WHERE ${accepted} ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`)
    if (event.type === 'execution' && mapping?.tradingAccountId) statements.push(sql`INSERT INTO trade_executions (id, workspace_id, account_id, external_id, instrument, side, quantity, price, executed_at, origin, provider) SELECT ${randomUUID()}, ${connection.workspaceId}, ${mapping.tradingAccountId}, ${String(event.executionId)}, ${String(event.instrument)}, ${String(event.side)}, ${integer(event.quantity, 1)}, ${number(event.price, 0)}, ${event.occurred}, 'provider', 'NinjaTrader' WHERE ${accepted} ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`)
    statements.push(sql`UPDATE integration_events SET processed_at = ${now} WHERE workspace_id = ${connection.workspaceId} AND provider = ${provider} AND idempotency_key = ${event.eventId} AND processed_at IS NULL`)
    statements.push(sql`UPDATE integration_connections SET status = 'connected', last_synced_at = ${now}, updated_at = ${now} WHERE id = ${connection.id} AND EXISTS (SELECT 1 FROM integration_events WHERE workspace_id = ${connection.workspaceId} AND provider = ${provider} AND idempotency_key = ${event.eventId} AND processed_at IS NOT NULL)`)
    const result = await sql.transaction(statements)
    const inserted = Array.isArray(result[0]) && result[0].length > 0
    return NextResponse.json({ accepted: inserted, duplicate: !inserted }, { status: inserted ? 202 : 200 })
  } catch {
    return NextResponse.json({ error: 'Evento não processado; reenvie com o mesmo eventId.' }, { status: 500 })
  }
}
