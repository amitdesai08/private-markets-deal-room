#!/usr/bin/env sh
# azd postdeploy hook (POSIX) — provision the Foundry AGENTS into the deployed project:
# the Deal Orchestrator, the News Scout, and the ten persona agents. Foundry itself
# (account, project, models, Bing grounding) is provisioned by the Bicep; this creates
# the agents on top. Best-effort: needs the azure-ai-projects Python SDK + Foundry
# data-plane access; skips with guidance when a prerequisite is missing or when
# DEALROOM_AGENTS=false.
set -u

if [ "${DEALROOM_AGENTS:-}" = "false" ]; then
  echo "[azd] DEALROOM_AGENTS=false — skipping Foundry agent provisioning."
  exit 0
fi

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"
scripts="$repo/app/scripts"

val() { azd env get-values | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -n1; }

foundry="$(val FOUNDRY_PROJECT_ENDPOINT)"; [ -z "$foundry" ] && foundry="$(val foundryProjectEndpoint)"
orch_fqdn="$(val orchestratorFqdn)"
bing_conn="$(val bingConnectionId)"
model="${DEAL_AGENT_MODEL:-gpt-5-mini}"

if [ -z "$foundry" ]; then
  echo "[azd] No FOUNDRY_PROJECT_ENDPOINT output — demo mode without Foundry; skipping agents."
  exit 0
fi

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "[azd] Python 3.10+ not found. Install it, then run: python app/scripts/create_persona_agents.py" >&2
  exit 0
fi
if ! "$PY" -c 'import azure.ai.projects' >/dev/null 2>&1; then
  echo "[azd] Installing azure-ai-projects + azure-identity…"
  "$PY" -m pip install --quiet --disable-pip-version-check azure-ai-projects azure-identity >/dev/null 2>&1 || true
fi

# MCP read-only key from the deployed orchestrator secret (tagged azd-service-name=orchestrator).
mcp_key="${MCP_READONLY_KEY:-}"
if [ -z "$mcp_key" ]; then
  orch_name="$(az containerapp list --query "[?tags.\"azd-service-name\"=='orchestrator'] | [0].name" -o tsv 2>/dev/null || true)"
  orch_rg="$(az containerapp list --query "[?tags.\"azd-service-name\"=='orchestrator'] | [0].resourceGroup" -o tsv 2>/dev/null || true)"
  if [ -n "$orch_name" ] && [ -n "$orch_rg" ]; then
    mcp_key="$(az containerapp secret show -n "$orch_name" -g "$orch_rg" --secret-name mcp-readonly-key --query value -o tsv 2>/dev/null || true)"
  fi
fi

export FOUNDRY_PROJECT_ENDPOINT="$foundry"
export DEAL_AGENT_MODEL="$model"
export NEWS_AGENT_MODEL="$model"
[ -n "$orch_fqdn" ] && export MCP_RO_URL="https://$orch_fqdn/mcp-ro"
[ -n "$mcp_key" ] && export MCP_READONLY_KEY="$mcp_key"

echo "[azd] Provisioning Foundry agents on $foundry …"

"$PY" "$scripts/create_deal_agent.py" && echo "[azd]   OK Deal Orchestrator agent" || echo "[azd]   FAILED Deal agent" >&2

if [ -n "$bing_conn" ]; then
  export BING_PROJECT_CONNECTION_ID="$bing_conn"
  "$PY" "$scripts/create_news_agent.py" && echo "[azd]   OK News Scout agent" || echo "[azd]   FAILED News agent" >&2
else
  echo "[azd]   - News Scout skipped (no bingConnectionId)."
fi

if [ -n "$mcp_key" ]; then
  "$PY" "$scripts/create_persona_agents.py" && echo "[azd]   OK Persona agents (10)" || echo "[azd]   FAILED Persona agents" >&2
else
  echo "[azd]   - Persona agents skipped (no MCP_READONLY_KEY). Set it and run app/scripts/create_persona_agents.py." >&2
fi

echo "[azd] Foundry agent provisioning complete."
