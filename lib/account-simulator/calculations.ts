import { type MonthlySimulationRow, type RiskCategory, type SimulationPoint, type SimulationResult, type SimulatorRules, type SimulatorTrade } from './types'

const riskCategories: RiskCategory[] = ['DIRECT', 'ABSORPTION', 'CONVENTIONAL']

function dayKey(timestamp: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp))
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return timestamp.slice(0, 10)
  }
}

function adjustedTradePnl(trade: SimulatorTrade, rules: SimulatorRules, dynamicRiskCents: number): { pnlCents: number; adjusted: boolean } {
  if (dynamicRiskCents <= 0) return { pnlCents: trade.pnlCents, adjusted: false }
  const category = trade.riskCategory ? rules.riskByCategory[trade.riskCategory] : null
  if (!(category?.enabled || rules.tomahawk.enabled)) return { pnlCents: trade.pnlCents, adjusted: false }
  const reference = trade.originalRiskCents ?? rules.referenceRiskCents
  if (reference <= 0) return { pnlCents: trade.pnlCents, adjusted: false }
  return { pnlCents: Math.round(trade.pnlCents * dynamicRiskCents / reference), adjusted: true }
}

export function calculateSimulation(trades: SimulatorTrade[], rules: SimulatorRules): SimulationResult {
  const profile = rules.profile
  const ordered = [...trades].filter((trade) => Number.isFinite(trade.pnlCents) && Number.isFinite(Date.parse(trade.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.source.localeCompare(b.source) || a.rowNumber - b.rowNumber)
  const warnings: string[] = []
  if (profile.startBalanceCents <= 0 || profile.maxLossCents <= 0) warnings.push('Configure o saldo inicial e o limite de perda da conta antes de interpretar a simulação.')
  if (rules.mode === 'evaluation' && profile.targetCents <= 0) warnings.push('Configure a meta da avaliação antes de interpretar a simulação.')
  if (trades.length !== ordered.length) warnings.push(`${trades.length - ordered.length} linha(s) foram ignoradas por P&L ou data inválidos.`)
  if (rules.entryMarket.enabled && ordered.some((trade) => trade.entryMarket === null || (trade.entryMarket && !trade.direction))) warnings.push('Há trades sem classificação Entry Market ou sem direção; eles foram mantidos na curva porque não é possível aplicar o filtro com segurança.')
  if (ordered.some((trade) => trade.riskCategory === null) && riskCategories.some((category) => rules.riskByCategory[category].enabled)) warnings.push('Trades sem categoria de risco não foram redimensionados.')
  if (rules.mode === 'payout' && profile.payoutDetachCents <= 0) warnings.push('Configure o limite de lucro para descolar o drawdown da conta PA.')
  const profileReady = profile.startBalanceCents > 0 && profile.maxLossCents > 0 && (rules.mode === 'payout' ? profile.payoutDetachCents > 0 : profile.targetCents > 0)
  if (!profileReady) return {
    points: [],
    metrics: { count: 0, wins: 0, losses: 0, flats: 0, netPnlCents: 0, winRatePercent: null, profitFactor: null, maxDrawdownCents: 0, maxAppliedRiskCents: null, targetReached: false, breached: false, finalBalanceCents: profile.startBalanceCents, remainingBufferCents: 0, missingEntryMarket: 0, skippedByEntryMarket: 0, blockedByDailyLock: 0, adjustedTrades: 0 },
    warnings,
    event: null,
  }

  let balance = profile.startBalanceCents
  let equityPeak = balance
  let rulePeak = balance
  let floor = balance - profile.maxLossCents
  let maxDrawdown = 0
  let grossWins = 0
  let grossLosses = 0
  let wins = 0
  let losses = 0
  let flats = 0
  let net = 0
  let targetReached = false
  let breached = false
  let event: SimulationResult['event'] = null
  let previousDay = ''
  let dayNet = 0
  let dayStops = 0
  let dayLocked = false
  let skippedByEntryMarket = 0
  let missingEntryMarket = 0
  let blockedByDailyLock = 0
  let adjustedTrades = 0
  let maxAppliedRiskCents: number | null = null
  const points: SimulationPoint[] = []

  for (let tradeIndex = 0; tradeIndex < ordered.length; tradeIndex += 1) {
    const trade = ordered[tradeIndex]
    const day = dayKey(trade.timestamp, rules.timezone)
    if (day !== previousDay) {
      previousDay = day
      dayNet = 0
      dayStops = 0
      dayLocked = false
    }

    const marketAllowed = !rules.entryMarket.enabled || trade.entryMarket === null || (trade.entryMarket && !trade.direction) || (trade.entryMarket && ((trade.direction === 'BUY' && rules.entryMarket.allowBuy) || (trade.direction === 'SELL' && rules.entryMarket.allowSell)))
    if (rules.entryMarket.enabled && (trade.entryMarket === null || (trade.entryMarket && !trade.direction))) missingEntryMarket += 1
    if (!marketAllowed) {
      skippedByEntryMarket += 1
      continue
    }
    if (dayLocked) {
      blockedByDailyLock += 1
      continue
    }
    if (targetReached || breached) continue

    let baseRisk = trade.riskCategory && rules.riskByCategory[trade.riskCategory].enabled
      ? rules.riskByCategory[trade.riskCategory].riskCents
      : rules.referenceRiskCents
    if (baseRisk <= 0) baseRisk = rules.referenceRiskCents
    let dynamicRisk = baseRisk
    if (rules.tomahawk.enabled && dayNet > 0 && baseRisk > 0) {
      const bonus = Math.round(dayNet * rules.tomahawk.profitPercent / 100)
      dynamicRisk = Math.min(baseRisk + bonus, Math.round(baseRisk * rules.tomahawk.maxBaseMultiple))
    }
    const adjusted = adjustedTradePnl(trade, rules, dynamicRisk)
    const pnl = adjusted.pnlCents
    if (adjusted.adjusted) {
      adjustedTrades += 1
      maxAppliedRiskCents = Math.max(maxAppliedRiskCents ?? 0, dynamicRisk)
    }
    balance += pnl
    net += pnl
    dayNet += pnl
    if (pnl > 0) { wins += 1; grossWins += pnl }
    else if (pnl < 0) {
      losses += 1; grossLosses += Math.abs(pnl)
      const reason = trade.exitReason?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ?? ''
      if (reason.includes('stop') || (!reason && rules.dailyStops.lossWithoutExitReasonIsStop)) dayStops += 1
    } else flats += 1

    equityPeak = Math.max(equityPeak, balance)
    const nextTrade = ordered[tradeIndex + 1]
    const isEndOfDay = !nextTrade || dayKey(nextTrade.timestamp, rules.timezone) !== day
    if (rules.drawdownRule === 'closed-trade') {
      rulePeak = Math.max(rulePeak, balance)
      const detached = rules.mode === 'payout' && rulePeak - profile.startBalanceCents >= profile.payoutDetachCents
      floor = Math.max(floor, (detached ? profile.startBalanceCents : rulePeak - profile.maxLossCents))
    } else if (isEndOfDay) {
      rulePeak = Math.max(rulePeak, balance)
      const detached = rules.mode === 'payout' && rulePeak - profile.startBalanceCents >= profile.payoutDetachCents
      floor = Math.max(floor, detached ? profile.startBalanceCents : rulePeak - profile.maxLossCents)
    }
    const drawdown = Math.min(0, balance - equityPeak)
    maxDrawdown = Math.max(maxDrawdown, equityPeak - balance)
    const isTarget = rules.mode === 'evaluation' && balance - profile.startBalanceCents >= profile.targetCents
    const isBreached = balance <= floor && (rules.drawdownRule === 'closed-trade' || isEndOfDay)
    if (!targetReached && isTarget) {
      targetReached = true
      event = { kind: 'TARGET', timestamp: trade.timestamp, balanceCents: balance }
    }
    if (!breached && isBreached) {
      breached = true
      event = { kind: 'BREACHED', timestamp: trade.timestamp, balanceCents: balance }
    }
    points.push({ timestamp: trade.timestamp, tradeId: trade.id, balanceCents: balance, equityCents: balance, floorCents: floor, drawdownCents: drawdown, pnlCents: trade.pnlCents, adjustedPnlCents: pnl, status: isBreached ? 'BREACHED' : isTarget ? 'TARGET' : 'RUNNING' })

    if ((rules.dailyLoss.enabled && dayNet <= -rules.dailyLoss.maxLossCents) || (rules.dailyStops.enabled && dayStops >= rules.dailyStops.maxStops)) dayLocked = true
  }
  const finalBalanceCents = balance
  return {
    points,
    metrics: {
      count: wins + losses + flats,
      wins, losses, flats, netPnlCents: net,
      winRatePercent: wins + losses + flats ? wins / (wins + losses + flats) * 100 : null,
      profitFactor: grossLosses ? grossWins / grossLosses : null,
      maxDrawdownCents: maxDrawdown,
      maxAppliedRiskCents,
      targetReached, breached,
      finalBalanceCents,
      remainingBufferCents: Math.max(0, finalBalanceCents - floor),
      missingEntryMarket, skippedByEntryMarket, blockedByDailyLock, adjustedTrades,
    },
    warnings,
    event,
  }
}

export function summarizeMonths(trades: SimulatorTrade[], timezone = 'UTC'): MonthlySimulationRow[] {
  const monthly = new Map<string, SimulatorTrade[]>()
  for (const trade of trades) {
    const date = new Date(trade.timestamp)
    if (!Number.isFinite(date.getTime())) continue
    const monthParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(date)
    const monthValues = Object.fromEntries(monthParts.map(({ type, value }) => [type, value]))
    const month = `${monthValues.year}-${monthValues.month}`
    const rows = monthly.get(month) ?? []
    rows.push(trade)
    monthly.set(month, rows)
  }
  return [...monthly].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
    const sorted = [...rows].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    let cumulative = 0
    let peak = 0
    let maxDrawdownCents = 0
    let wins = 0
    let losses = 0
    let flats = 0
    for (const row of sorted) {
      cumulative += row.pnlCents
      peak = Math.max(peak, cumulative)
      maxDrawdownCents = Math.max(maxDrawdownCents, peak - cumulative)
      if (row.pnlCents > 0) wins += 1
      else if (row.pnlCents < 0) losses += 1
      else flats += 1
    }
    return { month, count: rows.length, wins, losses, flats, netPnlCents: cumulative, winRatePercent: rows.length ? wins / rows.length * 100 : null, maxDrawdownCents }
  })
}
