# Documentation

Start at the top. Each section below goes one level deeper than the one above it.

## Start here

| Doc | What it answers |
|---|---|
| [**Demo Center**](DEMO-CENTER.md) | Videos to download, an interactive walkthrough, and the scripts to run a live demo. |
| [**Architecture**](ARCHITECTURE.md) | What the system is, drawn on one page. |
| [**How it works**](HOW-IT-WORKS.md) | The internals — surfaces, identity seam, agents, persistence, repo layout, run locally. |
| [**Inside a deal**](DEAL-STAGES.md) | A tab-by-tab tour of a deal, the workspace and the data room. |
| [**Access model**](ACCESS-MODEL.md) | Two-tier RBAC, need-to-know, confidential deals, MNPI barriers. |
| [**Personas**](PERSONAS.md) | Who uses the Deal Room and what each of them needs. |
| [**Security & compliance**](SECURITY-COMPLIANCE.md) | Control matrix, data sovereignty, shared responsibility — for a procurement or infosec review. |
| [**Deploy guide**](DEPLOY.md) | Prerequisites, `azd up`, identity paths and how to extend it. |

## Going deeper

| Folder | What's in it |
|---|---|
| [`demos/`](demos/) | The scripts behind the Demo Center: [walkthrough](demos/DEMO-WALKTHROUGH.md), [runbook](demos/DEMO-RUNBOOK.md), [lightning](demos/DEMO-LIGHTNING.md), and the [recordings index](demos/RECORDINGS.md). |
| [`integration/`](integration/) | [Data integration](integration/DATA-INTEGRATION.md) (market data & systems of record) · [Agents & skills](integration/AGENTS.md) — the WorkIQ / agentic-workflow reference. |
| [`security/`](security/) | The engineering-level detail behind [Security & compliance](SECURITY-COMPLIANCE.md): [data sovereignty](security/DATA-SOVEREIGNTY.md) and the full [buyer appendix](security/buyer-security-compliance.md). |
| [`operations/`](operations/) | [Deployment checklist](operations/DEPLOYMENT-CHECKLIST.md) · [Operations plan](operations/OPERATIONS-PLAN.md) (networking, power control, cost). |
| [`diagrams/`](diagrams/) | The draw.io source for every architecture drawing, and the SVGs generated from it. |
| [`reference/`](reference/) | [Explainer & glossary](reference/EXPLAINER.md) for builders new to PE · [internal roadmap](reference/ACTION-ITEMS.md) (not customer-facing). |

## Elsewhere in the repo

[Infrastructure runbook](../infra/README.md) · [App service](../app/README.md) ·
[Teams tier](../teams-app/README.md) · [Agent skills](../SKILLS.md) ·
[Security policy](../SECURITY.md) · [Contributing](../CONTRIBUTING.md)

