import { createHash, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireDatabase } from '@/lib/db'
import { integrationConnections, marketInstrumentMetadataVersions, marketInstrumentSnapshots, marketInstruments, marketMinuteAggregates } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const provider = 'ninjatrader-desktop'
const maxBodyBytes = 64_000
const maxBatchItems = 256
const maxFutureSkewMs = 120_000

async function readBoundedText(request: Request) {
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBodyBytes) {
      await reader.cancel()
      throw new RangeError('payload_too_large')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(result)
}
const boundedText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const validPrice = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000_000_000
const optionalPrice = (value: unknown) => value === undefined || value === null || validPrice(value)
const isoDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

type InstrumentInput = { instrumentKey: string; symbol: string; kind: 'equity' | 'future'; sector: string | null; marketCapWeight: number | null; metadataSource: string | null; effectiveFrom: Date | null }
type QuoteInput = { instrumentKey: string; eventAt: Date; last: number; priorClose: number | null; bid: number | null; ask: number | null; sessionVolume: number | null; contractExpiry: string | null; sequence: number | null }

function parseBody(value: unknown): { sourceId: string; sentAt: Date; instruments: InstrumentInput[]; quotes: QuoteInput[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const sourceId = boundedText(raw.sourceId, 80)
  const sentAt = isoDate(raw.sentAt)
  if (!sourceId || !/^[A-Za-z0-9._:-]+$/.test(sourceId) || !sentAt || !Array.isArray(raw.instruments) || !Array.isArray(raw.quotes)) return null
  if (raw.instruments.length > maxBatchItems || raw.quotes.length > maxBatchItems) return null

  const instruments: InstrumentInput[] = []
  const instrumentKeys = new Set<string>()
  for (const entry of raw.instruments) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const row = entry as Record<string, unknown>
    const instrumentKey = boundedText(row.instrumentKey, 120)
    const symbol = boundedText(row.symbol, 32)
    const kind = row.kind
    const sector = row.sector === undefined || row.sector === null || row.sector === '' ? null : boundedText(row.sector, 80)
    const marketCapWeight = row.marketCapWeight === undefined || row.marketCapWeight === null ? null : row.marketCapWeight
    const metadataSource = row.metadataSource === undefined || row.metadataSource === null || row.metadataSource === '' ? null : boundedText(row.metadataSource, 120)
    const effectiveFrom = row.effectiveFrom === undefined || row.effectiveFrom === null || row.effectiveFrom === '' ? null : isoDate(row.effectiveFrom)
    if (!instrumentKey || !/^[A-Za-z0-9._ /-]+$/.test(instrumentKey) || !symbol || !/^[A-Za-z0-9._-]+$/.test(symbol) || (kind !== 'equity' && kind !== 'future') || instrumentKeys.has(instrumentKey)) return null
    if (row.sector !== undefined && row.sector !== null && row.sector !== '' && !sector) return null
    if (marketCapWeight !== null && (typeof marketCapWeight !== 'number' || !Number.isFinite(marketCapWeight) || marketCapWeight <= 0 || marketCapWeight > 100)) return null
    if (row.metadataSource !== undefined && row.metadataSource !== null && row.metadataSource !== '' && !metadataSource) return null
    if (row.effectiveFrom !== undefined && row.effectiveFrom !== null && row.effectiveFrom !== '' && !effectiveFrom) return null
    if ((sector !== null || marketCapWeight !== null) && (!metadataSource || !effectiveFrom)) return null
    instrumentKeys.add(instrumentKey)
    instruments.push({ instrumentKey, symbol: symbol.toUpperCase(), kind, sector, marketCapWeight: typeof marketCapWeight === 'number' ? marketCapWeight : null, metadataSource, effectiveFrom })
  }

  const quotes: QuoteInput[] = []
  const quoteKeys = new Set<string>()
  for (const entry of raw.quotes) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const row = entry as Record<string, unknown>
    const instrumentKey = boundedText(row.instrumentKey, 120)
    const eventAt = isoDate(row.eventAt)
    if (!instrumentKey || !instrumentKeys.has(instrumentKey) || quoteKeys.has(instrumentKey) || !eventAt || eventAt.getTime() > Date.now() + maxFutureSkewMs || !validPrice(row.last)) return null
    if (!optionalPrice(row.priorClose) || !optionalPrice(row.bid) || !optionalPrice(row.ask)) return null
    if (row.sessionVolume !== undefined && row.sessionVolume !== null && (typeof row.sessionVolume !== 'number' || !Number.isFinite(row.sessionVolume) || row.sessionVolume < 0 || row.sessionVolume > 1_000_000_000_000)) return null
    if (row.sequence !== undefined && row.sequence !== null && (!Number.isSafeInteger(row.sequence) || Number(row.sequence) < 0)) return null
    const contractExpiry = row.contractExpiry === undefined || row.contractExpiry === null ? null : boundedText(row.contractExpiry, 24)
    if (row.contractExpiry !== undefined && row.contractExpiry !== null && !contractExpiry) return null
    quoteKeys.add(instrumentKey)
    quotes.push({
      instrumentKey,
      eventAt,
      last: row.last as number,
      priorClose: typeof row.priorClose === 'number' ? row.priorClose : null,
      bid: typeof row.bid === 'number' ? row.bid : null,
      ask: typeof row.ask === 'number' ? row.ask : null,
      sessionVolume: typeof row.sessionVolume === 'number' ? row.sessionVolume : null,
      contractExpiry,
      sequence: typeof row.sequence === 'number' ? row.sequence : null,
    })
  }

  return { sourceId, sentAt, instruments, quotes }
}

