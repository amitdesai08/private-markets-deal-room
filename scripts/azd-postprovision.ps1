#!/usr/bin/env pwsh
# azd postprovision hook — FULL mode only: provision the Entra app registrations and
# persist their IDs/secrets to the azd environment so the next `azd up` wires them into
# the platform. DEMO mode (default) skips this (no identity, no admin needed).
$ErrorActionPreference = 'Stop'
$mode = if ($env:DEALROOM_MODE) { $env:DEALROOM_MODE } else { 'demo' }
if ($mode -ne 'full') {
  Write-Host "[azd] DEALROOM_MODE=$mode — skipping Entra provisioning (demo mode)."
  Write-Host "[azd] Enable Teams SSO / M365 / bot with:  azd env set DEALROOM_MODE full  &&  azd up"
  exit 0
}
$here = $PSScriptRoot
$repo = Split-Path $here -Parent
$vals = azd env get-values
function Val($n) { ($vals | Select-String -Pattern "(?i)^$n=""?(.*?)""?\s*$").Matches.Groups[1].Value }
$teamsFqdn = Val 'teamsAppFqdn'
$orchFqdn = Val 'orchestratorFqdn'
$envName = if ($env:AZURE_ENV_NAME) { $env:AZURE_ENV_NAME } else { 'dev' }

Write-Host "[azd] Provisioning Entra app registrations (full mode)…"
$secrets = New-TemporaryFile
$gen = Join-Path $repo 'entra.generated.bicepparam'
& (Join-Path $here 'provision-entra.ps1') -EnvironmentName $envName -TeamsFqdn $teamsFqdn -OrchFqdn $orchFqdn -OutFile $gen -SecretsOutFile $secrets

$ids = Get-Content $gen
function P($n) { ($ids | Select-String -Pattern "param $n = '(.*)'").Matches.Groups[1].Value }
azd env set TEAMS_TAB_CLIENT_ID (P 'teamsTabClientId')
azd env set M365_CLIENT_ID (P 'm365ClientId')
azd env set BOT_APP_ID (P 'botAppId')
azd env set ENTRA_TENANT_ID (P 'entraTenantId')
azd env set M365_TENANT_ID (P 'm365TenantId')
azd env set MCP_AUDIENCE (P 'mcpAudience')
foreach ($line in (Get-Content $secrets)) {
  $k, $v = $line -split '=', 2
  switch ($k) {
    'teamsTabClientSecret' { azd env set TEAMS_TAB_CLIENT_SECRET $v }
    'm365ClientSecret' { azd env set M365_CLIENT_SECRET $v }
    'botAppPassword' { azd env set BOT_APP_PASSWORD $v }
  }
}
Remove-Item $secrets -Force -ErrorAction SilentlyContinue
Write-Host "[azd] Entra apps provisioned and saved to the azd environment."
Write-Host "[azd] Run 'azd up' once more to wire the identity (Teams SSO / M365 / bot) into the platform."
