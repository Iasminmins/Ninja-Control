import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const accountStatus = pgEnum('account_status', ['active', 'paused', 'archived', 'breached'])
export const accountKind = pgEnum('account_kind', ['evaluation', 'funded', 'combine'])
export const connectionStatus = pgEnum('connection_status', ['not_configured', 'connected', 'disconnected', 'error'])
export const orderSide = pgEnum('order_side', ['buy', 'sell'])
export const orderStatus = pgEnum('order_status', ['pending', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected'])
export const dataOrigin = pgEnum('data_origin', ['manual', 'import', 'provider', 'calculated'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  ownerId: text('owner_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('workspaces_owner_unique').on(table.ownerId)])

export const propFirms = pgTable('prop_firms', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  websiteUrl: text('website_url'),
  logoUrl: text('logo_url'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('prop_firms_name_unique').on(table.name)])

export const propFirmPlans = pgTable('prop_firm_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  propFirmId: uuid('prop_firm_id').notNull().references(() => propFirms.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 120 }).notNull(),
  stage: varchar('stage', { length: 80 }).notNull(),
  startingCapitalCents: integer('starting_capital_cents').notNull(),
  dailyLossLimitCents: integer('daily_loss_limit_cents'),
  trailingDrawdownLimitCents: integer('trailing_drawdown_limit_cents'),
  rules: jsonb('rules').$type<Record<string, unknown>>().notNull().default({}),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).defaultNow().notNull(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [index('prop_firm_plans_firm_idx').on(table.propFirmId)])

export const tradingAccounts = pgTable('trading_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  propFirmPlanId: uuid('prop_firm_plan_id').references(() => propFirmPlans.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 120 }).notNull(),
  externalId: text('external_id'),
  kind: accountKind('kind').notNull(),
  stage: varchar('stage', { length: 80 }).notNull(),
  status: accountStatus('status').notNull().default('active'),
  startingCapitalCents: integer('starting_capital_cents').notNull(),
  connectionStatus: connectionStatus('connection_status').notNull().default('not_configured'),
  origin: dataOrigin('origin').notNull().default('manual'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index('trading_accounts_workspace_idx').on(table.workspaceId, table.status),
  uniqueIndex('trading_accounts_external_unique').on(table.workspaceId, table.externalId),
])

export const accountRiskSnapshots = pgTable('account_risk_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => tradingAccounts.id, { onDelete: 'cascade' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  balanceCents: integer('balance_cents'),
  equityCents: integer('equity_cents'),
  peakBalanceCents: integer('peak_balance_cents'),
  maxDrawdownCents: integer('max_drawdown_cents'),
  currentDrawdownCents: integer('current_drawdown_cents'),
  remainingDrawdownCents: integer('remaining_drawdown_cents'),
  dailyLossCents: integer('daily_loss_cents'),
  contractsOpen: integer('contracts_open'),
  exposureCents: integer('exposure_cents'),
  providerValues: jsonb('provider_values').$type<Record<string, { valueCents: number; observed: boolean }>>().notNull().default({}),
  currency: varchar('currency', { length: 12 }),
  equityMethod: varchar('equity_method', { length: 48 }),
  source: varchar('source', { length: 80 }).notNull(),
  createdAt: createdAt(),
}, (table) => [index('account_risk_snapshot_time_idx').on(table.workspaceId, table.accountId, table.capturedAt)])

export const accountCosts = pgTable('account_costs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => tradingAccounts.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 40 }).notNull(),
  description: varchar('description', { length: 240 }),
  amountCents: integer('amount_cents').notNull(),
  incurredAt: timestamp('incurred_at', { withTimezone: true }).notNull(),
  origin: dataOrigin('origin').notNull().default('manual'),
  createdAt: createdAt(),
}, (table) => [index('account_costs_workspace_time_idx').on(table.workspaceId, table.incurredAt), index('account_costs_account_idx').on(table.accountId)])

export const strategies = pgTable('strategies', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('strategies_workspace_name_unique').on(table.workspaceId, table.name)])

export const strategyVersions = pgTable('strategy_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  strategyId: uuid('strategy_id').notNull().references(() => strategies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
  notes: text('notes'),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('strategy_versions_unique').on(table.strategyId, table.version)])

export const tradingOrders = pgTable('trading_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => tradingAccounts.id, { onDelete: 'restrict' }),
  externalId: text('external_id'),
  providerOrderId: text('provider_order_id'),
  instrument: varchar('instrument', { length: 40 }).notNull(),
  side: orderSide('side').notNull(),
  quantity: integer('quantity').notNull(),
  filledQuantity: integer('filled_quantity').notNull().default(0),
  averageFillPrice: numeric('average_fill_price', { precision: 18, scale: 8, mode: 'number' }),
  status: orderStatus('status').notNull(),
  providerStatus: varchar('provider_status', { length: 48 }),
  orderType: varchar('order_type', { length: 40 }),
  limitPrice: numeric('limit_price', { precision: 18, scale: 8, mode: 'number' }),
  stopPrice: numeric('stop_price', { precision: 18, scale: 8, mode: 'number' }),
  timeInForce: varchar('time_in_force', { length: 24 }),
  ocoId: text('oco_id'),
  isActive: boolean('is_active').notNull().default(true),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
  lastSyncId: varchar('last_sync_id', { length: 80 }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  origin: dataOrigin('origin').notNull(),
  provider: varchar('provider', { length: 80 }),
  createdAt: createdAt(),
}, (table) => [
  index('trading_orders_workspace_time_idx').on(table.workspaceId, table.submittedAt),
  uniqueIndex('trading_orders_provider_external_unique').on(table.accountId, table.provider, table.externalId),
])

export const tradeExecutions = pgTable('trade_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => tradingAccounts.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').references(() => tradingOrders.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  providerOrderId: text('provider_order_id'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  instrument: varchar('instrument', { length: 40 }).notNull(),
  side: orderSide('side'),
  quantity: integer('quantity').notNull(),
  price: numeric('price', { precision: 18, scale: 8, mode: 'number' }).notNull(),
  pointValue: numeric('point_value', { precision: 18, scale: 8, mode: 'number' }),
  commissionCents: integer('commission_cents'),
    commissionCurrency: varchar('commission_currency', { length: 12 }),
  currency: varchar('currency', { length: 12 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  origin: dataOrigin('origin').notNull(),
  provider: varchar('provider', { length: 80 }),
  createdAt: createdAt(),
}, (table) => [
  index('trade_executions_workspace_time_idx').on(table.workspaceId, table.executedAt),
  uniqueIndex('trade_executions_provider_external_unique').on(table.accountId, table.provider, table.externalId),
])

export const trades = pgTable('trades', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => tradingAccounts.id, { onDelete: 'restrict' }),
  strategyVersionId: uuid('strategy_version_id').references(() => strategyVersions.id, { onDelete: 'set null' }),
  instrument: varchar('instrument', { length: 40 }).notNull(),
  side: orderSide('side').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  netPnlCents: integer('net_pnl_cents'),
  setup: varchar('setup', { length: 120 }),
  session: varchar('session', { length: 80 }),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  origin: dataOrigin('origin').notNull(),
  source: jsonb('source').$type<{ provider: string; externalId: string } | null>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('trades_workspace_opened_idx').on(table.workspaceId, table.openedAt)])

export const tradeContexts = pgTable('trade_contexts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  tradeId: uuid('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  entryPrice: numeric('entry_price', { precision: 18, scale: 8, mode: 'number' }),
  exitPrice: numeric('exit_price', { precision: 18, scale: 8, mode: 'number' }),
  maeCents: integer('mae_cents'),
  mfeCents: integer('mfe_cents'),
  riskReward: numeric('risk_reward', { precision: 10, scale: 4, mode: 'number' }),
  durationSeconds: integer('duration_seconds'),
  quantity: integer('quantity'),
  hunterFamily: varchar('hunter_family', { length: 20 }),
  setupCode: varchar('setup_code', { length: 80 }),
  patternCodes: jsonb('pattern_codes').$type<string[]>().notNull().default([]),
  factors: jsonb('factors').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  filters: jsonb('filters').$type<Record<string, boolean | null>>().notNull().default({}),
  hunterVersion: varchar('hunter_version', { length: 80 }),
  masterNode: varchar('master_node', { length: 120 }),
  slaveNode: varchar('slave_node', { length: 120 }),
  ddBeforeCents: integer('dd_before_cents'),
  ddAfterCents: integer('dd_after_cents'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('trade_context_trade_unique').on(table.tradeId), index('trade_context_workspace_family_idx').on(table.workspaceId, table.hunterFamily)])

export const payouts = pgTable('payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => tradingAccounts.id, { onDelete: 'restrict' }),
  externalId: text('external_id'),
  status: varchar('status', { length: 40 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  origin: dataOrigin('origin').notNull(),
  createdAt: createdAt(),
}, (table) => [index('payouts_workspace_requested_idx').on(table.workspaceId, table.requestedAt)])

export const operationEvents = pgTable('operation_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => tradingAccounts.id, { onDelete: 'set null' }),
  provider: varchar('provider', { length: 80 }),
  externalId: text('external_id'),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  status: varchar('status', { length: 40 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  origin: dataOrigin('origin').notNull(),
  createdAt: createdAt(),
}, (table) => [
  index('operation_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
  uniqueIndex('operation_events_provider_external_unique').on(table.workspaceId, table.provider, table.externalId),
])

export const auditRecords = pgTable('audit_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  actorId: text('actor_id'),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('audit_records_workspace_time_idx').on(table.workspaceId, table.occurredAt)])

export const riskRules = pgTable('risk_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => tradingAccounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  condition: varchar('condition', { length: 80 }).notNull(),
  threshold: integer('threshold').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('risk_rules_workspace_idx').on(table.workspaceId, table.enabled)])

export const integrationEvents = pgTable('integration_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 80 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('integration_events_idempotency_unique').on(table.workspaceId, table.provider, table.idempotencyKey),
  index('integration_events_unprocessed_idx').on(table.workspaceId, table.receivedAt).where(sql`${table.processedAt} is null`),
])

export const integrationConnections = pgTable('integration_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 80 }).notNull(),
  category: varchar('category', { length: 40 }).notNull(),
  status: connectionStatus('status').notNull().default('not_configured'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('integration_connections_workspace_provider_unique').on(table.workspaceId, table.provider)])

export const integrationAccountMappings = pgTable('integration_account_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => integrationConnections.id, { onDelete: 'cascade' }),
  externalAccountId: varchar('external_account_id', { length: 240 }).notNull(),
  externalAccountName: varchar('external_account_name', { length: 120 }).notNull(),
  tradingAccountId: uuid('trading_account_id').references(() => tradingAccounts.id, { onDelete: 'set null' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('integration_account_mapping_external_unique').on(table.connectionId, table.externalAccountId),
  index('integration_account_mapping_workspace_idx').on(table.workspaceId, table.lastSeenAt),
])

export const integrationPositions = pgTable('integration_positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  mappingId: uuid('mapping_id').notNull().references(() => integrationAccountMappings.id, { onDelete: 'cascade' }),
  instrument: varchar('instrument', { length: 80 }).notNull(),
  quantity: integer('quantity').notNull(),
  averagePrice: numeric('average_price', { precision: 18, scale: 8, mode: 'number' }),
  unrealizedPnlCents: integer('unrealized_pnl_cents'),
  lastSyncId: varchar('last_sync_id', { length: 80 }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('integration_positions_mapping_instrument_unique').on(table.mappingId, table.instrument)])

export const integrationSyncBatches = pgTable('integration_sync_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  mappingId: uuid('mapping_id').notNull().references(() => integrationAccountMappings.id, { onDelete: 'cascade' }),
  syncId: varchar('sync_id', { length: 80 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('in_progress'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  positionCount: integer('position_count'),
  orderCount: integer('order_count'),
  executionCount: integer('execution_count'),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('integration_sync_batch_mapping_sync_unique').on(table.mappingId, table.syncId)])

export const marketInstruments = pgTable('market_instruments', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 80 }).notNull(),
  instrumentKey: varchar('instrument_key', { length: 120 }).notNull(),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  displayName: varchar('display_name', { length: 120 }),
  instrumentKind: varchar('instrument_kind', { length: 16 }).notNull(),
  active: boolean('active').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('market_instruments_workspace_provider_key_unique').on(table.workspaceId, table.provider, table.instrumentKey),
  index('market_instruments_workspace_kind_active_idx').on(table.workspaceId, table.instrumentKind, table.active),
  uniqueIndex('market_instruments_workspace_id_unique').on(table.workspaceId, table.id),
])

export const marketInstrumentMetadataVersions = pgTable('market_instrument_metadata_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  sector: varchar('sector', { length: 80 }),
  marketCapWeight: numeric('market_cap_weight', { precision: 12, scale: 8, mode: 'number' }),
  source: varchar('source', { length: 120 }).notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex('market_metadata_workspace_instrument_date_unique').on(table.workspaceId, table.instrumentId, table.effectiveFrom),
  index('market_metadata_workspace_effective_idx').on(table.workspaceId, table.effectiveFrom, table.effectiveUntil),
  foreignKey({ columns: [table.workspaceId, table.instrumentId], foreignColumns: [marketInstruments.workspaceId, marketInstruments.id], name: 'market_metadata_workspace_instrument_fk' }).onDelete('cascade'),
])

export const marketInstrumentSnapshots = pgTable('market_instrument_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull(),
  sourceId: varchar('source_id', { length: 80 }).notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  lastPrice: numeric('last_price', { precision: 18, scale: 8, mode: 'number' }).notNull(),
  priorClose: numeric('prior_close', { precision: 18, scale: 8, mode: 'number' }),
  bid: numeric('bid', { precision: 18, scale: 8, mode: 'number' }),
  ask: numeric('ask', { precision: 18, scale: 8, mode: 'number' }),
  sessionVolume: numeric('session_volume', { precision: 20, scale: 4, mode: 'number' }),
  contractExpiry: varchar('contract_expiry', { length: 24 }),
  sequence: bigint('sequence', { mode: 'number' }),
}, (table) => [
  uniqueIndex('market_snapshots_workspace_instrument_unique').on(table.workspaceId, table.instrumentId),
  index('market_snapshots_workspace_event_idx').on(table.workspaceId, table.eventAt),
  foreignKey({ columns: [table.workspaceId, table.instrumentId], foreignColumns: [marketInstruments.workspaceId, marketInstruments.id], name: 'market_snapshots_workspace_instrument_fk' }).onDelete('cascade'),
])

export const marketMinuteAggregates = pgTable('market_minute_aggregates', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull(),
  minuteStart: timestamp('minute_start', { withTimezone: true }).notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  lastPrice: numeric('last_price', { precision: 18, scale: 8, mode: 'number' }).notNull(),
  priorClose: numeric('prior_close', { precision: 18, scale: 8, mode: 'number' }),
  sessionVolume: numeric('session_volume', { precision: 20, scale: 4, mode: 'number' }),
  sequence: bigint('sequence', { mode: 'number' }),
}, (table) => [
  uniqueIndex('market_minute_workspace_instrument_time_unique').on(table.workspaceId, table.instrumentId, table.minuteStart),
  index('market_minute_workspace_time_idx').on(table.workspaceId, table.minuteStart),
  foreignKey({ columns: [table.workspaceId, table.instrumentId], foreignColumns: [marketInstruments.workspaceId, marketInstruments.id], name: 'market_minute_workspace_instrument_fk' }).onDelete('cascade'),
])

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => tradingAccounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  condition: varchar('condition', { length: 80 }).notNull(),
  threshold: integer('threshold').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('alert_rules_workspace_idx').on(table.workspaceId, table.enabled)])

