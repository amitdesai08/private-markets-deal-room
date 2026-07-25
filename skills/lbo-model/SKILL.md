---
name: lbo-model
description: Build a leveraged-buyout model — sources & uses, debt schedule, exit and returns (IRR / MOIC).
purpose: modeling
stages: [D2, D3]
agent: modeling
tools: [get_deal, get_returns, get_market_intel, xlsx-author]
---

## Method
1. Pull the deal's key figures (`get_deal`) and the current returns case (`get_returns`).
2. **Sources & uses** at the entry multiple; size the debt tranches to the leverage test (e.g. Debt/EBITDA cap) and check covenant headroom.
3. Project the operating case (revenue, EBITDA, capex, working capital) and the **debt schedule** (cash sweep, mandatory amortisation).
4. Exit at an assumed multiple + year; compute **base / upside / downside IRR & MOIC** vs the hurdle (e.g. 20% / 2.0×). Identify the 2–3 value drivers the return is most sensitive to.
5. Stage the workbook (Summary · Sources & Uses · Operating case · Debt · Returns · Sensitivity) for human review — never present it as advice.

## Firm conventions
- State the hurdle and leverage limits up front; show the sensitivity, not a single point estimate.
- Tie every input to the deal record or a cited comp.