export async function POST(request: Request) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{32,})$/)?.[1]
  if (!bearer) return NextResponse.json({ accepted: false, code: 'invalid_token', error: 'Bearer token ausente ou inválido.' }, { status: 401 })

  let rawText: string
  try { rawText = await readBoundedText(request) }
  catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ accepted: false, code: 'payload_too_large', error: 'Lote excede 64 KB.' }, { status: 413 })
    return NextResponse.json({ accepted: false, code: 'invalid_encoding', error: 'O corpo não contém UTF-8 válido.' }, { status: 400 })
  }
  let raw: unknown
  try { raw = JSON.parse(rawText) } catch { return NextResponse.json({ accepted: false, code: 'invalid_json', error: 'JSON inválido.' }, { status: 400 }) }
  const batch = parseBody(raw)
  if (!batch) return NextResponse.json({ accepted: false, code: 'invalid_market_batch', error: 'Lote de mercado inválido.' }, { status: 400 })
  if (batch.sentAt.getTime() > Date.now() + maxFutureSkewMs) return NextResponse.json({ accepted: false, code: 'invalid_clock', error: 'Relógio do AddOn adiantado além da tolerância.' }, { status: 400 })

  try {
    const db = requireDatabase()
    const connections = await db.select({ id: integrationConnections.id, workspaceId: integrationConnections.workspaceId, metadata: integrationConnections.metadata }).from(integrationConnections).where(eq(integrationConnections.provider, provider))
    const digest = createHash('sha256').update(bearer).digest()
    const connection = connections.find((row) => {
      const hash = row.metadata.tokenHash
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return false
      const stored = Buffer.from(hash, 'hex')
      return stored.length === digest.length && timingSafeEqual(stored, digest)
    })
    if (!connection) return NextResponse.json({ accepted: false, code: 'unauthorized', error: 'Token não autorizado.' }, { status: 401 })

    const now = new Date()
    const currentKeys = batch.instruments.map((item) => item.instrumentKey)
    if (currentKeys.length) {
      await db.update(marketInstruments).set({ active: false, updatedAt: now }).where(and(eq(marketInstruments.workspaceId, connection.workspaceId), eq(marketInstruments.provider, provider), eq(marketInstruments.active, true), notInArray(marketInstruments.instrumentKey, currentKeys)))
    } else {
      await db.update(marketInstruments).set({ active: false, updatedAt: now }).where(and(eq(marketInstruments.workspaceId, connection.workspaceId), eq(marketInstruments.provider, provider), eq(marketInstruments.active, true)))
    }
    if (batch.instruments.length) {
      await db.insert(marketInstruments).values(batch.instruments.map((item) => ({
        workspaceId: connection.workspaceId,
        provider,
        instrumentKey: item.instrumentKey,
        symbol: item.symbol,
        instrumentKind: item.kind,
        active: true,
        lastSeenAt: now,
        updatedAt: now,
      }))).onConflictDoUpdate({
        target: [marketInstruments.workspaceId, marketInstruments.provider, marketInstruments.instrumentKey],
        set: { symbol: sql`excluded.symbol`, instrumentKind: sql`excluded.instrument_kind`, active: true, lastSeenAt: now, updatedAt: now },
      })
    }

    const instruments = batch.instruments.length
      ? await db.select({ id: marketInstruments.id, key: marketInstruments.instrumentKey }).from(marketInstruments).where(and(eq(marketInstruments.workspaceId, connection.workspaceId), eq(marketInstruments.provider, provider), inArray(marketInstruments.instrumentKey, currentKeys)))
      : []
    const instrumentByKey = new Map(instruments.map((item) => [item.key, item.id]))
    if (batch.quotes.some((quote) => !instrumentByKey.has(quote.instrumentKey))) return NextResponse.json({ accepted: false, code: 'instrument_missing', error: 'Cotação não pertence ao universo enviado.' }, { status: 409 })

    const metadata = batch.instruments.filter((item) => item.effectiveFrom && item.metadataSource && (item.sector !== null || item.marketCapWeight !== null))
    for (const item of metadata) {
      const instrumentId = instrumentByKey.get(item.instrumentKey)!
      await db.update(marketInstrumentMetadataVersions).set({ effectiveUntil: item.effectiveFrom }).where(and(
        eq(marketInstrumentMetadataVersions.workspaceId, connection.workspaceId),
        eq(marketInstrumentMetadataVersions.instrumentId, instrumentId),
        lt(marketInstrumentMetadataVersions.effectiveFrom, item.effectiveFrom!),
        or(isNull(marketInstrumentMetadataVersions.effectiveUntil), gt(marketInstrumentMetadataVersions.effectiveUntil, item.effectiveFrom!)),
      ))
    }
    if (metadata.length) {
      await db.insert(marketInstrumentMetadataVersions).values(metadata.map((item) => ({
        workspaceId: connection.workspaceId,
        instrumentId: instrumentByKey.get(item.instrumentKey)!,
        effectiveFrom: item.effectiveFrom!,
        sector: item.sector,
        marketCapWeight: item.marketCapWeight,
        source: item.metadataSource!,
      }))).onConflictDoUpdate({
        target: [marketInstrumentMetadataVersions.workspaceId, marketInstrumentMetadataVersions.instrumentId, marketInstrumentMetadataVersions.effectiveFrom],
        set: { sector: sql`excluded.sector`, marketCapWeight: sql`excluded.market_cap_weight`, source: sql`excluded.source` },
      })
    }

    const quoteRows = batch.quotes.map((quote) => ({
      workspaceId: connection.workspaceId,
      instrumentId: instrumentByKey.get(quote.instrumentKey)!,
      sourceId: batch.sourceId,
      eventAt: quote.eventAt,
      receivedAt: now,
      lastPrice: quote.last,
      priorClose: quote.priorClose,
      bid: quote.bid,
      ask: quote.ask,
      sessionVolume: quote.sessionVolume,
      contractExpiry: quote.contractExpiry,
      sequence: quote.sequence,
    }))
    if (quoteRows.length) {
      await db.insert(marketInstrumentSnapshots).values(quoteRows).onConflictDoUpdate({
        target: [marketInstrumentSnapshots.workspaceId, marketInstrumentSnapshots.instrumentId],
        set: {
          sourceId: sql`excluded.source_id`, eventAt: sql`excluded.event_at`, receivedAt: now,
          lastPrice: sql`excluded.last_price`, priorClose: sql`excluded.prior_close`, bid: sql`excluded.bid`, ask: sql`excluded.ask`,
          sessionVolume: sql`excluded.session_volume`, contractExpiry: sql`excluded.contract_expiry`, sequence: sql`excluded.sequence`,
        },
        setWhere: sql`${marketInstrumentSnapshots.eventAt} < excluded.event_at OR (${marketInstrumentSnapshots.eventAt} = excluded.event_at AND coalesce(${marketInstrumentSnapshots.sequence}, -1) < coalesce(excluded.sequence, -1))`,
      })
      const aggregateRows = quoteRows.map((row) => ({ ...row, minuteStart: new Date(Math.floor(row.eventAt.getTime() / 60_000) * 60_000) }))
      await db.insert(marketMinuteAggregates).values(aggregateRows.map((row) => ({
        workspaceId: row.workspaceId, instrumentId: row.instrumentId, minuteStart: row.minuteStart, eventAt: row.eventAt,
        receivedAt: row.receivedAt, lastPrice: row.lastPrice, priorClose: row.priorClose,
        sessionVolume: row.sessionVolume, sequence: row.sequence,
      }))).onConflictDoUpdate({
        target: [marketMinuteAggregates.workspaceId, marketMinuteAggregates.instrumentId, marketMinuteAggregates.minuteStart],
        set: {
          eventAt: sql`excluded.event_at`, receivedAt: now, lastPrice: sql`excluded.last_price`,
          priorClose: sql`excluded.prior_close`, sessionVolume: sql`excluded.session_volume`, sequence: sql`excluded.sequence`,
        },
        setWhere: sql`${marketMinuteAggregates.eventAt} < excluded.event_at OR (${marketMinuteAggregates.eventAt} = excluded.event_at AND coalesce(${marketMinuteAggregates.sequence}, -1) < coalesce(excluded.sequence, -1))`,
      })
    }
    await db.update(integrationConnections).set({ status: 'connected', lastSyncedAt: now, updatedAt: now }).where(eq(integrationConnections.id, connection.id))
    return NextResponse.json({ accepted: batch.quotes.length, ignored: 0, receivedAt: now.toISOString() })
  } catch (error) {
    console.error('NinjaTrader market batch rejected by server', error)
    return NextResponse.json({ accepted: false, code: 'market_storage_unavailable', error: 'Não foi possível persistir o lote de mercado.' }, { status: 503 })
  }
}
