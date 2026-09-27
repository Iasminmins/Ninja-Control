import { createHash, timingSafeEqual, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { requireDatabase } from '@/lib/db'
import { integrationConnections, tradingAccounts } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type EventType = 'heartbeat' | 'trade' | 'order' | 'risk_snapshot' | 'divergence' | 'alert'
type IncomingEvent = Record<string, unknown> & { eventId: string; type: EventType; occurredAt: Date }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function integer(value: unknown, { optional = false, minimum = 0 }: { optional?: boolean; minimum?: number } = {}): number | null | undefined {
  if (value === undefined || value === null || value === '') return optional ? null : undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined
}

function text(value: unknown, maximum: number, optional = false): string | null | undefined {
  if (value === undefined || value === null || value === '') return optional ? null : undefined
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) return undefined
  return value.trim()
}

function date(value: unknown, optional = false): Date | null | undefined {
  if (value === undefined || value === null || value === '') return optional ? null : undefined
  if (typeof value !== 'string') return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed
}

function simpleMap(value: unknown, kind: 'factor' | 'filter') {
  if (value === undefined || value === null) return {}
  if (!isRecord(value) || Object.keys(value).length > 80) return null
  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (key.length > 80) return null
    if (kind === 'filter' && raw !== null && typeof raw !== 'boolean') return null
    if (typeof raw === 'string' && raw.length > 240) return null
    if (raw !== null && !['string', 'number', 'boolean'].includes(typeof raw)) return null
    if (typeof raw === 'number' && !Number.isFinite(raw)) return null
    result[key] = raw as string | number | boolean | null
  }
  return result
}

