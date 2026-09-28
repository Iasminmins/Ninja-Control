# NinjaTrader Live Account State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show a trustworthy current view of NinjaTrader accounts, including state already open when synchronization starts, with order/execution history, freshness, and diagnostics.

**Architecture:** Keep the existing integration event ledger as the audit trail, and maintain current account, position, and order projections in the database. The AddOn performs a complete startup/reconnect reconciliation before relying on future events; workspace-scoped reads feed the account, dashboard, operations, and integration screens.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Neon Postgres, NinjaTrader 8 NinjaScript AddOn (C#), existing React workspace screens.

**Spec:** `docs/integrations/ninjatrader-live-state-design.md`

## Global Constraints

- The connector remains read-only and contains no order submission, change, cancel, or flatten calls.
- Preserve existing uncommitted user changes in the AddOn, docs, downloads, and `.gitignore`.
- Keep workspace and linked-account scoping on every persisted read/write.
- Do not present unavailable provider fields or incomplete prop-firm calculations as verified data.
- Preserve compatibility with already-installed AddOn versions during the event-contract transition.
- Read the repository's local Next.js 16 docs before editing route handlers or data-rendering behavior.
- Do not create or run automated tests unless the user asks; use build/type validation and explicitly report connector-runtime limits.

## Review Focus

- Startup snapshot must include positions and working orders already open: validate by inspecting current account collections before event subscription and on reconnect.
- Empty or failed reconciliation must not close previously known positions/orders: require an accepted completion marker before marking absent.
- Repeated/out-of-order order events must not revert current state: retain all events and update projection only with a newer state.
- Multiple accounts/installations can reuse external names or order IDs: scope provider-object identity by account mapping and connection.
- Disconnected or stale state must remain visibly stale and must not masquerade as current: expose capture and receive times and freshness status.

## Files and Responsibilities

- `lib/db/schema.ts`: account snapshot details, current position/order projections, synchronization batches, and connector diagnostics schema.
- `lib/db/migrations/`: backward-compatible migration for new projection fields, identities, and batch/reconciliation metadata.
- `app/api/integrations/ninjatrader-desktop/events/route.ts`: validate, persist, and project provider events idempotently.
- `app/api/integrations/ninjatrader-desktop/accounts/route.ts` and new workspace read route(s): normalized current account state and health.
- `integrations/ninjatrader/NinjaControlAddOn.cs`: initial/reconnect reconciliation, callbacks, bounded retry, and visible diagnostics.
- `components/modules/integrations/ninjatrader-desktop-screen.tsx`: connector state, freshness, and event errors.
- `lib/operations/server.ts`, `lib/accounts/server.ts`, and account/dashboard/operations screens: consume persisted state consistently.
- `docs/integrations/ninjatrader-desktop.md`, `integrations/ninjatrader/LEIA-ME.txt`, downloadable ZIPs: keep setup instructions and distributable AddOn in sync after code changes.

## Implementation Tasks

### Task 1: Confirm NinjaTrader initial-state and correction APIs

- Inspect the official NT8 docs and AddOn signatures for `Account.Orders`, `Account.Positions`, `Account.Executions`, account status, and execution remove/amend notifications.
- Decide from verified API behavior how to enumerate working orders and identify an execution correction/removal; do not guess method or property names.
- Record which account metrics are provider-dependent and the concrete source fields the AddOn can safely send.
- Proceed only with API behavior verified from docs or local NinjaTrader references; note any NT runtime compilation that cannot be performed in this workspace.

### Task 2: Add durable current-state and reconciliation persistence

- Add provider account snapshot details/current state and sync-batch completion metadata.
- Scope position reconciliation by account mapping and mark absent positions only after an accepted complete batch.
- Ensure order projections use account-scoped provider identity and retain event history in `integration_events`.
- Add migration without modifying previously applied migrations; preserve existing account links and connector metadata.
- Update Drizzle schema and migration snapshots if this repository convention requires it.

### Task 3: Make ingestion maintain correct current state

- Extend payload validation for snapshot, working-order reconciliation, order transitions, executions/corrections, account status, and sync completion.
- Insert every accepted event idempotently in the event ledger, then update the current order/execution/snapshot projections transactionally.
- Apply stale-event guards to projections while retaining out-of-order events for audit.
- Require completed reconciliation before marking missing positions/orders absent.
- Return structured accepted/duplicate/error details safe for the AddOn to diagnose.

### Task 4: Reconcile startup and reconnect in the AddOn

- Send account discovery and initial account snapshot.
- Enumerate current non-flat positions and currently working/part-filled orders already present in NinjaTrader, plus provider-exposed executions when safely identifiable.
- Emit one reconciliation completion event per account/batch only after all state records are queued successfully.
- Subscribe to updates without a gap: establish callbacks before or atomically around enumeration and deduplicate overlap.
- Send periodic account snapshots and account connection status; persist retry queue locally if feasible with bounded storage and no raw-token persistence.
- Log permanent HTTP response errors to NinjaTrader Output and keep retrying transient failures with bounded backoff; don't let a permanent error for one account starve other account queues.

### Task 5: Expose normalized state and connector health

- Add workspace-authenticated read API for linked accounts, latest snapshots, current positions, working orders, recent executions, connector status/freshness, and recent safe diagnostics.
- Scope every result to the authenticated workspace and account mapping.
- Refresh while the page is visible with bounded polling and display source/time/freshness consistently.

### Task 6: Wire the user-facing screens and documentation

- Show current account state on Dashboard and Accounts; show open orders and recent transitions in Operations; show connector health on Integrations.
- Keep completed order/execution history distinct from working orders.
- Keep Master/Slave node heartbeat distinct from broker/account connectivity.
- Synchronize Portuguese setup docs and regenerate both AddOn ZIPs from the same source, preserving current user edits.
- Add a manual simulation checklist for already-open startup state, partial fill, cancel/reject, close, restart, network loss, duplicate and out-of-order delivery.

## Validation

- Run the project production build/type checks after code changes; report exact command and result.
- Do not run automated tests unless requested by the user.
- NinjaTrader AddOn compilation and simulation-account comparison require the user's installed NinjaTrader environment; provide the exact steps and do not claim runtime verification until performed.
- Review `git diff` and `git status` to confirm no existing user changes or credentials were overwritten or staged accidentally.