export const alertEvents = pgTable('alert_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
  accountId: uuid('account_id').references(() => tradingAccounts.id, { onDelete: 'set null' }),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [index('alert_events_workspace_time_idx').on(table.workspaceId, table.occurredAt)])

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  tradeId: uuid('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  plan: text('plan'),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  review: text('review'),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('journal_entries_trade_unique').on(table.tradeId), index('journal_entries_workspace_idx').on(table.workspaceId)])

export const patterns = pgTable('patterns', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('patterns_workspace_name_unique').on(table.workspaceId, table.name)])

export const patternOccurrences = pgTable('pattern_occurrences', {
  id: uuid('id').defaultRandom().primaryKey(),
  patternId: uuid('pattern_id').notNull().references(() => patterns.id, { onDelete: 'cascade' }),
  tradeId: uuid('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  factors: jsonb('factors').$type<Record<string, unknown>>().notNull().default({}),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex('pattern_occurrences_unique').on(table.patternId, table.tradeId)])

export const strategyExperiments = pgTable('strategy_experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  strategyVersionId: uuid('strategy_version_id').notNull().references(() => strategyVersions.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  hypothesis: text('hypothesis'),
  status: varchar('status', { length: 40 }).notNull().default('planned'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (table) => [index('strategy_experiments_version_idx').on(table.strategyVersionId, table.createdAt)])

export const executionNodes = pgTable('execution_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('offline'),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('execution_nodes_workspace_status_idx').on(table.workspaceId, table.status), uniqueIndex('execution_nodes_workspace_name_unique').on(table.workspaceId, table.name)])

export const executionDivergences = pgTable('execution_divergences', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  masterOrderId: uuid('master_order_id').references(() => tradingOrders.id, { onDelete: 'set null' }),
  followerOrderId: uuid('follower_order_id').references(() => tradingOrders.id, { onDelete: 'set null' }),
  kind: varchar('kind', { length: 60 }).notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [index('execution_divergences_workspace_time_idx').on(table.workspaceId, table.detectedAt)])
