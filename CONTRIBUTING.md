# Contributing

Thanks for improving The Deal Room. This guide covers local setup, the project
layout, how to validate changes, and the conventions we follow.

## Project layout

| Path | What it is |
|---|---|
| `app/` | The **orchestrator** — Node/Express **API / data / MCP** service (no web client). Agents, tools, store seam, artifact builders, data providers. |
| `teams-app/` | The **console** — a thin Teams tab + bot that is also the standalone **web console**; proxies all data to the orchestrator over `/api`. |
| `infra/` | **Bicep** (subscription-scoped) + `azure.yaml` (azd) + param files. |
| `scripts/` | Deploy orchestration, Entra provisioning, and the azd hooks. |
| `app/scripts/` | Foundry **agent provisioning** (`create_deal_agent.py`, `create_news_agent.py`, `create_persona_agents.py`) and the `create_agent.py` template. |

## Prerequisites

- **Node.js ≥ 20**
- **Azure CLI** ≥ 2.60 + **Bicep** (`az bicep install`), and **azd** for `azd up`
- **Python 3.10+** (only to provision Foundry agents)
- A local `.npmrc` pointing at the public registry if your org proxies npm

## Run locally

```powershell
# Orchestrator (API) — demo mode with seeded AI when no Foundry endpoint is set
cd app
npm install
node server.js            # http://localhost:8080/api

# Console (Teams tab + web console) in a second terminal
cd teams-app
npm install
npm run dev               # set SHARED_BACKEND_URL to the orchestrator to proxy /api
```

The app runs in **demo mode** out of the box (seeded, deterministic AI). Set
`AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_DEPLOYMENT` for live inference, and
`DEALROOM_STORE=blob|cosmos` for a durable store (default: in-memory locally).

## Validate before you push

Run the checks that mirror CI:

```powershell
# Orchestrator + scripts — syntax
node --check app/server.js
node --check app/lib/<changed-file>.js
python -c "import ast; ast.parse(open('app/scripts/<changed>.py',encoding='utf-8').read())"

# Console — typecheck
cd teams-app/tab; npx tsc --noEmit

# Infra — compile
cd infra; az bicep build --file main.bicep --stdout > $null
az bicep build-params --file main.sample.bicepparam --stdout > $null
```

## Extending the platform

- **New agent** — copy `app/scripts/create_agent.py`, edit the name + instructions, run it. To surface it as an RBAC persona, add its id to `personaPolicy.js`, `personaAgent.js`, `userPolicy.js`, and the tab's `PERSONA_META`/`PERSONA_ORDER`.
- **New read tool** — add it to `app/lib/mcp/dealServer.js`; agents discover it at runtime (no re-provisioning).
- **New lifecycle stage / artifact** — extend `app/data/flow.js` and add a builder in `app/lib/diligence.js`.
- **Persistence** — everything goes through the `app/lib/repo` seam; the driver is `DEALROOM_STORE`.

## Conventions

- **Branches:** feature branches off `main` (e.g. `feat/…`, `fix/…`, `docs/…`).
- **Commits:** Conventional-Commits style — `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore(packaging): …`.
- **Keep it minimal:** change what's asked; don't add unrelated refactors, comments, or abstractions.
- **UI vs data:** the tab is the *same build* as the web console — don't fork it.

## Guardrails (must-follow for a public accelerator)

- **Never commit secrets** or **tenant-specific identifiers** — no tenant/subscription/app IDs, resource suffixes, endpoints, or object IDs. Use `<placeholders>` or env vars. Run the leak scan before pushing:
  ```powershell
  git grep -nE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\.azurecontainerapps\.io|datawarehouse\.fabric"
  ```
- **Don't track generated files** — compiled Bicep (`infra/main*.json` except `main.parameters.json`), `entra.generated.bicepparam`, `*.env`, build outputs are git-ignored.
- **Managed identity first** — prefer RBAC over keys; if a secret is unavoidable, wire it as a Container App secret / deploy-time parameter, never a literal.

## Pull requests

Keep PRs focused, describe the change and how you validated it, and confirm the
leak scan + the validation checks above pass. New user-facing features should be
reflected in the `README.md`.
