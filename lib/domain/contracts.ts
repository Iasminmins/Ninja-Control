/**
 * Provider-neutral contracts for persisted trading data.
 * DemoWorkspace remains a browser-only fixture; adapters should translate
 * external payloads into these shapes before they reach domain services.
 */
export type DomainId = string

export type DataOrigin = 'manual' | 'import' | 'provider' | 'calculated'

export interface SourceReference {
  provider: string
  externalId: string
  receivedAt: string
}

/** Stable event envelope used for deduplication and audit records. */
export interface DomainEvent<TPayload> {
  id: DomainId
  workspaceId: DomainId
  type: string
  occurredAt: string
  recordedAt: string
  origin: DataOrigin
  source: SourceReference | null
  payload: TPayload
}

export type OrderSide = 'buy' | 'sell'
export type OrderStatus = 'pending' | 'accepted' | 'partially-filled' | 'filled' | 'cancelled' | 'rejected'

export interface TradingOrder {
  id: DomainId
  accountId: DomainId
  instrument: string
  side: OrderSide
  quantity: number
  status: OrderStatus
  submittedAt: string
  source: SourceReference | null
  origin: DataOrigin
}

export interface TradeExecution {
  id: DomainId
  orderId: DomainId | null
  accountId: DomainId
  instrument: string
  side: OrderSide
  quantity: number
  price: number
  executedAt: string
  source: SourceReference | null
  origin: DataOrigin
}

export interface TradeContext {
  tradeId: DomainId
  strategyVersionId: DomainId | null
  session: string | null
  setup: string | null
  tags: string[]
  notes: string | null
  origin: DataOrigin
}

export interface AuditRecord {
  id: DomainId
  workspaceId: DomainId
  actorId: DomainId | null
  action: string
  entityType: string
  entityId: DomainId
  occurredAt: string
  before: unknown | null
  after: unknown | null
}
