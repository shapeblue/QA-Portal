# Scraper is the system of record; the API is a thin read-only consumer

The QA Portal has two backend deploy units sharing one MySQL database: the scraper scripts
(`scripts/`) and the Express API (`server/`). We decided the scraper is the sole writer and
the sole owner of the schema — including all materialized summary tables (e.g.
`flaky_tests_summary`, `test_failures_summary`). The API performs **no** data writes and
**no** heavy aggregation: any expensive cross-table computation is precomputed by the
scraper into summary tables, and the API only reads flat rows. This is acceptable because
all data is already ≥30 minutes stale (the scraper runs on a 30-minute cron) and no view
requires fresher data.

Because the two units deploy separately, the API does not assume a schema contract: it
degrades gracefully when an expected table or column is missing (returns empty rather than
crashing) **but logs a warning naming the missing source**, so schema drift is visible in
logs instead of surfacing only as silently-absent UI data.

## Consequences

- New features are built **scraper-first**: add the scrape + summary table, then read it.
- The API stays simple and fast (thin reader), and a lagging scraper deploy never takes the
  portal down.
- The cost is no compile-time/boot-time schema contract — drift is caught via logs and
  monitoring, not a hard failure. We accepted this trade for looser coupling between the two
  deploy units.
