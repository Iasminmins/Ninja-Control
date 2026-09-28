# NinjaTrader 8 Desktop Connector

This connector is a local NinjaScript AddOn for NinjaTrader 8. It sends read-only account events to the authenticated Ninja Control workspace endpoint. It never submits, changes, cancels, or flattens orders.

## Setup

1. Open **Integrações → NinjaTrader 8 Desktop** in Ninja Control.
2. Create a connector token and copy it immediately. The raw token is shown once; Neon stores its SHA-256 hash.
3. On any Windows PC with NinjaTrader 8 Desktop, open **New → NinjaScript Editor**, create an AddOn named `NinjaControlAddOn`, paste in `integrations/ninjatrader/NinjaControlAddOn.cs`, and compile. The source file has no machine-specific account or credential values.
4. In the NinjaTrader Control Center, choose **New → Ninja Control · Iniciar sincronização somente leitura**. Paste the HTTPS endpoint and workspace token, then check one or more accounts in the list. All checked accounts synchronize at the same time, and the selection is saved for this Windows user. Live accounts are labeled `LIVE · CONTA REAL`; simulation accounts are labeled `SIM · DEMONSTRAÇÃO`. Confirm the mode before starting. The AddOn keeps the token encrypted with Windows DPAPI for the current Windows user and stores settings under `Documents\NinjaTrader 8\NinjaControl`. It assigns a local installation ID so identical account names on separate PCs remain separate discovered accounts.
5. Return to Ninja Control. The discovered account appears in the integration panel. Explicitly link it to an existing Ninja Control account.

For another PC or Windows user, compile the same AddOn source and repeat steps 1–4. Each installation needs the workspace token entered once. A token protected on one Windows user profile cannot be copied as usable credentials to another PC; create or rotate a token in the Ninja Control page if needed.

## Initial data contract

The AddOn sends `account_discovered`, `sync_start`, `account_snapshot`, current `position_snapshot` events, active `order` states, session `execution` records, and `sync_complete` during startup. It subscribes to account, position, order, and execution changes before taking this initial snapshot, refreshes changed account values at most every five seconds, and forces a complete account snapshot every two minutes. Every payload includes a stable event ID for retry deduplication and UTC occurrence time. The endpoint accepts a maximum 64 KB JSON body. Monetary amounts are sent in integer cents; position prices are numeric.

An event for a discovered-but-unlinked account returns HTTP 409, so the connector keeps it queued and retries after the user links the account. The local queue is bounded to 1,000 events and remains in memory; closing NinjaTrader discards any queued events. The AddOn retries requests every two seconds and writes HTTP error status/code to the NinjaTrader Output window. A 4xx event is rotated to the queue tail so an unlinked or rejected event for one account does not hold up other accounts. After linking, fresh events resume synchronization. Historical order or execution backfill beyond NinjaTrader's current session collections is not performed.

Executions are stored as fills with instrument point value and currency, commission and account denomination (when NinjaTrader exposes them), and provider execution time. Analytics match fills FIFO by account and instrument and calculate a gross result only when the required point value and currency are known. Commission is shown separately; derived net is omitted if any required commission is unknown or its currency differs from the instrument P&L currency. Closed-trade metrics already stored by the workspace remain a separate sample and are not mixed with derived gross results. Historical execution backfill is limited to executions exposed by NinjaTrader's current session collections.

Snapshots include supported NinjaTrader account items with an `observed` marker, currency, and equity calculation method. The dashboard and account screens display observed provider gross realized P&L, realized P&L, unrealized P&L, balance, and equity separately. Equity uses observed Net Liquidation when NinjaTrader reports it; otherwise the AddOn reports Cash Value plus Unrealized P&L as a calculated estimate. The equity chart plots snapshots in server receipt order and displays both the provider capture time and server receipt time. Account drawdown is the observed equity decline from the highest equity snapshot available in the stored history; it is not a prop-firm trailing drawdown rule. Daily loss is omitted because the platform account event does not provide a universally reliable prop-firm daily-loss figure.

The UI reports connector freshness (last event received by the server) separately from provider-data freshness (age of the timestamp supplied by NinjaTrader). A connector can be online while its data is stale. If provider timestamps are old, check NinjaTrader's Output window and the PC clock; the server receipt timestamp helps distinguish transport from source timestamp delay.

## Security and scope

- Live accounts are supported. The integration is strictly read-only: it subscribes to account, position, order, and execution updates and has no order submission, change, cancel, or flatten calls.
- NinjaTrader Live accounts use real money. Confirm the `LIVE · CONTA REAL` label before starting. Simulation accounts are labeled `SIM · DEMONSTRAÇÃO`.
- Each workspace has a separate bearer token; revoke or rotate it from the integration page.
- Use HTTPS for the endpoint. Do not paste the token into screenshots, chat, or public repositories.
- The integration supports platform data synchronization only. It does not connect to or control other prop-firm websites.
- Do not change the AddOn to call any NinjaTrader order mutation methods.

## Database migration

Migration `0005_ninjatrader_desktop.sql` adds external account mappings and current position snapshots. Migrations `0006`–`0010` add live account values, order and execution state, sync reconciliation, and provider identifiers. Migration `0011_execution_pnl_fields.sql` adds point value, commission, and currency to execution fills. Apply all pending migrations before deploying these API routes.
