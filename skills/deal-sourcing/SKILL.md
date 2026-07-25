---
name: deal-sourcing
description: Turn signals, news and filings into a qualified target shortlist mapped to the fund mandate.
purpose: sourcing
stages: [O1, O2]
agent: sourcing
tools: [list_pipeline, get_companies, get_company, get_market_intel, workiq_search, web_search]
---

## Method
1. Frame the hunting ground: sector/theme, size band, geography, and the mandate's hard limits (a mandate breach is *excluded, never scored*).
2. Pull live signals — `list_pipeline` (funnel), `get_companies` (entity-resolved targets), plus fresh catalysts (news/filings, and `workiq_search` for internal context). The **external-web** news scout provides public signals only.
3. De-duplicate to one target per real company (entity resolution across feeds); attach provenance.
4. Rank by thesis fit and a soft-signal score (receptivity, catalyst, ownership). Output a shortlist with a one-line thesis and the *why now* for each.

## Firm conventions
- Never present a target that breaches the LPA mandate.
- Prefer founder-owned / sponsor-exit / carve-out situations for proprietary angle — tune to your firm's origination playbook here.
