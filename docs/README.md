# Documentation

Choose the shortest path for the job at hand.

## Understand the product

| Guide | Covers |
|---|---|
| [Architecture](ARCHITECTURE.md) | Runtime flow, Four-IQ orchestration, Azure services, and trust boundaries |
| [Inside a deal](DEAL-STAGES.md) | Investment lifecycle, gates, and decision artifacts |
| [Access model](ACCESS-MODEL.md) | Roles, need-to-know, and confidential deals |
| [Demo Center](DEMO-CENTER.md) | Recordings, walkthroughs, and presenter runbooks |

## Build and operate

| Guide | Covers |
|---|---|
| [Deploy](DEPLOY.md) | Azure prerequisites, configuration, and deployment |
| [Runtime internals](HOW-IT-WORKS.md) | Services, orchestration, persistence, and extension points |
| [Data integration](integration/DATA-INTEGRATION.md) | Microsoft IQ, market data, and systems of record |
| [Security and compliance](SECURITY-COMPLIANCE.md) | Controls, sovereignty, and shared responsibility |

Detailed material is grouped by purpose:

- [`integration/`](integration/) for agents, connectors, and external systems.
- [`operations/`](operations/) for deployment checks and platform operations.
- [`security/`](security/) for buyer review and data-sovereignty detail.
- [`demos/`](demos/) for scripts and generated demo assets.
- [`reference/`](reference/) for glossary and internal working notes.

Component setup lives with the component: [backend](../app/README.md),
[Teams app](../teams-app/README.md), and [infrastructure](../infra/README.md).