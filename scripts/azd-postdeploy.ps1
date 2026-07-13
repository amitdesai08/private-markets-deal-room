#!/usr/bin/env pwsh
# azd postdeploy hook — provision the Foundry AGENTS into the deployed project once the
# app is live: the Deal Orchestrator, the News Scout, and the ten persona agents
# (analyst / partner / retail-md / ai-md / supply-md / principal / operating-partner /
# fund-cfo / legal-gc / ir-lp). Foundry itself (account, project, model deployments,
# Bing grounding) is provisioned by the Bicep; this hook creates the agents on top.
#
# Best-effort by design: it needs the azure-ai-projects Python SDK and Foundry
# data-plane access (the deploying identity). It skips with clear guidance when a
# prerequisite is missing, or when DEALROOM_AGENTS=false — so `azd up` never fails
# for a data-only demo.
$ErrorActionPreference = 'Continue'

if ($env:DEALROOM_AGENTS -eq 'false') {
  Write-Host '[azd] DEALROOM_AGENTS=false — skipping Foundry agent provisioning.'
  exit 0
}

$here = $PSScriptRoot
$repo = Split-Path $here -Parent
$scripts = Join-Path $repo 'app/scripts'
$vals = azd env get-values
function Val($n) { ($vals | Select-String -Pattern "(?i)^$n=""?(.*?)""?\s*$").Matches.Groups[1].Value }

$foundry = Val 'FOUNDRY_PROJECT_ENDPOINT'; if (-not $foundry) { $foundry = Val 'foundryProjectEndpoint' }
$orchFqdn = Val 'orchestratorFqdn'
$bingConn = Val 'bingConnectionId'
$model = if ($env:DEAL_AGENT_MODEL) { $env:DEAL_AGENT_MODEL } else { 'gpt-5-mini' }

if (-not $foundry) {
  Write-Host '[azd] No FOUNDRY_PROJECT_ENDPOINT output — running in demo mode without Foundry; skipping agents.'
  exit 0
}

# Resolve Python + the SDK (install on demand).
$py = (Get-Command python -ErrorAction SilentlyContinue); if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) {
  Write-Warning '[azd] Python 3.10+ not found. Install it, then run: python app/scripts/create_persona_agents.py'
  exit 0
}
& $py.Source -c 'import azure.ai.projects' 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host '[azd] Installing azure-ai-projects + azure-identity…'
  & $py.Source -m pip install --quiet --disable-pip-version-check azure-ai-projects azure-identity 2>$null
}

# The persona agents call the app's read-only MCP surface (/mcp-ro). Read its key from
# the deployed orchestrator secret (tagged azd-service-name=orchestrator).
$mcpKey = $env:MCP_READONLY_KEY
if (-not $mcpKey) {
  try {
    $orch = az containerapp list --query "[?tags.\""azd-service-name\""=='orchestrator'] | [0].{name:name,rg:resourceGroup}" -o json 2>$null | ConvertFrom-Json
    if ($orch) { $mcpKey = az containerapp secret show -n $orch.name -g $orch.rg --secret-name mcp-readonly-key --query value -o tsv 2>$null }
  } catch { }
}
$mcpUrl = if ($orchFqdn) { "https://$orchFqdn/mcp-ro" } else { '' }

$env:FOUNDRY_PROJECT_ENDPOINT = $foundry
$env:DEAL_AGENT_MODEL = $model
$env:NEWS_AGENT_MODEL = $model
if ($mcpUrl) { $env:MCP_RO_URL = $mcpUrl }
if ($mcpKey) { $env:MCP_READONLY_KEY = $mcpKey }

Write-Host "[azd] Provisioning Foundry agents on $foundry …"

# 1) Deal Orchestrator agent.
try { & $py.Source (Join-Path $scripts 'create_deal_agent.py'); Write-Host '[azd]   ✓ Deal Orchestrator agent' } catch { Write-Warning "[azd]   ✗ Deal agent: $($_.Exception.Message)" }

# 2) News Scout (needs the Bing grounding connection).
if ($bingConn) {
  $env:BING_PROJECT_CONNECTION_ID = $bingConn
  try { & $py.Source (Join-Path $scripts 'create_news_agent.py'); Write-Host '[azd]   ✓ News Scout agent' } catch { Write-Warning "[azd]   ✗ News agent: $($_.Exception.Message)" }
} else {
  Write-Host '[azd]   – News Scout skipped (no bingConnectionId).'
}

# 3) The persona agents (needs the MCP read-only key).
if ($mcpKey) {
  try { & $py.Source (Join-Path $scripts 'create_persona_agents.py'); Write-Host '[azd]   ✓ Persona agents (10)' } catch { Write-Warning "[azd]   ✗ Persona agents: $($_.Exception.Message)" }
} else {
  Write-Warning '[azd]   – Persona agents skipped (no MCP_READONLY_KEY). Set it and run app/scripts/create_persona_agents.py.'
}

Write-Host '[azd] Foundry agent provisioning complete (see warnings above for any that were skipped).'
