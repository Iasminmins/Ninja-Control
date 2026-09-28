# NinjaTrader live account state design

## Intent

Make Ninja Control show a trustworthy, up-to-date view of every NinjaTrader account linked to a workspace, including positions and working orders that were already open before the AddOn starts. Preserve an explainable event history and distinguish provider values from calculations and manually configured prop-firm rules.

The connector remains strictly read-only. It may observe account data but must never submit, change, cancel, or flatten orders.

## User-visible outcomes

- Starting or reconnecting the AddOn reconciles the current state already present in NinjaTrader; the user does not need to close and reopen orders to make them appear.
- Subsequent account, position, order, and execution changes become visible promptly.
- Every displayed live value identifies its source and last update time. Stale or disconnected data is not presented as current.
- Working, partially filled, filled, cancelled, and rejected orders remain distinct. Current working orders are easy to scan; completed order history remains available separately.
- Current positions do not remain falsely open after they close or disappear from the provider's current position set.
- User can inspect accepted, delayed, rejected, and retried connector events without exposing the bearer token.
- Dashboard, Accounts, Operations, and Integrations use the same persisted account state.

## Data sources and limits

The NinjaTrader AddOn is the reader. It can subscribe to account item, position, order, and execution update events and inspect the associated account collections. Initial synchronization must enumerate current account positions and working orders and reconcile them with persisted state before relying on future callbacks. Initial execution history is limited to the executions exposed by NinjaTrader for the connected account/session; the feature must not claim a complete historical backfill unless the provider supplies it.

Availability and semantics of values such as buying power, margin, realized P&L, and trailing drawdown vary by connection provider. Values unavailable from the provider remain explicitly unavailable. Prop-firm daily loss, payout eligibility, consistency, and drawdown rules are calculated only from configured rules and sufficiently complete account events, and are labeled as Ninja Control calculations rather than provider facts.

## Architecture

### Connector lifecycle and reconciliation

On start and reconnect, identify selected accounts, announce discovery, and send a reconciliation batch with a unique synchronization ID. Include an account snapshot, the complete current position set, and all working orders. Include executions available from the provider's current collection with stable provider IDs. End the batch with a completion marker so the server can distinguish a complete empty collection from data that has not arrived yet.

Then subscribe to account, position, order, execution, and account-status callbacks. Re-send compact account snapshots periodically as a recovery mechanism. Serialize outbound delivery per installation, retry transient failures with bounded backoff, and surface permanent responses such as unauthorized token, missing account link, malformed payload, and server error in connector diagnostics. Never silently discard an event or let one permanent error block unrelated accounts indefinitely. Persist queued events locally across NinjaTrader restarts where feasible, without storing the raw token outside the existing Windows-protected settings.

Each event has an event ID, provider account ID, installation ID, event type, event occurrence time, server receive time, and synchronization ID where applicable. Order and execution events include their provider IDs and relationship IDs when available. Apply provider sequence/version data when available; otherwise reject older state transitions by comparing occurrence timestamps while retaining them in the event history.

### Persistence and projections

Keep `integration_events` as the auditable event ledger. Maintain current account snapshots, current positions, and current order state as projections keyed by workspace, provider connection, account mapping, and provider object ID. An order update replaces the current projection for that order while its event remains in the ledger. Execution identity must support provider correction/removal semantics where exposed; duplicate delivery is idempotent, but an update to an existing provider execution is not discarded as a duplicate.

Use reconciliation batch boundaries to mark the current position and working-order sets as complete. Only after a complete accepted batch may absent positions/orders be closed or marked absent. Preserve last-known records and history rather than deleting them. Do not mix data from different NinjaTrader installations that happen to use the same account name; mappings remain installation-specific until explicitly linked.

### Read API and UI

Provide workspace-authenticated reads that return a normalized per-account view: connection status, provider mode, last heartbeat, last account snapshot, freshness, current balances and P&L values, current positions, working orders, recent executions, and recent connector errors. The API must scope all reads by workspace and linked account.

Refresh the relevant client views frequently while visible, using bounded polling or another existing app-supported mechanism. Show `lastUpdatedAt` and a clear `online`, `stale`, or `offline` state. Do not label a page "real time" when its data is stale. The Integrations page focuses on connector health and account mapping. Dashboard and Accounts focus on current account state. Operations shows current working orders and recent order transitions. Closed order/execution history is separate from active state.

### Trades and metrics

Keep raw executions separate from round-trip trades. Build or update trades by reconciling executions and position changes, preserving partial entries/exits and corrections. Do not calculate closed-trade P&L from order status alone. Display account-level realized and unrealized P&L from the provider when available, and label Ninja Control's derived P&L separately. Daily loss, trailing drawdown, consistency, contract limits, and payout eligibility require account-specific prop-firm rules, session timezone/reset semantics, and sufficient event history. Missing prerequisites produce an unavailable/insufficient-data state, never a fabricated number.

## Error handling and safety

- No credentials or full bearer tokens in logs, event payload display, or UI diagnostics.
- Validate payload shape, numeric ranges, provider identifiers, workspace ownership, and account mapping before projecting data.
- Retry idempotently; expose retry count and last error by account/event category.
- Preserve unexpected provider fields only in a bounded, sanitized diagnostic payload if needed; never let untrusted event fields control SQL or workspace scope.
- Read-only behavior is a hard invariant in both AddOn and server API.
- Freshness thresholds are explicit and configurable; stale state remains visible with its capture time.
- A failed or incomplete initial reconciliation cannot clear a previously known position/order set.

## Rollout and verification

1. Confirm exact NinjaTrader collection and event APIs for current working orders, positions, account status, and execution corrections against the installed NT8 documentation/compiler.
2. Evolve event contract and database projections with backward-compatible migration; retain support for existing installed AddOn versions during transition.
3. Implement connector startup/reconnect reconciliation, subsequent updates, durable retry, and diagnostics.
4. Implement workspace-scoped normalized reads and wire Accounts, Dashboard, Operations, and Integrations to them.
5. Validate against a simulation account: pre-existing working order and open position at connector startup, partial fill, order state changes, cancel/reject, position close, duplicate/out-of-order delivery, connector restart, lost network, invalid token, and reconnect. Compare each value and timestamp against NinjaTrader. Then validate LIVE in read-only mode.

## Acceptance criteria

- An already-open position and already-working order appear after the AddOn starts, without requiring a new trade or order event.
- A subsequent fill/state change updates the current order exactly once and remains visible in the event history.
- Repeated or out-of-order delivery cannot revert the current order/position projection to an older state.
- Complete reconciliation removes stale open state only when the provider confirms the reconciliation batch completed.
- Closing a position updates the current view and preserves its historical activity.
- Account metrics and status show source and freshness; stale/offline data is visibly distinct.
- No unsupported provider or prop-firm value is represented as verified live data.
- Connector errors are visible and do not silently stop unrelated account synchronization.
- All account views are workspace-isolated and connector behavior remains read-only.

## Explicit non-goals

- Submitting, modifying, cancelling, or flattening orders from Ninja Control.
- Claiming unlimited historical execution backfill beyond what NinjaTrader/provider exposes.
- Treating a NinjaTrader account heartbeat as a Master/Slave execution-node heartbeat.
- Guessing prop-firm rules or presenting incomplete derived metrics as exact.
