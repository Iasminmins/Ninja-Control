# NinjaTrader 8 Desktop Connector

This connector is a local NinjaScript AddOn for NinjaTrader 8. It sends read-only account events to the authenticated Ninja Control workspace endpoint. It never submits, changes, cancels, or flattens orders.

## Setup

1. Open **Integrações → NinjaTrader 8 Desktop** in Ninja Control.
2. Create a connector token and copy it immediately. The raw token is shown once; Neon stores its SHA-256 hash.
3. On any Windows PC with NinjaTrader 8 Desktop, open **New → NinjaScript Editor**, create an AddOn named `NinjaControlAddOn`, paste in `integrations/ninjatrader/NinjaControlAddOn.cs`, and compile. The source file has no machine-specific account or credential values.
4. In the NinjaTrader Control Center, choose **New → Ninja Control · Iniciar sincronização somente leitura**. Paste the HTTPS endpoint and workspace token, then select the Sim/demo account from the list. The AddOn keeps the token encrypted with Windows DPAPI for the current Windows user and stores settings under `Documents\NinjaTrader 8\NinjaControl`. It assigns a local installation ID so identical account names on separate PCs remain separate discovered accounts.
5. Return to Ninja Control. The discovered account appears in the integration panel. Explicitly link it to an existing Ninja Control account.

For another PC or Windows user, compile the same AddOn source and repeat steps 1–4. Each installation needs the workspace token entered once. A token protected on one Windows user profile cannot be copied as usable credentials to another PC; create or rotate a token in the Ninja Control page if needed.

## Initial data contract

The AddOn sends `account_discovered`, `account_snapshot`, `position_snapshot`, `order`, and `execution` events. Every payload includes a stable event ID for retry deduplication and UTC occurrence time. The endpoint accepts a maximum 64 KB JSON body. Monetary amounts are sent in integer cents; position prices are numeric.

An event for a discovered-but-unlinked account returns HTTP 409, so the connector keeps it queued and retries after the user links the account. The local queue is bounded to 1,000 events and remains in memory; closing NinjaTrader discards any queued events. The AddOn retries failed requests every two seconds. After linking, fresh events resume synchronization. Historical order or execution backfill is not performed.

Executions are stored as fills. They are not automatically grouped into closed trades, because a correct round-trip requires position reconciliation that this first connector does not infer. Current position snapshots are stored separately. Account balance/equity snapshots currently use NinjaTrader account cash value plus unrealized P&L. Daily loss is omitted because the platform account event does not provide a universally reliable prop-firm daily-loss figure.

## Security and scope

- Use only a Sim/demo account; the AddOn's account picker filters out accounts not identified as simulation accounts.
- Each workspace has a separate bearer token; revoke or rotate it from the integration page.
- Use HTTPS for the endpoint. Do not paste the token into screenshots, chat, or public repositories.
- The integration supports platform data synchronization only. It does not connect to or control other prop-firm websites.
- Do not change the AddOn to call any NinjaTrader order mutation methods.

## Database migration

Migration `0005_ninjatrader_desktop.sql` adds external account mappings and current position snapshots. It has not been applied to production. Apply the migration before deploying these API routes.
