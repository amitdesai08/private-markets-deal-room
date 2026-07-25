---
name: ic-memo
description: Draft the Investment Committee memo and committee deck; audit every figure to a source.
purpose: ic-memo
stages: [D3, D4]
agent: ic-memo
tools: [get_deal, get_ic_readiness, get_returns, get_risk_register, get_market_intel, get_citation_audit, pptx-author]
---

## Method
1. `get_ic_readiness` for the decision board — required artifacts, blocking workstreams, changed assumptions, unresolved risks, the exact IC ask and conditions, and the READY / CONDITIONAL / NOT-READY verdict.
2. Assemble the memo: thesis · market & competitive position · commercial/financial/legal diligence findings · **returns** (`get_returns`) · **risks** (`get_risk_register`) · comparables & precedents (`get_market_intel`) · the recommendation and conditions to approve.
3. Run `get_citation_audit` — every numeric claim must map to a source fact or cited document; flag and fix unsourced figures before finalising.
4. Produce the committee deck (`pptx-author`) to the firm template.

## Firm conventions
- The memo is decision-grade and honest: lead with conviction, then the risks and the conditions.
- Do not finalise with a non-clean citation audit. Output is staged for partner sign-off — the agent never approves.
