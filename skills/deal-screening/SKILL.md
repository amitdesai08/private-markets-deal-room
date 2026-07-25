---
name: deal-screening
description: Screen one target against the fund mandate, comparables and unit economics; recommend advance / pass / park.
purpose: screening
stages: [O2, O3, O4]
agent: screening
tools: [get_candidate, get_candidate_artifact, get_market_intel, comps-analysis, unit-economics]
---

## Method
1. `get_candidate` for the target's financials, mandate-fit score and stage.
2. Apply the three-tier screen: **Mandate (GATE)** — binding LPA limits; **Theme (GUIDE)** — the partner's hunting ground; **Screen (RANK)** — scored criteria (growth, margin, moat, multiple).
3. Cross-check with `get_market_intel` comparables and the `comps-analysis` / `unit-economics` skills.
4. Recommend **advance / pass / park** with a cited one-paragraph rationale and the 2–3 diligence questions that would change the answer.

## Firm conventions
- A mandate breach is an automatic pass (excluded, not low-scored).
- State conviction explicitly and what evidence would move it.
