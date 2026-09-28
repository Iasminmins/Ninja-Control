# Market Context Map and Entry Filter

## Purpose

Create a Ninja Control tool that reads a TradingView-style Nasdaq 100 treemap and explains whether broad market participation confirms or diverges from NQ/MNQ futures. The tool should help the user evaluate their own entry setups with evidence, rather than produce an unsupported buy/sell call.

## User outcome

Before an entry, the user can see whether the Nasdaq 100 move is broad or concentrated, which sectors and constituents lead or lag, how NQ/MNQ is responding, and which measured facts support the read. As the platform collects entry and outcome history, it can report how similar contexts performed for the user's setups, including the sample size and uncertainty.

## Approved direction and assumptions

- First market: Nasdaq 100 constituents and NQ/MNQ futures as the reference instruments. This is based on the shared TradingView screenshot and the user's NinjaTrader futures workflow; the user can correct it during review.
- First data type: Level I quotes/trades plus reference metadata. Level II order-book heatmap is a separate future feature and is not required for this context map.
- The NinjaTrader integration remains read-only. The tool does not place, change, cancel, or flatten orders.
- The current integration already receives account snapshots, working order state, and session executions. It does not currently subscribe to a broad equity watchlist or persist market quotes.
- Use only a market-data source and display rights that permit this use. Do not scrape TradingView.
- Prices, timestamps, source, and freshness must remain visible. If coverage is incomplete or stale, suppress the market read rather than infer missing values.

## Proposed user experience

Add **Contexto de Mercado** under **Inteligência**.

The main view has:

1. A Nasdaq 100 treemap. Tile area represents the configured market-cap weight; tile color represents the selected return window. Tiles group by sector and expose symbol, company, last price, percent change, data time, and source on hover/click.
2. A configurable window: session change by default, with shorter intraday windows such as 5 and 15 minutes where the source supports trustworthy timestamps.
3. A compact market-breadth panel: advancing/declining counts and proportions, cap-weighted index change, sector breadth, top positive/negative contributors, and concentration in the largest contributors.
4. An NQ/MNQ reference panel: last price, change, intraday direction, volume/relative volume where available, and relationship to the constituent breadth. Show the exact contract and expiry to avoid comparing different instruments silently.
5. A structured **Leitura do mercado**: `Alinhado`, `Divergente`, `Misto`, or `Dados insuficientes`, followed by evidence cards that cite computed inputs. The narrative may be rendered in natural language, but its facts and state come from deterministic metrics and must not invent reasons or probabilities.

The tool does not label a market context "favorable to trade" until it is linked to a user-defined setup and has passed the statistical validation described below. It never implies that a favorable context guarantees a winning trade.

## Data and processing

### Source and entitlement

Prefer a supported NinjaTrader connection already entitled to the Nasdaq 100 equity symbols and NQ/MNQ. Confirm that symbol coverage, timestamps, session data, and redistribution/storage terms support the feature. If the current connection cannot provide the constituents, select a licensed quote provider before implementation; do not silently mix sources.

Maintain a versioned reference dataset for constituent symbol, display name, sector, market-cap weight, and effective dates. This metadata needs a documented source and update process. Use the effective weight as of the market date to avoid applying today's constituents or weights to past sessions.

### AddOn collection

Extend the existing read-only AddOn with a separate watchlist subscription and market-data queue. Keep market snapshots isolated from account/order/execution delivery so quote bursts cannot delay trading events. Subscribe only to configured index constituents and selected futures contracts. Unsubscribe on connector shutdown or instrument removal.

Capture source time and server receive time separately. Batch changed quote values into compact payloads, with a bounded queue and explicit dropped/stale status. The initial UI target is a 5-second refresh; tune it against provider limits, payload limits, API cost, and observed latency. Persist minute-level breadth/context history rather than every raw quote mutation. Keep a current market-map snapshot for the live screen and a bounded history for validation.

### Normalization

For each component, calculate change from the correct prior regular-session close and intraday window return. For the treemap, scale tiles by the effective market-cap weight and color by selected return. Use the exchange session calendar and timezone. Exclude halts, missing previous closes, invalid quotes, and stale constituents from the denominator while showing coverage.

