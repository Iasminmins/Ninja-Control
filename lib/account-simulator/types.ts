export type AccountProfileId = '50K' | '150K'
export type DrawdownRule = 'closed-trade' | 'end-of-day'
export type SimulationMode = 'evaluation' | 'payout'
export type RiskCategory = 'DIRECT' | 'ABSORPTION' | 'CONVENTIONAL'

export type SimulatorTrade = {
  id: string
  source: string
  rowNumber: number
  timestamp: string
  pnlCents: number
  direction: 'BUY' | 'SELL' | null
  riskCategory: RiskCategory | null
  entryMarket: boolean | null
  originalRiskCents: number | null
  exitReason: string | null
}

export type AccountProfile = {
  id: AccountProfileId
  startBalanceCents: number
  targetCents: number
  maxLossCents: number
  payoutDetachCents: number
}

export type SimulatorRules = {
  profile: AccountProfile
  drawdownRule: DrawdownRule
  mode: SimulationMode
  timezone: string
  referenceRiskCents: number
  riskByCategory: Record<RiskCategory, { enabled: boolean; riskCents: number }>
  entryMarket: { enabled: boolean; allowBuy: boolean; allowSell: boolean }
  dailyLoss: { enabled: boolean; maxLossCents: number }
  dailyStops: { enabled: boolean; maxStops: number; lossWithoutExitReasonIsStop: boolean }
  tomahawk: { enabled: boolean; profitPercent: number; maxBaseMultiple: number }
}

export type SimulationPoint = {
  timestamp: string
  tradeId: string
  balanceCents: number
  equityCents: number
  floorCents: number
  drawdownCents: number
  pnlCents: number
  adjustedPnlCents: number
  status: 'RUNNING' | 'TARGET' | 'BREACHED' | 'LOCKED'
}

export type SimulationMetrics = {
  count: number
  wins: number
  losses: number
  flats: number
  netPnlCents: number
  winRatePercent: number | null
  profitFactor: number | null
  maxDrawdownCents: number
  maxAppliedRiskCents: number | null
  targetReached: boolean
  breached: boolean
  finalBalanceCents: number
  remainingBufferCents: number
  missingEntryMarket: number
  skippedByEntryMarket: number
  blockedByDailyLock: number
  adjustedTrades: number
}

export type SimulationResult = {
  points: SimulationPoint[]
  metrics: SimulationMetrics
  warnings: string[]
  event: { kind: 'TARGET' | 'BREACHED'; timestamp: string; balanceCents: number } | null
}

export type MonthlySimulationRow = {
  month: string
  count: number
  wins: number
  losses: number
  flats: number
  netPnlCents: number
  winRatePercent: number | null
  maxDrawdownCents: number
}

export const defaultProfile = (id: AccountProfileId): AccountProfile => id === '50K'
  ? { id, startBalanceCents: 5_000_000, targetCents: 300_000, maxLossCents: 200_000, payoutDetachCents: 210_000 }
  : { id, startBalanceCents: 15_000_000, targetCents: 0, maxLossCents: 0, payoutDetachCents: 0 }

const blankRisk = () => ({ enabled: false, riskCents: 50_000 })

export function defaultSimulatorRules(id: AccountProfileId = '50K'): SimulatorRules {
  return {
    profile: defaultProfile(id),
    drawdownRule: 'closed-trade',
    mode: 'evaluation',
    timezone: 'America/New_York',
    referenceRiskCents: 50_000,
    riskByCategory: { DIRECT: blankRisk(), ABSORPTION: blankRisk(), CONVENTIONAL: blankRisk() },
    entryMarket: { enabled: false, allowBuy: true, allowSell: true },
    dailyLoss: { enabled: false, maxLossCents: 100_000 },
    dailyStops: { enabled: false, maxStops: 2, lossWithoutExitReasonIsStop: false },
    tomahawk: { enabled: false, profitPercent: 100, maxBaseMultiple: 2 },
  }
}
