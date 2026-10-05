# The Deal Room

> A governed AI deal team for private markets, built for Microsoft Teams and the web.

The Deal Room carries an investment from sourcing through diligence, Investment Committee,
ownership, and exit. One permission-scoped record grounds every dashboard, agent, document,
and approved action.

![The Deal Room console](teams-app/docs/teams-dashboard.png)

## What is included

- A Teams tab and standalone web console over one backend and one deal record.
- Purpose agents for sourcing, screening, diligence, modelling, IC memo, and value creation.
- Foundry IQ, Fabric IQ, Work IQ, and Web IQ behind a server-owned policy boundary.
- Visible routing, handoffs, peer review, sources, and synthesis in **Agent activity**.
- Deal-level need-to-know access, confidential-deal hiding, approval gates, and audit history.

## Architecture

![Governed agent and IQ orchestration](docs/diagrams/agent-iq-orchestration.svg)

The hosted router classifies the permitted evidence path without reading source data. The Node
orchestrator applies identity and deal scope, invokes at most two purpose specialists, and owns
all capability and A2A handoffs.

| IQ path | Evidence | Boundary |
|---|---|---|
| **Foundry IQ** | Approved firm knowledge through Azure AI Search | Internal |
| **Fabric IQ** | OneLake, semantic model, Ontology, and GraphModel | Internal |
| **Work IQ** | User-scoped Microsoft 365 context | Internal, delegated user |
| **Web IQ** | Native Foundry web search | Public only |

Mixed internal and public-web requests are refused before either source is called. Agent writes
remain proposals until an authorized person approves them.

## Run locally

```powershell
cd app
npm install
npm test
npm run dev
```

Use `azd up` for Azure deployment. See [Deploy](docs/DEPLOY.md) for prerequisites and tenant
configuration.

## Read next

- [Architecture](docs/ARCHITECTURE.md): runtime, trust boundaries, and Azure services.
- [Demo Center](docs/DEMO-CENTER.md): recordings and presenter paths.
- [Documentation](docs/README.md): deployment, access, security, and engineering references.

[Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Agent skills](SKILLS.md)