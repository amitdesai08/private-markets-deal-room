# Seed data archive

Snapshot of all originally-hard-coded demo/seed data from `app/data/*.js`,
exported to JSON so it is retained and retrievable after the app migrates to a
real datastore (production Phase 1).

- `export-seed.mjs` — the one-off exporter (`node archive/export-seed.mjs`).
- `seed/*.json` — one file per data module; `seed/_manifest.json` lists exports.

This is fabricated demo data (fake companies, news, filings, Morningstar
ratings, analyst research, CxO signals). It is **not** production data. It is
kept for reference and as an optional load into the datastore during the
Phase 1 repository migration (`p1-repository`).

The snapshot covers the five original seed deals. `app/data/deals.js` has since
grown to nineteen (`seedDeals` + `demoStageDeals`), so this is a record of where
the data started rather than a mirror of what the app serves today.
