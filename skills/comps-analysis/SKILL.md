---
name: comps-analysis
description: Build trading and transaction comparables to frame valuation and the entry multiple.
purpose: screening
stages: [O3, D2, D3]
agent: modeling
tools: [get_deal, get_market_intel, get_companies]
---

## Method
1. Define the peer set: same sub-sector, size band and business model. Justify each inclusion/exclusion.
2. **Trading comps** — EV/EBITDA, EV/Revenue, P/E on the public peers; note growth and margin to explain the spread.
3. **Transaction comps** — precedent deals from `get_market_intel` (entry multiples, deal type, control premium).
4. Triangulate an implied valuation range for the target; state where our entry multiple sits vs the set and *why* (quality, growth, synergies).

## Firm conventions
- Every multiple cites its source (SEC filing / market-intel record) — no un-sourced figures.
- Prefer as-filed figures over modelled ones; flag any normalisation.