function parseEvent(raw: unknown): IncomingEvent | null {
  if (!isRecord(raw)) return null
  const eventId = text(raw.eventId, 160)
  const type = raw.type
  const occurredAt = date(raw.occurredAt)
  if (!eventId || !/^[a-zA-Z0-9._:-]+$/.test(eventId) || !occurredAt || !['heartbeat', 'trade', 'order', 'risk_snapshot', 'divergence', 'alert'].includes(String(type))) return null

  const base = { ...raw, eventId, type: type as EventType, occurredAt }
  if (type === 'heartbeat') {
    const nodeName = text(raw.nodeName, 120)
    const role = typeof raw.role === 'string' ? raw.role.toLowerCase() : ''
    const latencyMs = integer(raw.latencyMs, { optional: true })
    if (!nodeName || !['master', 'slave'].includes(role) || latencyMs === undefined) return null
    const position = simpleMap(raw.position, 'factor')
    if (position === null) return null
    return { ...base, nodeName, role, latencyMs, position }
  }

  if (type === 'trade') {
    const accountId = text(raw.accountId, 36)
    const instrument = text(raw.instrument, 40)
    const side = typeof raw.side === 'string' ? raw.side.toLowerCase() : ''
    const quantity = integer(raw.quantity, { minimum: 1 })
    const openedAt = date(raw.openedAt)
    const closedAt = date(raw.closedAt)
    const netPnlCents = integer(raw.netPnlCents, { minimum: -2_000_000_000 })
    const entryPrice = raw.entryPrice === undefined || raw.entryPrice === null ? null : Number(raw.entryPrice)
    const exitPrice = raw.exitPrice === undefined || raw.exitPrice === null ? null : Number(raw.exitPrice)
    const maeCents = integer(raw.maeCents, { optional: true })
    const mfeCents = integer(raw.mfeCents, { optional: true })
    const riskReward = raw.riskReward === undefined || raw.riskReward === null ? null : Number(raw.riskReward)
    const durationSeconds = integer(raw.durationSeconds, { optional: true })
    const hunterFamily = text(raw.hunterFamily, 20, true)
    const setupCode = text(raw.setupCode, 80, true)
    const hunterVersion = text(raw.hunterVersion, 80, true)
    const session = text(raw.session, 80, true)
    const notes = text(raw.notes, 4000, true)
    const patterns = raw.patternCodes === undefined ? [] : raw.patternCodes
    if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId) || !instrument || !['long', 'short'].includes(side) || quantity === undefined || !openedAt || !closedAt || netPnlCents === undefined || closedAt < openedAt) return null
    if ((entryPrice !== null && (!Number.isFinite(entryPrice) || entryPrice <= 0)) || (exitPrice !== null && (!Number.isFinite(exitPrice) || exitPrice <= 0)) || (riskReward !== null && !Number.isFinite(riskReward))) return null
    if (maeCents === undefined || mfeCents === undefined || durationSeconds === undefined || hunterFamily === undefined || setupCode === undefined || hunterVersion === undefined || session === undefined || notes === undefined) return null
    if (!Array.isArray(patterns) || patterns.length > 30 || patterns.some((item) => typeof item !== 'string' || !item.trim() || item.length > 80)) return null
    const factors = simpleMap(raw.factors, 'factor')
    const filters = simpleMap(raw.filters, 'filter')
    if (factors === null || filters === null) return null
    return { ...base, accountId, instrument, side, quantity, openedAt, closedAt, netPnlCents, entryPrice, exitPrice, maeCents, mfeCents, riskReward, durationSeconds, hunterFamily, setupCode, hunterVersion, session, notes, patternCodes: patterns.map((item) => (item as string).trim()), factors, filters }
  }

  if (type === 'order') {
    const accountId = text(raw.accountId, 36)
    const externalId = text(raw.externalId, 240)
    const instrument = text(raw.instrument, 40)
    const side = typeof raw.side === 'string' ? raw.side.toLowerCase() : ''
    const quantity = integer(raw.quantity, { minimum: 1 })
    const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : ''
    if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId) || !instrument || !['buy', 'sell', 'long', 'short'].includes(side) || quantity === undefined || !['pending', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected'].includes(status)) return null
    return { ...base, accountId, externalId, instrument, side: ['buy', 'long'].includes(side) ? 'buy' : 'sell', quantity, status }
  }

  if (type === 'risk_snapshot') {
    const accountId = text(raw.accountId, 36)
    if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return null
    const fields = ['balanceCents', 'equityCents', 'peakBalanceCents', 'maxDrawdownCents', 'currentDrawdownCents', 'remainingDrawdownCents', 'dailyLossCents', 'contractsOpen', 'exposureCents'] as const
    const values: Record<string, number | null> = {}
    for (const field of fields) {
      const parsed = integer(raw[field], { optional: true, minimum: field === 'contractsOpen' ? 0 : -2_000_000_000 })
      if (parsed === undefined) return null
      values[field] = parsed
    }
    return { ...base, accountId, ...values }
  }

  if (type === 'alert') {
    const accountId = text(raw.accountId, 36, true)
    const message = text(raw.message, 2000)
    const severity = typeof raw.severity === 'string' ? raw.severity.toUpperCase() : ''
    if (accountId === undefined || (accountId && !/^[0-9a-f-]{36}$/i.test(accountId)) || !message || !['INFO', 'WARNING', 'HIGH', 'CRITICAL'].includes(severity)) return null
    return { ...base, accountId, message, severity }
  }

  const kind = text(raw.kind, 60)
  const details = simpleMap(raw.details, 'factor')
  if (!kind || details === null) return null
  return { ...base, kind, details }
}

