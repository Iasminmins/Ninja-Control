import 'server-only'

import { and, asc, desc, eq, gt, gte, isNull, lte, or } from 'drizzle-orm'
import { requireDatabase } from '@/lib/db'
import { marketInstrumentMetadataVersions, marketInstrumentSnapshots, marketInstruments, marketMinuteAggregates } from '@/lib/db/schema'
import type { FuturesConfirmation, MarketContext, MarketInstrumentView, MarketReturnWindow } from './types'

const provider = 'ninjatrader-desktop'
const configuredStaleAfterMs = Number(process.env.MARKET_CONTEXT_STALE_AFTER_MS)
const configuredMinimumCoveragePercent = Number(process.env.MARKET_CONTEXT_MINIMUM_COVERAGE_PERCENT)
const initialStaleAfterMs = Number.isFinite(configuredStaleAfterMs) && configuredStaleAfterMs >= 5_000 && configuredStaleAfterMs <= 300_000 ? configuredStaleAfterMs : 20_000
const minimumCoveragePercent = Number.isFinite(configuredMinimumCoveragePercent) && configuredMinimumCoveragePercent >= 50 && configuredMinimumCoveragePercent <= 100 ? configuredMinimumCoveragePercent : 70
const maximumConfiguredInstruments = 256
const maximumIntradayBaselineAgeMs = 90_000
const finitePositive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

function nearestPrior(rows: typeof marketMinuteAggregates.$inferSelect[], target: number) {
  let match: typeof rows[number] | undefined
  for (const row of rows) {
    if (row.eventAt.getTime() <= target && (!match || row.eventAt > match.eventAt)) match = row
  }
  return match
}

function pct(last: number | null, baseline: number | null) {
  return finitePositive(last) && finitePositive(baseline) ? ((last - baseline) / baseline) * 100 : null
}

