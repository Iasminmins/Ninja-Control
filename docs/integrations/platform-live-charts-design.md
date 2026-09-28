# Live Account Charts and NinjaTrader Metrics Design

## Goal

Make account state and platform charts reflect the NinjaTrader data that was actually received, while keeping derived gross P&L distinct from provider-confirmed net P&L.

## User-approved accounting rule

Build round-trip trade records from executions and account position transitions. Match fills by account and instrument using FIFO lots, retain partial fills, and split a reversal into the closing quantity plus the newly opened quantity. Calculate **gross** realized P&L only when the instrument point value is known. Persist fees separately when supplied by a verified provider field. Keep `netPnlCents` null until fees and other required costs are confirmed; never copy gross into a net field.

When point value, side, ordering, or correction history is insufficient, preserve raw executions and mark the trade projection incomplete. Do not invent a P&L or count an incomplete position cycle as closed. Corrections/removals must recalculate affected cycles idempotently.

## Data and freshness

- Preserve provider `occurredAt` as the source event time and record server `receivedAt` separately for each accepted event.
- Update account mapping activity from every accepted mapped-account event, using server receive time. Keep connector activity and provider-data freshness as separate values.
- Show a connected AddOn with delayed provider timestamps as connected but with stale data and the measured delay; do not label old values real time.
- Coalesce superseded queued account snapshots by account while preserving the newest one. Order, position, execution, correction, discovery, and reconciliation events retain their ordering and idempotency. Increase delivery throughput with bounded batches where supported; do not let a snapshot burst starve execution and reconciliation events.
- Keep a time-series of account equity snapshots. Account-state views use the newest valid state, while the equity chart reads historical snapshots in chronological order. Ignore out-of-order snapshots for the current-state projection but retain their event record.
- On first account discovery/link and every refresh, immediately surface all provider fields already observed in the account snapshot, including `GrossRealizedProfitLoss`, `RealizedProfitLoss`, `UnrealizedProfitLoss`, cash, net liquidation/equity, currency, open positions, and working orders. Display provider field names/source and observation status; do not wait for a closed trade to show account-level results.
- Calculate observed account drawdown from the account's equity history: running peak equity minus current equity, with high-water mark scoped to that account and available history. Label this as observed/calculated drawdown. Do not call it a prop-firm trailing drawdown or available buffer unless the configured account rules and reset semantics support that calculation. If historical peak is incomplete, mark it partial/insufficient.

## Charts and metric semantics

- Dashboard and Accounts: show the current account snapshot and provider-reported gross realized, realized, and unrealized values immediately after integration/link; add a per-account or all-account equity history chart from account snapshots. Make selected range, source, latest receipt time, provider time, and stale status visible.
- Analytics and Performance: show a cumulative gross P&L curve and daily gross P&L for NinjaTrader-derived trades. Show net P&L separately only for records with provider-confirmed or otherwise verified net values. Never combine gross and net samples in one series or aggregate.
- Comparator: present comparable P&L basis and sample size for each side; show “sem amostra” instead of a zero result when no eligible trades exist.
- Risk metrics must honor selected account and date range. If account-specific or period-specific snapshots are missing, show unavailable rather than a workspace-wide value as if it matched the filters.
- Account-level provider `RealizedProfitLoss` and `UnrealizedProfitLoss` remain account metrics; do not allocate them to individual trades.
- Use an explicit empty state when no chart sample exists. A numeric zero is reserved for an observed/calculated zero with a non-empty sample.

## Compatibility and persistence

- Keep existing Hunter/provider trades and raw NinjaTrader executions readable.
- Additive migration only: store gross P&L, fee amount/availability, P&L basis/source, completeness, and server receive time as needed. Existing net trade values retain their current meaning.
- Preserve the read-only AddOn invariant. No order submission, modification, cancellation, or flattening is in scope.
- Keep the downloadable NinjaTrader AddOn archive synchronized with its source and Portuguese setup documentation.

## Acceptance criteria

1. A delayed event shows its server receive time and provider occurrence time separately; account connection status cannot be inferred from stale discovery time alone.
2. Repeated account snapshots do not accumulate an unbounded queue or delay execution/reconciliation events behind snapshots.
3. Partial entries/exits, reversals, duplicate fills, out-of-order fills, and execution corrections produce deterministic position cycles; incomplete data produces no fabricated P&L.
4. Provider-reported gross realized, realized, unrealized, cash, and equity are visible immediately when present in the latest snapshot. Gross realized P&L is never stored or labeled as net P&L. Fees are shown only when observed; net remains unavailable otherwise.
5. Current equity and equity history display from persisted account snapshots with honest freshness indicators.
6. Daily and cumulative trade charts state their P&L basis and use only eligible closed samples.
7. Empty samples show no sample, not a financial zero. Comparisons use matching P&L bases.
8. Observed drawdown is calculated from account-scoped equity history and clearly distinguished from rule-based trailing drawdown/buffer. Drawdown and recovery metrics use the same account and time filters as the visible page, or show unavailable.
9. All account and chart queries remain workspace scoped, and the connector remains read-only.

## Implementation boundaries

Changes span the NinjaTrader AddOn/event contract, the event ingestion route and database migration, execution-to-trade projection, account reads, Dashboard/Analytics/Performance/Comparator/Risk UI, and the downloadable AddOn package. The implementation plan must keep these steps ordered so schema and contract changes land before the UI consumes them.

## Known limitations to keep visible

- NinjaTrader/provider history is limited to executions exposed to the AddOn; this work does not claim unlimited historical backfill.
- Net P&L cannot be inferred from gross fills without complete fee and cost data.
- NinjaTrader runtime compilation and simulation comparison require the user's installed platform; a web build alone cannot verify those behaviors.
