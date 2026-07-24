# SKILLS.md — the Deal Room agent-skill framework

A **skill** is a unit of domain expertise — a repeatable *method* an agent draws on when
it's relevant to the task: how to build an LBO, how to structure an IC memo, how to run a
KYC check. Skills are **markdown**, versioned in the repo, and composable — the same skill
can back several agents. This file is the framework so a customer can **read, tune, and
extend** the agents to how their firm actually works.

> Modelled on the [Claude for Financial Services](https://github.com/anthropics/financial-services)
> skill/agent framework (Apache-2.0). See the agent roster in
> [docs/AGENTS.md](docs/AGENTS.md) and the backlog item H in
> [docs/ACTION-ITEMS.md](docs/ACTION-ITEMS.md).

## How it fits together

| Layer | What it is | Where |
|---|---|---|
| **Orchestrator** | The Deal Room Analyst — routes a request to the right task agent, threads the caller's **identity**, composes the answer | [dealAgent.js](app/lib/dealAgent.js) |
| **Agents** | Purpose-based task agents (Sourcing, Screening, Diligence, Modeling, IC-Memo, Portfolio-Monitoring). Each owns a workflow and bundles the skills it needs | Foundry (`app/scripts/create_*_agent.py`) |
| **Skills** | Domain methods + conventions the agents apply automatically | `skills/<skill>/SKILL.md` (this framework) |
| **Commands** | Explicit slash-actions a user triggers (`/comps`, `/dcf`, `/ic-memo`) | mapped from [flow.js](app/data/flow.js) `skills` |
| **Tools / connectors** | Governed data access — deal store, Work IQ (M365), provider MCPs | [dealTools.js](app/lib/dealTools.js) · [workiq.js](app/lib/mcp/workiq.js) · [connectors.js](app/lib/connectors.js) |

Everything is file-based markdown/JSON — no build step. Rebuilt agents are provisioned in
**Foundry** and integrate with **Cowork** for Word / Excel / PowerPoint authoring.

## Skill format

Each skill is a folder `skills/<slug>/SKILL.md` with YAML frontmatter and a body:

```markdown
---
name: lbo-model
description: Build a leveraged-buyout model — sources & uses, debt schedule, returns.
purpose: modeling          # sourcing | screening | diligence | modeling | ic-memo | monitoring
stages: [D2, D3]           # lifecycle steps where it applies
tools: [get_deal, get_returns, get_market_intel]
---

## Method
1. Pull the deal's key figures (`get_deal`) and comparable transactions (`get_market_intel`).
2. Build sources & uses at the entry multiple; size the debt tranches to the leverage test.
3. Project the debt schedule and exit; compute base / upside / downside IRR & MOIC vs the hurdle.
4. Stage the workbook for human review — never present it as advice.

## Firm conventions
<drop your leverage tests, hurdle rates, and formatting standards here>
```

## The Deal Room skills

Grouped by **purpose** (the direction the agents are moving toward), mapping to today's
per-stage `skills` in [flow.js](app/data/flow.js) and persona `actions` in
[personas.js](app/data/personas.js):

| Purpose | Skills | Backs (persona lens) |
|---|---|---|
| **Sourcing** | `signal-triage`, `market-map`, `entity-resolution` | Analyst · News Scout |
| **Screening** | `deal-screening`, `mandate-fit`, `comps-analysis` | Analyst · Principal |
| **Diligence** | `diligence-planner`, `commercial-dd`, `tech-ai-dd`, `operations-dd`, `red-flag-report` | Sector MDs |
| **Modeling** | `lbo-model`, `dcf`, `three-statement`, `returns-sensitivity`, `excel-audit` | Fund CFO |
| **IC-Memo** | `ic-memo`, `citation-audit`, `deck-qc` | Partner · Principal |
| **Portfolio-Monitoring** | `value-creation-plan`, `100-day-plan`, `kpi-vs-plan`, `lp-reporting`, `concentration-check` | Operating Partner · IR |
| **Execution** | `spa-review`, `kyc-aml`, `funds-flow` | Legal / GC |

Slash-command shorthands (customer-facing): `/comps` · `/dcf` · `/lbo` · `/ic-memo` ·
`/diligence` · `/ppt-template`.

## Governance — skills inherit the data-protection model

A skill never widens access. Every read a skill makes goes through the **identity-gated**
tool dispatch, so an agent only ever works with data the *requesting user* may see
(`get_deal` refuses/redacts deals out of the caller's need-to-know), and Work IQ reads run
as the signed-in user. Skills **draft work product for human sign-off** — they do not execute
transactions, post to a ledger, or approve. See
[docs/DATA-SOVEREIGNTY.md](docs/DATA-SOVEREIGNTY.md) and the Governance section of
[docs/AGENTS.md](docs/AGENTS.md).

## Extend it (make it yours)

1. **Add a skill** — create `skills/<slug>/SKILL.md` with the frontmatter above, drop in your
   firm's method + conventions, and list the `tools` it uses.
2. **Attach it to an agent** — reference the skill in the agent's Foundry instructions
   (`app/scripts/create_*_agent.py`) or bundle it under the agent when you adopt the
   purpose-based topology.
3. **Add a connector** — point a new provider MCP at your data in
   [connectors.js](app/lib/connectors.js) (same pattern as Morningstar / LSEG / Work IQ).
4. **Bring your templates** — a `deck-qc` / `ppt-template` skill teaches the agents your
   branded Word / Excel / PowerPoint layouts (authored via Cowork).
5. **Keep the guardrails** — new skills and connectors are **internal-data** by default; route
   them through the sovereignty guard so they honour the internal/external boundary and
   need-to-know.
