---
name: dd-checklist
description: Build and drive the diligence plan across workstreams; surface red-flag risks by severity.
purpose: diligence
stages: [D1, D2]
agent: diligence
tools: [get_deal, get_deal_artifact, get_ic_readiness, get_risk_register, workiq_search_files, workiq_read_channel]
---

## Method
1. `get_deal` for the current record and `get_deal_artifact` (D1 plan) for scope.
2. Stand up the workstream lanes — **Commercial · Financial · Legal · Tax · Tech/AI · Operations · ESG** — each with an owner and key questions.
3. For each lane, list the evidence needed and pull what exists: the deal's data room (`workiq_search_files`), the deal channel discussion (`workiq_read_channel`), and prior findings.
4. Roll findings into `get_risk_register` by **severity × likelihood** (red/amber/green); flag the items that gate IC readiness.

## Firm conventions
- Each MD touches **their own lane only** — attribution is enforced.
- A red finding without a mitigation path is IC-blocking until resolved.