function sideForTrade(side: string) { return side === 'long' ? 'buy' : 'sell' }

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,})$/)?.[1]
  if (!bearer) return NextResponse.json({ error: 'Bearer token ausente ou inválido.' }, { status: 401 })

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return NextResponse.json({ error: 'Banco não configurado.' }, { status: 503 })
  const db = requireDatabase()

  try {
    const rows = await db.select({ id: integrationConnections.id, workspaceId: integrationConnections.workspaceId, metadata: integrationConnections.metadata })
      .from(integrationConnections).where(eq(integrationConnections.provider, 'hunter-webhook'))
    const digest = createHash('sha256').update(bearer).digest()
    const connection = rows.find((row) => {
      const value = row.metadata.tokenHash
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false
      const stored = Buffer.from(value, 'hex')
      return stored.length === digest.length && timingSafeEqual(stored, digest)
    })
    if (!connection) return NextResponse.json({ error: 'Token não autorizado.' }, { status: 401 })

    const rawText = await request.text()
    if (Buffer.byteLength(rawText, 'utf8') > 64_000) return NextResponse.json({ error: 'Evento excede o limite de 64 KB.' }, { status: 413 })
    let raw: unknown
    try { raw = JSON.parse(rawText) } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }
    const event = parseEvent(raw)
    if (!event) return NextResponse.json({ error: 'Evento inválido ou campos fora do contrato.' }, { status: 400 })

    if (['trade', 'order', 'risk_snapshot'].includes(event.type) || (event.type === 'alert' && event.accountId)) {
      const [account] = await db.select({ id: tradingAccounts.id }).from(tradingAccounts).where(and(eq(tradingAccounts.id, String(event.accountId)), eq(tradingAccounts.workspaceId, connection.workspaceId))).limit(1)
      if (!account) return NextResponse.json({ error: 'Conta não pertence ao workspace deste token.' }, { status: 404 })
    }

    const claim = randomUUID()
    const eventId = randomUUID()
    const tradeId = event.type === 'trade' ? randomUUID() : null
    const now = new Date()
    const cleanPayload = { ...event, occurredAt: event.occurredAt.toISOString(), ...(event.openedAt instanceof Date ? { openedAt: event.openedAt.toISOString() } : {}), ...(event.closedAt instanceof Date ? { closedAt: event.closedAt.toISOString() } : {}), _claim: claim }
    const sql = neon(databaseUrl)
    const activeClaim = sql`EXISTS (SELECT 1 FROM integration_events WHERE workspace_id = ${connection.workspaceId} AND provider = 'hunter' AND idempotency_key = ${event.eventId} AND payload->>'_claim' = ${claim})`
    const queued = await sql.transaction((tx) => {
      const statements = [
        tx`INSERT INTO integration_events (id, workspace_id, provider, event_type, idempotency_key, payload, received_at) VALUES (${eventId}, ${connection.workspaceId}, 'hunter', ${event.type}, ${event.eventId}, ${JSON.stringify(cleanPayload)}::jsonb, ${now}) ON CONFLICT (workspace_id, provider, idempotency_key) DO NOTHING RETURNING id`,
        tx`INSERT INTO operation_events (id, workspace_id, event_type, status, occurred_at, payload, origin, provider, external_id, account_id) SELECT gen_random_uuid(), ${connection.workspaceId}, ${event.type}, ${event.type === 'alert' ? 'attention' : 'success'}, ${event.occurredAt}, ${JSON.stringify(event)}::jsonb, 'provider', 'Hunter', ${event.eventId}, ${'accountId' in event ? event.accountId : null} WHERE ${activeClaim}`,
      ]

      if (event.type === 'heartbeat') statements.push(tx`INSERT INTO execution_nodes (id, workspace_id, name, role, status, last_heartbeat_at, metadata) SELECT gen_random_uuid(), ${connection.workspaceId}, ${event.nodeName}, ${event.role}, 'online', ${event.occurredAt}, ${JSON.stringify({ latencyMs: event.latencyMs, position: event.position, lastEventId: event.eventId })}::jsonb WHERE ${activeClaim} ON CONFLICT (workspace_id, name) DO UPDATE SET role = EXCLUDED.role, status = 'online', last_heartbeat_at = EXCLUDED.last_heartbeat_at, metadata = EXCLUDED.metadata, updated_at = now()`)

      if (event.type === 'order') statements.push(tx`INSERT INTO trading_orders (id, workspace_id, account_id, external_id, instrument, side, quantity, status, submitted_at, origin, provider) SELECT gen_random_uuid(), ${connection.workspaceId}, ${event.accountId}, ${event.externalId ?? null}, ${event.instrument}, ${event.side}, ${event.quantity}, ${event.status}, ${event.occurredAt}, 'provider', 'Hunter' WHERE ${activeClaim} ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`)

      if (event.type === 'trade' && tradeId) {
        statements.push(tx`INSERT INTO trades (id, workspace_id, account_id, instrument, side, opened_at, closed_at, net_pnl_cents, setup, session, tags, notes, origin, source) SELECT ${tradeId}, ${connection.workspaceId}, ${event.accountId}, ${event.instrument}, ${sideForTrade(String(event.side))}, ${event.openedAt}, ${event.closedAt}, ${event.netPnlCents}, ${event.setupCode}, ${event.session}, ${JSON.stringify(event.patternCodes)}::jsonb, ${event.notes}, 'provider', ${JSON.stringify({ provider: 'Hunter', externalId: event.eventId })}::jsonb WHERE ${activeClaim}`)
        statements.push(tx`INSERT INTO trade_contexts (id, workspace_id, trade_id, entry_price, exit_price, mae_cents, mfe_cents, risk_reward, duration_seconds, quantity, hunter_family, setup_code, pattern_codes, factors, filters, hunter_version, master_node, slave_node, dd_before_cents, dd_after_cents) SELECT gen_random_uuid(), ${connection.workspaceId}, ${tradeId}, ${event.entryPrice}, ${event.exitPrice}, ${event.maeCents}, ${event.mfeCents}, ${event.riskReward}, ${event.durationSeconds}, ${event.quantity}, ${event.hunterFamily}, ${event.setupCode}, ${JSON.stringify(event.patternCodes)}::jsonb, ${JSON.stringify(event.factors)}::jsonb, ${JSON.stringify(event.filters)}::jsonb, ${event.hunterVersion}, ${event.masterNode ?? null}, ${event.slaveNode ?? null}, ${event.ddBeforeCents ?? null}, ${event.ddAfterCents ?? null} WHERE EXISTS (SELECT 1 FROM trades WHERE id = ${tradeId})`)
        statements.push(tx`INSERT INTO journal_entries (id, workspace_id, trade_id, plan, notes, tags, review) SELECT gen_random_uuid(), ${connection.workspaceId}, ${tradeId}, ${event.setupCode}, ${event.notes}, ${JSON.stringify(event.patternCodes)}::jsonb, NULL WHERE EXISTS (SELECT 1 FROM trades WHERE id = ${tradeId})`)
        for (const patternCode of event.patternCodes as string[]) {
          statements.push(tx`INSERT INTO patterns (id, workspace_id, name, description, definition) SELECT gen_random_uuid(), ${connection.workspaceId}, ${patternCode}, 'Padrão identificado pelo conector Hunter.', '{}'::jsonb WHERE EXISTS (SELECT 1 FROM trades WHERE id = ${tradeId}) ON CONFLICT (workspace_id, name) DO NOTHING`)
          statements.push(tx`INSERT INTO pattern_occurrences (id, pattern_id, trade_id, factors, observed_at) SELECT gen_random_uuid(), p.id, ${tradeId}, ${JSON.stringify(event.factors)}::jsonb, ${event.occurredAt} FROM patterns p WHERE p.workspace_id = ${connection.workspaceId} AND p.name = ${patternCode} AND EXISTS (SELECT 1 FROM trades WHERE id = ${tradeId}) ON CONFLICT (pattern_id, trade_id) DO NOTHING`)
        }
      }

      if (event.type === 'risk_snapshot') statements.push(tx`INSERT INTO account_risk_snapshots (id, workspace_id, account_id, captured_at, balance_cents, equity_cents, peak_balance_cents, max_drawdown_cents, current_drawdown_cents, remaining_drawdown_cents, daily_loss_cents, contracts_open, exposure_cents, source) SELECT gen_random_uuid(), ${connection.workspaceId}, ${event.accountId}, ${event.occurredAt}, ${event.balanceCents}, ${event.equityCents}, ${event.peakBalanceCents}, ${event.maxDrawdownCents}, ${event.currentDrawdownCents}, ${event.remainingDrawdownCents}, ${event.dailyLossCents}, ${event.contractsOpen}, ${event.exposureCents}, 'Hunter' WHERE ${activeClaim}`)

      if (event.type === 'divergence') statements.push(tx`INSERT INTO execution_divergences (id, workspace_id, kind, details, detected_at) SELECT gen_random_uuid(), ${connection.workspaceId}, ${event.kind}, ${JSON.stringify(event.details)}::jsonb, ${event.occurredAt} WHERE ${activeClaim}`)

      if (event.type === 'alert') statements.push(tx`INSERT INTO alert_events (id, workspace_id, account_id, message, severity, occurred_at, details) SELECT gen_random_uuid(), ${connection.workspaceId}, ${event.accountId ?? null}, ${event.message}, ${event.severity}, ${event.occurredAt}, ${JSON.stringify({ eventId: event.eventId, origin: 'Hunter' })}::jsonb WHERE ${activeClaim}`)

      statements.push(tx`UPDATE integration_events SET processed_at = ${now}, payload = payload - '_claim' WHERE workspace_id = ${connection.workspaceId} AND provider = 'hunter' AND idempotency_key = ${event.eventId} AND payload->>'_claim' = ${claim} RETURNING id`)
      statements.push(tx`UPDATE integration_connections SET status = 'connected', last_synced_at = ${now}, updated_at = ${now} WHERE id = ${connection.id} AND ${activeClaim}`)
      return statements
    })
    const accepted = Array.isArray(queued[0]) && queued[0].length > 0
    return NextResponse.json({ accepted, duplicate: !accepted }, { status: accepted ? 202 : 200 })
  } catch {
    return NextResponse.json({ error: 'Evento não processado; é seguro reenviar com o mesmo eventId.' }, { status: 500 })
  }
}
