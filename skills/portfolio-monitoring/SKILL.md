---
name: portfolio-monitoring
description: Monitor owned companies vs the underwriting plan and the fund vs its mandate; flag off-plan assets.
purpose: portfolio
stages: [V1]
agent: value-creation
tools: [get_portfolio, get_fund_overview, get_fund_value, get_returns, get_value_creation]
---

## Method
1. `get_portfolio` for each owned company: hold period, entry → current multiple, current **MOIC & IRR**, value-creation progress and an **on-track / watch / underperform** status.
2. For a flagged asset, drill into `get_value_creation` (KPIs vs plan) and `get_returns` to explain the variance and the corrective levers.
3. `get_fund_overview` / `get_fund_value` for fund-level **TVPI · DPI · RVPI**, gross & net **MOIC / IRR**, deployment and dry powder.
4. Check **concentration vs the LPA limits** (sector, single-position) — compliance by design.

## Firm conventions
- Be honest about underperformers — surface the watch/underperform list first.
- Everything ties to the underwriting plan and the mandate; flag any breach of concentration limits.
