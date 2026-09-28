export type MarketReturnWindow = 'session' | '5m' | '15m'
export type MarketState = 'aligned' | 'divergent' | 'mixed' | 'insufficient_data' | 'stale'
export type FuturesConfirmation = 'confirms_up' | 'confirms_down' | 'diverges' | 'neutral' | 'unavailable'

export type MarketInstrumentView = {
  instrumentKey: string
  symbol: string
  displayName: string | null
  kind: 'equity' | 'future'
  sector: string | null
  marketCapWeight: number | null
  metadataSource: string | null
  effectiveFrom: string | null
  last: number | null
  priorClose: number | null
  bid: number | null
  ask: number | null
  sessionVolume: number | null
  contractExpiry: string | null
  eventAt: string | null
  receivedAt: string | null
  quoteAgeSeconds: number | null
  returnPercent: number | null
  isFresh: boolean
}

export type MarketMinutePoint = { at: string; nqPrice: number | null; nqReturnPercent: number | null; advancingPercent: number | null }

export type MarketContext = {
  asOf: string
  latestEventAt: string | null
  marketSessionDate: string | null
  source: string
  freshnessSeconds: number | null
  returnWindow: MarketReturnWindow
  coverage: { expected: number; received: number; percent: number; minimumPercent: number; futuresExpected: number; futuresReceived: number }
  equities: MarketInstrumentView[]
  futures: MarketInstrumentView[]
  breadth: { advancers: number; decliners: number; unchanged: number; sampleSize: number; advancingPercent: number | null; capWeightedChangePercent: number | null }
  sectors: Array<{ name: string; advancers: number; decliners: number; sampleSize: number; averageChangePercent: number | null }>
  topContributors: Array<{ symbol: string; returnPercent: number; contribution: number; sector: string | null; kind: 'positive' | 'negative' }>
  concentrationPercent: number | null
  futuresConfirmation: FuturesConfirmation
  state: MarketState
  reason: string
  minuteSeries: MarketMinutePoint[]
}
