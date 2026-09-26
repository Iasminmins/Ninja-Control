export type RecordId = string

export type AccountKind = 'evaluation' | 'funded' | 'combine'
export type AccountLifecycle = 'active' | 'archived'
export type DemoConnectionState = 'not-configured' | 'disconnected' | 'error' | 'connected'
export type StrategyStatus = 'configuration-pending' | 'active' | 'paused' | 'archived'
export type AlertCondition = 'daily-loss-percent' | 'drawdown-buffer-percent' | 'sync-error'

export interface DemoAccount {
  id: RecordId
  name: string
  firm: string
  kind: AccountKind
  stage: string
  startingCapital: number
  dailyLossLimit: number
  trailingDrawdownLimit: number
  drawdownBufferPercent: number
  lifecycle: AccountLifecycle
  connectionState: DemoConnectionState
  createdAt: string
  lastSyncedAt: string | null
  provenance: 'demo'
}

export interface DemoTrade {
  id: RecordId
  accountId: RecordId
  strategyId: RecordId | null
  openedAt: string
  closedAt: string
  instrument: string
  side: 'long' | 'short'
  quantity: number
  entryPrice: number
  exitPrice: number
  netPnl: number
  session: string
  status: 'closed'
  provenance: 'demo'
}

export interface DemoStrategy {
  id: RecordId
  name: string
  description: string
  status: StrategyStatus
  accountIds: RecordId[]
  instruments: string[]
  sessions: string[]
  provenance: 'demo'
}

export interface DemoPayout {
  id: RecordId
  accountId: RecordId
  requestedAt: string
  splitLabel: string
  status: 'requested' | 'approved' | 'processing' | 'paid'
  amount: number
  provenance: 'demo'
}

export interface DemoOperationEvent {
  id: RecordId
  accountId: RecordId | null
  occurredAt: string
  category: 'sync' | 'order' | 'execution' | 'risk' | 'system'
  status: 'success' | 'attention' | 'error' | 'info'
  title: string
  detail: string
  amount: number | null
  provenance: 'demo'
}

export interface DemoRiskRule {
  id: RecordId
  name: string
  description: string
  condition: AlertCondition
  threshold: number
  enabled: boolean
  scopeAccountIds: RecordId[]
  provenance: 'demo'
}

export interface DemoAlertRule {
  id: RecordId
  name: string
  condition: AlertCondition
  threshold: number
  enabled: boolean
  accountId: RecordId | null
  provenance: 'demo'
}

export interface DemoAlertEvent {
  id: RecordId
  ruleId: RecordId
  accountId: RecordId | null
  occurredAt: string
  message: string
  readAt: string | null
  provenance: 'demo'
}

export interface DemoJournalEntry {
  id: RecordId
  tradeId: RecordId
  plan: string
  notes: string
  tags: string[]
  review: string
  updatedAt: string
  provenance: 'demo'
}

export interface DemoIntegration {
  id: RecordId
  name: string
  category: 'broker' | 'prop-firm'
  connectionState: DemoConnectionState
  requirements: string[]
  provenance: 'demo'
}

export interface DemoWorkspace {
  schemaVersion: 1
  asOfDate: string
  accounts: DemoAccount[]
  trades: DemoTrade[]
  strategies: DemoStrategy[]
  payouts: DemoPayout[]
  operationEvents: DemoOperationEvent[]
  riskRules: DemoRiskRule[]
  alertRules: DemoAlertRule[]
  alertEvents: DemoAlertEvent[]
  journalEntries: DemoJournalEntry[]
  integrations: DemoIntegration[]
}

export interface TradeFilters {
  accountId?: string
  strategyId?: string
  instrument?: string
  from?: string
  to?: string
}

export interface AccountFilters {
  search?: string
  lifecycle?: AccountLifecycle | 'all'
  firm?: string | 'all'
}

export interface PerformanceSummary {
  tradeCount: number
  netPnl: number
  winningTrades: number
  losingTrades: number
  winRate: number | null
  profitFactor: number | null
  averageTrade: number | null
  maxDrawdown: number | null
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
