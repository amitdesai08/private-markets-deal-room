#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Deal Room accelerator — ONE unified deploy workflow (Windows / pwsh).
  Pick options interactively or pass flags; it auto-detects the identity path and
  runs the whole flow: subscription select -> (what-if) -> infra deploy -> Entra
  provisioning -> wire -> summary.

.DESCRIPTION
  Identity paths (auto-detected when -Identity ask):
    • provision         — auto-create the Entra apps now with your admin az login
                          (scripts/provision-entra.ps1) and wire them in a second pass.
    • deployment-script — create them INSIDE the Bicep deploy via a deploymentScript
                          (needs -ProvisioningIdentityId: a Graph-permissioned UAMI).
    • byo               — you already set the app IDs in your parameter file.
  Linux/macOS users: run ./scripts/deploy.sh (identical workflow).

.EXAMPLE
  ./scripts/deploy.ps1                          # fully interactive
.EXAMPLE
  ./scripts/deploy.ps1 -Mode full -Identity provision -EnvironmentName dev -Yes
#>
[CmdletBinding()]
param(
  [ValidateSet('demo', 'full', 'ask')][string]$Mode = 'ask',
  [ValidateSet('provision', 'deployment-script', 'byo', 'ask')][string]$Identity = 'ask',
  [string]$EnvironmentName = 'dev',
  [string]$Location = 'swedencentral',
  [string]$Subscription = '',
  [string]$ParamFile = '',
  [string]$ProvisioningIdentityId = '',
  [switch]$WhatIf,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tmpl = Join-Path $root 'infra/main.bicep'
if (-not $ParamFile) { $ParamFile = Join-Path $root 'infra/main.sample.bicepparam' }
$deployName = "dealhub-$EnvironmentName"

function Ask($msg, $default) { if ($Yes) { return $default }; $a = Read-Host "$msg [$default]"; if ([string]::IsNullOrWhiteSpace($a)) { return $default } return $a }

# 0) Login + subscription -----------------------------------------------------
if (-not (az account show 2>$null)) { az login | Out-Null }
if ($Subscription) { az account set --subscription $Subscription }
$acct = az account show -o json | ConvertFrom-Json
Write-Host "Subscription : $($acct.name)"
Write-Host "Tenant       : $($acct.tenantId)"

# 1) Mode ---------------------------------------------------------------------
if ($Mode -eq 'ask') {
  Write-Host "`nDeployment mode:"
  Write-Host "  [1] demo  — infra + seeded data, no identity (fastest)"
  Write-Host "  [2] full  — Teams SSO + per-user M365 docs + bot"
  $Mode = ((Ask 'Choose 1/2' '1') -eq '2') ? 'full' : 'demo'
}

# 2) Identity path (full only) — auto-detect when 'ask' -----------------------
if ($Mode -eq 'full' -and $Identity -eq 'ask') {
  $hasIds = Select-String -Path $ParamFile -Pattern "teamsTabClientId\s*=\s*'[0-9a-fA-F-]{10,}'" -Quiet -ErrorAction SilentlyContinue
  if ($ProvisioningIdentityId) { $Identity = 'deployment-script' }
  elseif ($hasIds) { $Identity = 'byo' }
  else {
    Write-Host "`nEntra app registrations:"
    Write-Host "  [1] provision          — auto-create now with your admin login (recommended)"
    Write-Host "  [2] deployment-script  — create inside the Bicep deploy (needs a Graph-permissioned UAMI)"
    Write-Host "  [3] byo                — app IDs already set in your parameter file"
    switch (Ask 'Choose 1/2/3' '1') { '2' { $Identity = 'deployment-script' } '3' { $Identity = 'byo' } default { $Identity = 'provision' } }
  }
}
if ($Mode -eq 'demo') { $Identity = 'none' }
Write-Host "`nMode = $Mode   Identity = $Identity`n"

function Invoke-Deploy([string[]]$Extra, [switch]$Preview) {
  $verb = $Preview ? 'what-if' : 'create'
  $cmd = @('deployment', 'sub', $verb, '--name', $deployName, '--location', $Location,
    '--template-file', $tmpl, '--parameters', $ParamFile, '--parameters', "environmentName=$EnvironmentName") + $Extra
  az @cmd
}

# 3) What-if (optional) -------------------------------------------------------
if ($WhatIf) {
  Invoke-Deploy @() -Preview
  if ((Ask 'Proceed with deploy? y/n' 'y') -ne 'y') { Write-Host 'Aborted.'; return }
}

# 4) Deploy infrastructure ----------------------------------------------------
$idParams = @()
if ($Identity -eq 'deployment-script') {
  if (-not $ProvisioningIdentityId) { throw 'deployment-script identity requires -ProvisioningIdentityId (a Graph-permissioned user-assigned identity).' }
  $idParams += @('deployIdentityProvisioning=true', "provisioningIdentityResourceId=$ProvisioningIdentityId")
}
Write-Host '== Deploying infrastructure ==' -ForegroundColor Cyan
Invoke-Deploy $idParams | Out-Null
$out = az deployment sub show --name $deployName --query properties.outputs -o json | ConvertFrom-Json
$teamsFqdn = $out.teamsAppFqdn.value
$orchFqdn = $out.orchestratorFqdn.value
Write-Host "Teams FQDN : $teamsFqdn"
Write-Host "Orch  FQDN : $orchFqdn"

# 5) Provision Entra (local script) + wire ------------------------------------
if ($Identity -eq 'provision') {
  Write-Host "`n== Provisioning Entra app registrations ==" -ForegroundColor Cyan
  $secrets = New-TemporaryFile
  $gen = Join-Path $root 'entra.generated.bicepparam'
  & (Join-Path $PSScriptRoot 'provision-entra.ps1') -EnvironmentName $EnvironmentName `
    -TeamsFqdn $teamsFqdn -OrchFqdn $orchFqdn -OutFile $gen -SecretsOutFile $secrets
  Write-Host "`n== Wiring identity into the platform ==" -ForegroundColor Cyan
  $secretArgs = Get-Content $secrets
  az deployment sub create --name $deployName --location $Location --template-file $tmpl `
    --parameters $ParamFile --parameters $gen --parameters "environmentName=$EnvironmentName" `
    --parameters $secretArgs | Out-Null
  Remove-Item $secrets -Force -ErrorAction SilentlyContinue
}

Write-Host "`n== Done ==" -ForegroundColor Green
Write-Host 'Next — build + roll the application images:'
Write-Host "  az acr build -r <acr> -t deal-room:v1     --file app/Dockerfile app"
Write-Host "  az acr build -r <acr> -t dealhub-teams:v1 --file teams-app/Dockerfile teams-app"
Write-Host "  az containerapp update -n ca-dealhub-orch-$EnvironmentName-swc  -g rg-dealhub-app-$EnvironmentName-swc --image <acr>/deal-room@<digest>"
Write-Host "  az containerapp update -n ca-dealhub-teams-$EnvironmentName-swc -g rg-dealhub-app-$EnvironmentName-swc --image <acr>/dealhub-teams@<digest>"
