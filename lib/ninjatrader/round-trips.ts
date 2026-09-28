export type Fill = {
  id: string
  accountId: string
  instrument: string
  side: 'buy' | 'sell' | null
  quantity: number
  price: number
  pointValue: number | null
  commissionCents: number | null
  commissionCurrency: string | null
  currency: string | null
  executedAt: Date
}

export type ClosedRoundTrip = {
  accountId: string
  instrument: string
  side: 'long' | 'short'
  openedAt: Date
  closedAt: Date
  quantity: number
  grossPnlCents: number
  feesCents: number | null
  netPnlCents: number | null
  currency: string | null
  executionIds: string[]
}

type Lot = {
  side: 1 | -1
  quantity: number
  originalQuantity: number
  allocatedQuantity: number
  price: number
  pointValue: number | null
  commissionCents: number | null
  commissionCurrency: string | null
  currency: string | null
  openedAt: Date
  executionId: string
}

type Cycle = {
  side: 1 | -1
  openedAt: Date
  quantity: number
  grossPnlCents: number
  grossKnown: boolean
  feesCents: number
  feesKnown: boolean
  currency: string | null
  executions: Set<string>
}

function proportionalCents(total: number | null, quantity: number, originalQuantity: number, offset: number) {
  if (total === null) return null
  return Math.round(total * (offset + quantity) / originalQuantity) - Math.round(total * offset / originalQuantity)
}

export function buildClosedRoundTrips(input: Fill[]) {
  const sorted = [...input].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime() || a.id.localeCompare(b.id))
  const groups = new Map<string, Fill[]>()
  for (const fill of sorted) {
    const key = `${fill.accountId}\u0000${fill.instrument}`
    const group = groups.get(key) ?? []
    group.push(fill)
    groups.set(key, group)
  }

  const closed: ClosedRoundTrip[] = []
  let incompleteFillCount = 0
  const finishCycle = (active: Cycle, fill: Fill) => {
    if (!active.grossKnown) { incompleteFillCount++; return }
    const grossPnlCents = active.grossPnlCents
    const feesCents = active.feesKnown ? active.feesCents : null
    closed.push({ accountId: fill.accountId, instrument: fill.instrument, side: active.side === 1 ? 'long' : 'short', openedAt: active.openedAt, closedAt: fill.executedAt, quantity: active.quantity, grossPnlCents, feesCents, netPnlCents: feesCents === null ? null : grossPnlCents - feesCents, currency: active.currency, executionIds: [...active.executions] })
  }
  for (const fills of groups.values()) {
    const lots: Lot[] = []
    let cycle: Cycle | null = null
    for (const fill of fills) {
      if (!fill.side || !Number.isInteger(fill.quantity) || fill.quantity <= 0 || !Number.isFinite(fill.price)) {
        incompleteFillCount++
        continue
      }
      let remaining = fill.quantity
      let feeOffset = 0
      const sign: 1 | -1 = fill.side === 'buy' ? 1 : -1

      while (remaining > 0 && lots.length && lots[0].side !== sign) {
        const lot = lots[0]
        const matched = Math.min(remaining, lot.quantity)
        if (!cycle) cycle = { side: lot.side, openedAt: lot.openedAt, quantity: 0, grossPnlCents: 0, grossKnown: true, feesCents: 0, feesKnown: true, currency: lot.currency, executions: new Set() }
        cycle.quantity += matched
        cycle.executions.add(fill.id)
        cycle.executions.add(lot.executionId)

        if (lot.pointValue !== null && fill.pointValue !== null && lot.currency && fill.currency === lot.currency) {
          const gross = (fill.price - lot.price) * lot.side * lot.pointValue * matched * 100
          cycle.grossPnlCents += Math.round(gross)
        } else cycle.grossKnown = false

        const openingFee = proportionalCents(lot.commissionCents, matched, lot.originalQuantity, lot.allocatedQuantity)
        const closingFee = proportionalCents(fill.commissionCents, matched, fill.quantity, feeOffset)
        if (openingFee === null || closingFee === null || lot.commissionCurrency !== cycle.currency || fill.commissionCurrency !== cycle.currency) cycle.feesKnown = false
        else cycle.feesCents += openingFee + closingFee

        lot.quantity -= matched
        lot.allocatedQuantity += matched
        remaining -= matched
        feeOffset += matched
        if (lot.quantity === 0) lots.shift()
      }

      if (remaining > 0) {
        if (cycle && lots.length === 0) {
          finishCycle(cycle, fill)
          cycle = null
        }
        const openingFee = proportionalCents(fill.commissionCents, remaining, fill.quantity, feeOffset)
        lots.push({ side: sign, quantity: remaining, originalQuantity: remaining, allocatedQuantity: 0, price: fill.price, pointValue: fill.pointValue, commissionCents: openingFee, commissionCurrency: fill.commissionCurrency, currency: fill.currency, openedAt: fill.executedAt, executionId: fill.id })
      }
      if (remaining === 0 && lots.length === 0 && cycle) {
        finishCycle(cycle, fill)
        cycle = null
      }
    }
    if (lots.length) incompleteFillCount++
  }
  return { closed, incompleteFillCount }
}