Compute breadth as explicit counts and weights, not from the rendered colors. Derive sector participation, weighted return, contributor concentration, and NQ/MNQ alignment from the same time bucket. Never compare timestamps from different ages without marking the skew.

## Statistical entry filter

The first release is a descriptive market read, not a probability model. Record market-context features and the user's pre-entry setup/risk plan only after the market map is reliable. Associate context with actual NinjaTrader fills and closed round trips without changing existing gross/net accounting.

Later, estimate outcomes conditional on a defined setup and context using a chronological walk-forward split. Features must use only information available at decision time; labels use subsequent trade results and costs. Show sample size, estimate uncertainty, date range, data coverage, and net/gross basis. If sample size is small, cost data is missing, or performance does not persist out of sample, display `Evidência insuficiente` and suppress probability and `favorável/aguardar` labels. Optimize for net expectancy and drawdown alongside win rate; do not optimize hit rate alone.

Any future live filter is setup-specific and explainable: it may show `Contexto alinhado`, `Misto`, `Divergente`, or `Sem evidência`, list the facts, and leave the trading decision and order with the user. No exact entry-price command or automatic order routing is in scope.

## Architecture boundaries

- AddOn: quote subscriptions, batching, timestamps, bounded backpressure, and read-only lifecycle.
- Ingestion API: authenticated workspace-scoped batch validation, source checks, idempotency, size limits, freshness, and compact persistence.
- Database: versioned market universe metadata, current map snapshot, and bounded minute aggregates. Apply retention and indexes by workspace and market time.
- Server calculations: normalization, breadth/concentration, futures alignment, and evidence-backed state.
- UI: treemap, filters, market coverage/freshness, NQ/MNQ comparison, and evidence panel.
- Analytics extension: only after enough prospectively collected and labeled entries exist; walk-forward statistics with costs, sample size, and uncertainty.

All writes and queries are workspace-scoped. Market-data credentials or provider tokens must not be embedded in browser code or logs.

## Rollout

1. Verify data entitlement and constituent coverage in the user's NinjaTrader connection; select a licensed fallback only if needed.
2. Implement quote collection, metadata, compact persistence, and the live treemap/breadth read.
3. Observe latency, missing symbols, dropped updates, and storage before enabling context classifications.
4. Collect prospective market contexts and pre-entry setup records; do not backfill decisions from future information.
5. Validate setup-specific statistics out of sample before enabling any probability-based entry filter.

## Non-goals

- Scraping or republishing TradingView market data.
- Reproducing all TradingView asset classes, screeners, news, or financial statements.
- Level II liquidity heatmap in this first tool.
- Automated trading or order suggestions with no user-defined setup.
- Claiming predictive accuracy before prospective data and validation exist.

## Acceptance criteria

1. The treemap clearly identifies the market session, return window, source, quote age, and universe coverage.
2. Tile size, tile color, and sector grouping have explicit definitions and do not rely on missing data as zero.
3. Breadth and NQ/MNQ alignment are computed from time-aligned, workspace-authorized market data; every interpretation is traceable to visible values.
4. Stale, delayed, partial, or unsupported symbol coverage produces a visible degraded state and suppresses unsupported interpretation.
5. The AddOn remains read-only, quote backpressure cannot block execution delivery, and subscriptions are cleaned up.
6. The system persists bounded aggregates and applies a retention policy; it does not write an unbounded row for every quote event.
7. No win probability or setup-quality recommendation appears until entry-time features and outcomes have sufficient, cost-aware, out-of-sample evidence.
8. No displayed market context automatically sends, changes, cancels, or flattens an order.

## Risks and open decisions for review

- The user's current provider may not include all Nasdaq 100 equity quotes, even if NQ futures data is available.
- A market-data subscription may prohibit persistent storage or multi-user display; entitlements and terms must be checked before implementation.
- Constituent/sector/weight history requires an authoritative, versioned reference source.
- The AddOn source needs compilation against the user's installed NinjaTrader version after implementation.
- The 5-second live cadence and minute-history cadence are initial targets and must be adjusted to provider limits and real latency.
