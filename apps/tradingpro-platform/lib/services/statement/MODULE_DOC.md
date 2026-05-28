# Statement aggregation module

## Purpose

Enterprise statement assembly: paginated reads with count reconciliation, ledger-first semantics, and a trade register keyed by execution time.

## Changelog

- **2026-04-01:** `statement-event-builder` synthetic trade lines and admin statement pipeline use `instrumentLabel` / linked `Stock` via `formatInstrumentSummary` (`lib/market-data/instrument-summary.ts`) for F&O-aware descriptions.
- **2026-03-30:** Initial `StatementAggregationService` (`buildForUser`), batch size `STATEMENT_BATCH_SIZE`, charge-like debit heuristic for manifest sums.
- **2026-03-30:** Split helpers — `statement-fetch-batch.ts` (`fetchAllOrderedRows`), `statement-where-builders.ts` (`executedOrdersStatementWhere`); ZIP export via `fflate` in `DataExportService.buildStatementZipUint8Array`.
- **2026-03-31:** Admin/console statement UIs avoid horizontal scroll: stacked cards below `lg`, desktop tables `table-auto` with wrapping; console statements table uses `lg` breakpoint and `overflow-x-hidden`.
- **2026-03-31:** `UserStatementDialog`: declare `mainTab` / `setMainTab` state (fixes ReferenceError on User Management statement open).