export async function getMarketContext(workspaceId: string, returnWindow: MarketReturnWindow = 'session', asOf = new Date()): Promise<MarketContext> {
  const db = requireDatabase()
  const lowerBound = new Date(asOf.getTime() - 60 * 60_000)
  const [configured, latest, minuteRows, metadataRows] = await Promise.all([
    db.select().from(marketInstruments).where(and(eq(marketInstruments.workspaceId, workspaceId), eq(marketInstruments.provider, provider), eq(marketInstruments.active, true))).orderBy(asc(marketInstruments.symbol)).limit(maximumConfiguredInstruments),
    db.select({ instrumentId: marketInstrumentSnapshots.instrumentId, sourceId: marketInstrumentSnapshots.sourceId, eventAt: marketInstrumentSnapshots.eventAt, receivedAt: marketInstrumentSnapshots.receivedAt, last: marketInstrumentSnapshots.lastPrice, priorClose: marketInstrumentSnapshots.priorClose, bid: marketInstrumentSnapshots.bid, ask: marketInstrumentSnapshots.ask, sessionVolume: marketInstrumentSnapshots.sessionVolume, contractExpiry: marketInstrumentSnapshots.contractExpiry }).from(marketInstrumentSnapshots).where(eq(marketInstrumentSnapshots.workspaceId, workspaceId)).limit(maximumConfiguredInstruments),
    db.select().from(marketMinuteAggregates).where(and(eq(marketMinuteAggregates.workspaceId, workspaceId), gte(marketMinuteAggregates.minuteStart, lowerBound), lte(marketMinuteAggregates.minuteStart, asOf))).orderBy(asc(marketMinuteAggregates.minuteStart)).limit(maximumConfiguredInstruments * 60),
    db.selectDistinctOn([marketInstrumentMetadataVersions.instrumentId]).from(marketInstrumentMetadataVersions).where(and(eq(marketInstrumentMetadataVersions.workspaceId, workspaceId), lte(marketInstrumentMetadataVersions.effectiveFrom, asOf), or(isNull(marketInstrumentMetadataVersions.effectiveUntil), gt(marketInstrumentMetadataVersions.effectiveUntil, asOf)))).orderBy(asc(marketInstrumentMetadataVersions.instrumentId), desc(marketInstrumentMetadataVersions.effectiveFrom)).limit(maximumConfiguredInstruments),
  ])
  const latestByInstrument = new Map(latest.map((row) => [row.instrumentId, row]))
  const metadataByInstrument = new Map(metadataRows.map((row) => [row.instrumentId, row]))
  const historyByInstrument = new Map<string, typeof minuteRows>()
  for (const row of minuteRows) historyByInstrument.set(row.instrumentId, [...(historyByInstrument.get(row.instrumentId) ?? []), row])

  const quoteView = (instrument: typeof configured[number]): MarketInstrumentView => {
    const quote = latestByInstrument.get(instrument.id)
    const metadata = metadataByInstrument.get(instrument.id)
    const history = historyByInstrument.get(instrument.id) ?? []
    const price = quote?.last ?? null
    const ageMs = quote ? Math.max(0, asOf.getTime() - quote.eventAt.getTime()) : null
    let baseline: number | null = quote?.priorClose ?? null
    if (returnWindow !== 'session') {
      const target = asOf.getTime() - (returnWindow === '5m' ? 5 : 15) * 60_000
      const historical = nearestPrior(history, target)
      baseline = historical && target - historical.eventAt.getTime() <= maximumIntradayBaselineAgeMs ? historical.lastPrice : null
    }
    const quoteAgeSeconds = ageMs === null ? null : ageMs / 1000
    return {
      instrumentKey: instrument.instrumentKey,
      symbol: instrument.symbol,
      displayName: instrument.displayName,
      kind: instrument.instrumentKind === 'future' ? 'future' : 'equity',
      sector: metadata?.sector ?? null,
      marketCapWeight: metadata?.marketCapWeight ?? null,
      metadataSource: metadata?.source ?? null,
      effectiveFrom: metadata?.effectiveFrom.toISOString() ?? null,
      last: price,
      priorClose: quote?.priorClose ?? null,
      bid: quote?.bid ?? null,
      ask: quote?.ask ?? null,
      sessionVolume: quote?.sessionVolume ?? null,
      contractExpiry: quote?.contractExpiry ?? null,
      eventAt: quote?.eventAt.toISOString() ?? null,
      receivedAt: quote?.receivedAt.toISOString() ?? null,
      quoteAgeSeconds,
      returnPercent: pct(price, baseline),
      isFresh: quoteAgeSeconds !== null && ageMs! <= initialStaleAfterMs,
    }
  }

  const views = configured.map(quoteView)
  const equities = views.filter((item) => item.kind === 'equity')
  const futures = views.filter((item) => item.kind === 'future')
  const freshEquities = equities.filter((item) => item.isFresh && finitePositive(item.last))
  const validEquities = freshEquities.filter((item) => item.returnPercent !== null)
  const validFutures = futures.filter((item) => item.isFresh && item.returnPercent !== null && finitePositive(item.last))
  const advances = validEquities.filter((item) => item.returnPercent! > 0).length
  const declines = validEquities.filter((item) => item.returnPercent! < 0).length
  const unchanged = validEquities.length - advances - declines
  const coveragePercent = equities.length === 0 ? 0 : (freshEquities.length / equities.length) * 100
  const future = validFutures[0] ?? null
  const breadthDirection = advances > declines ? 1 : declines > advances ? -1 : 0
  const futureDirection = future && future.returnPercent !== null ? Math.sign(future.returnPercent) : 0
  let futuresConfirmation: FuturesConfirmation = 'unavailable'
  if (future) futuresConfirmation = breadthDirection === 0 || futureDirection === 0 ? 'neutral' : breadthDirection === futureDirection ? (futureDirection > 0 ? 'confirms_up' : 'confirms_down') : 'diverges'

  const totalWeight = validEquities.reduce((sum, item) => sum + (finitePositive(item.marketCapWeight) ? item.marketCapWeight : 0), 0)
  const hasFullWeights = equities.length > 0 && validEquities.length === equities.length && validEquities.every((item) => finitePositive(item.marketCapWeight))
  const capWeightedChangePercent = hasFullWeights && totalWeight > 0
    ? validEquities.reduce((sum, item) => sum + item.returnPercent! * item.marketCapWeight!, 0) / totalWeight
    : null
  const groups = new Map<string, MarketInstrumentView[]>()
  for (const item of validEquities) groups.set(item.sector ?? 'Sem classificação', [...(groups.get(item.sector ?? 'Sem classificação') ?? []), item])
  const sectors = [...groups.entries()].map(([name, items]) => ({
    name,
    advancers: items.filter((item) => item.returnPercent! > 0).length,
    decliners: items.filter((item) => item.returnPercent! < 0).length,
    sampleSize: items.length,
    averageChangePercent: items.reduce((sum, item) => sum + item.returnPercent!, 0) / items.length,
  })).sort((a, b) => a.name.localeCompare(b.name))
  const contributors = validEquities.map((item) => ({
    symbol: item.symbol,
    returnPercent: item.returnPercent!,
    contribution: item.returnPercent! * (hasFullWeights ? item.marketCapWeight! : 1),
    sector: item.sector,
    kind: item.returnPercent! >= 0 ? 'positive' as const : 'negative' as const,
  }))
  const largestContributors = [...contributors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  const absoluteContribution = contributors.reduce((sum, item) => sum + Math.abs(item.contribution), 0)
  const concentrationPercent = absoluteContribution > 0
    ? (largestContributors.slice(0, 5).reduce((sum, item) => sum + Math.abs(item.contribution), 0) / absoluteContribution) * 100
    : null
  const topContributors = [...contributors].filter((item) => item.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 5)
    .concat([...contributors].filter((item) => item.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 5))

  const reason = equities.length === 0
    ? 'Configure ações no AddOn para iniciar o universo.'
    : freshEquities.length === 0 && equities.some((item) => item.eventAt !== null && !item.isFresh)
      ? 'As últimas cotações das ações estão antigas; não há leitura de mercado atual.'
    : coveragePercent < minimumCoveragePercent
      ? `Cobertura atual de ${freshEquities.length}/${equities.length}; abaixo do piso operacional de ${minimumCoveragePercent}%.`
      : freshEquities.length < equities.length
        ? `Cobertura parcial (${freshEquities.length}/${equities.length}); os dados ausentes não são tratados como zero e a classificação abrangente foi suprimida.`
      : validEquities.length === 0
        ? 'Nenhuma cotação recente e comparável foi recebida.'
        : validEquities.length < equities.length
          ? `Retorno comparável disponível para ${validEquities.length}/${equities.length}; é necessário completar a janela para classificar o universo.`
          : !future
            ? 'Nenhum contrato NQ/MNQ recente com retorno comparável foi recebido.'
            : futuresConfirmation === 'unavailable'
              ? 'Não há futuro de referência para comparar com a amplitude das ações.'
              : ''
  const newestQuoteAt = views.reduce<number | null>((newest, item) => item.eventAt ? Math.max(newest ?? 0, Date.parse(item.eventAt)) : newest, null)
  const ageMs = newestQuoteAt === null ? null : Math.max(0, asOf.getTime() - newestQuoteAt)
  const stale = (ageMs !== null && ageMs > initialStaleAfterMs) || (freshEquities.length === 0 && equities.some((item) => item.eventAt !== null && !item.isFresh))
  const latestEquityTimestamp = equities.reduce<number | null>((latestAt, item) => item.eventAt ? Math.max(latestAt ?? 0, Date.parse(item.eventAt)) : latestAt, null)
  const marketSessionDate = latestEquityTimestamp === null ? null : new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(latestEquityTimestamp)).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {} as Record<string, string>)
  const marketSessionDateValue = marketSessionDate ? `${marketSessionDate.year}-${marketSessionDate.month}-${marketSessionDate.day}` : null
  let state: MarketContext['state'] = 'mixed'
  if (stale && freshEquities.length === 0) state = 'stale'
  else if (reason) state = 'insufficient_data'
  else if (futuresConfirmation === 'diverges') state = 'divergent'
  else if (futuresConfirmation === 'neutral') state = 'mixed'
  else state = 'aligned'
  const finalReason = reason || (stale ? 'Há amostras antigas no universo; confirme a idade exibida em cada ativo.' : state === 'divergent' ? 'O futuro e a amplitude das ações apontam em direções opostas.' : state === 'aligned' ? 'O futuro e a maioria das ações apontam na mesma direção.' : 'A amplitude está equilibrada ou sem direção comum.')

  const seriesByMinute = new Map<number, { nqPrice: number | null; nqReturnPercent: number | null; up: number; down: number; count: number }>()
  const futureId = future ? configured.find((item) => item.instrumentKey === future.instrumentKey)?.id : undefined
  for (const row of minuteRows) {
    const bucket = row.minuteStart.getTime()
    const point = seriesByMinute.get(bucket) ?? { nqPrice: null, nqReturnPercent: null, up: 0, down: 0, count: 0 }
    const instrument = configured.find((item) => item.id === row.instrumentId)
    if (instrument?.instrumentKind === 'future' && row.instrumentId === futureId) {
      point.nqPrice = row.lastPrice
      point.nqReturnPercent = pct(row.lastPrice, row.priorClose)
    } else if (instrument?.instrumentKind === 'equity' && finitePositive(row.priorClose)) {
      const change = pct(row.lastPrice, row.priorClose)
      if (change !== null) { point.up += change > 0 ? 1 : 0; point.down += change < 0 ? 1 : 0; point.count++ }
    }
    seriesByMinute.set(bucket, point)
  }
  const minuteSeries = [...seriesByMinute.entries()].sort((a, b) => a[0] - b[0]).map(([at, item]) => ({
    at: new Date(at).toISOString(), nqPrice: item.nqPrice, nqReturnPercent: item.nqReturnPercent,
    advancingPercent: item.count ? (item.up / item.count) * 100 : null,
  }))

  const maxFreshness = freshEquities.reduce<number | null>((max, item) => item.quoteAgeSeconds === null ? max : Math.max(max ?? 0, item.quoteAgeSeconds), null)
  return {
    asOf: asOf.toISOString(),
    latestEventAt: newestQuoteAt === null ? null : new Date(newestQuoteAt).toISOString(),
    marketSessionDate: marketSessionDateValue,
    source: 'NinjaTrader · conexão configurada no AddOn',
    freshnessSeconds: maxFreshness,
    returnWindow,
    coverage: { expected: equities.length, received: freshEquities.length, percent: coveragePercent, minimumPercent: minimumCoveragePercent, futuresExpected: futures.length, futuresReceived: validFutures.length },
    equities: equities.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    futures,
    breadth: { advancers: advances, decliners: declines, unchanged, sampleSize: validEquities.length, advancingPercent: validEquities.length ? (advances / validEquities.length) * 100 : null, capWeightedChangePercent },
    sectors,
    topContributors,
    concentrationPercent,
    futuresConfirmation,
    state,
    reason: finalReason,
    minuteSeries,
  }
}
