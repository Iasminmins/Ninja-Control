# Hunter Webhook Contract

The connector receives JSON over HTTPS at `/api/integrations/hunter-webhook/events`.
Create a workspace token in **Integrações Hunter** and send it as
`Authorization: Bearer <token>`. The raw token is shown once; Neon stores only
its SHA-256 hash. Rotate or revoke it from the same page.

Every request must include a unique, stable `eventId`, a supported `type`, and
an ISO 8601 `occurredAt`. Re-sending an event with the same `eventId` is
idempotent. Requests are limited to 64 KB. The connector is write-only: it
records events and never submits, edits, blocks, or cancels trading orders.

## Heartbeat

```json
{
  "eventId": "node-2026-09-27T15:00:00Z-1",
  "type": "heartbeat",
  "occurredAt": "2026-09-27T15:00:00.000Z",
  "nodeName": "Hunter Master",
  "role": "master",
  "latencyMs": 12,
  "position": { "instrument": "NQ", "quantity": 1 }
}
```

`role` must be `master` or `slave`; `position` is an optional map of primitive
values. Heartbeats update the node's last-seen time and online status.

## Closed trade

```json
{
  "eventId": "trade-unique-123",
  "type": "trade",
  "occurredAt": "2026-09-27T15:04:32.000Z",
  "accountId": "00000000-0000-0000-0000-000000000000",
  "instrument": "NQ",
  "side": "long",
  "quantity": 1,
  "openedAt": "2026-09-27T15:00:00.000Z",
  "closedAt": "2026-09-27T15:04:32.000Z",
  "netPnlCents": 42800,
  "entryPrice": 21482.25,
  "exitPrice": 21503.75,
  "maeCents": 8400,
  "mfeCents": 61200,
  "riskReward": 2.41,
  "durationSeconds": 272,
  "hunterFamily": "HSG",
  "setupCode": "HSG-07",
  "patternCodes": ["HSG-P17"],
  "factors": { "vwapAligned": true, "delta": "positive" },
  "filters": { "filterX": true, "filterY": false },
  "hunterVersion": "3.6",
  "session": "New York",
  "notes": "Optional connector note"
}
```

The `accountId` must belong to the workspace token. P&L, MAE, and MFE are
integer cents; prices are numeric instrument prices. A closed trade creates
its trade context, pattern occurrences, and automatic journal record in the
same database transaction.

## Risk snapshot

Send `type: "risk_snapshot"`, `accountId`, and any known integer-cent fields:
`balanceCents`, `equityCents`, `peakBalanceCents`, `maxDrawdownCents`,
`currentDrawdownCents`, `remainingDrawdownCents`, `dailyLossCents`,
`contractsOpen`, and `exposureCents`. Unknown values should be omitted or null.

## Order, divergence, and alert

- `order`: `accountId`, `instrument`, `side` (`buy`/`sell` or `long`/`short`),
  positive `quantity`, and `status` (`pending`, `accepted`,
  `partially_filled`, `filled`, `cancelled`, or `rejected`). `externalId` is
  optional.
- `divergence`: `kind` plus a primitive `details` map.
- `alert`: `message`, `severity` (`INFO`, `WARNING`, `HIGH`, `CRITICAL`), and
  optional `accountId`.

## Responses

- `202`: event accepted.
- `200` with `duplicate: true`: that event ID was already processed.
- `400`: invalid JSON or event contract.
- `401`: token missing, revoked, or invalid.
- `404`: referenced account is not in the token's workspace.
- `413`: request exceeds 64 KB.
- `500`: event transaction failed; retry with the same `eventId`.
