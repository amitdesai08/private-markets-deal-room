#Requires -Version 7
<#
.SYNOPSIS
  Power the LEGACY "dealroom" resources (the old, pre-refactor resource groups) off/on
  for cost. Fully reversible — nothing is deleted, so there is no data loss.

.DESCRIPTION
  Discovers and suspends / resumes ONLY the safely-pausable legacy compute:
    * Microsoft Fabric capacity   in the data RG            (suspend / resume)
    * Container Apps              in the app RG             (stop / start)
    * Function App(s)             in the app RG             (stop / start)

  NOT touched (data-bearing / fixed-cost — reduce those only by deletion, out of scope):
    Cosmos (serverless, ~$0 idle, holds old data), Storage, Key Vault, Foundry,
    Service Bus, Event Grid, APIM, AI Search, Log Analytics, App Insights.

  Data safety: pausing Fabric preserves the OneLake lakehouse; stopping apps is
  stateless. A point-in-time export of the lakehouse market-intel is also kept in
  app/data/fabric-cache.json (committed) and, locally, backups/fabric-lakehouse-*.json.

.EXAMPLE
  ./scripts/legacy-power.ps1 -Action status
.EXAMPLE
  ./scripts/legacy-power.ps1 -Action suspend -Yes
.EXAMPLE
  ./scripts/legacy-power.ps1 -Action resume -Yes
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('status', 'suspend', 'resume')][string]$Action,
  [string]$DataResourceGroup = 'rg-deal-room-data',
  [string]$AppResourceGroup = 'rg-dealroom-dev-swc',
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'

# ---- discover the legacy resources (no hard-coded instance names) ----
$fabricId = az resource list -g $DataResourceGroup --resource-type Microsoft.Fabric/capacities --query "[0].id" -o tsv 2>$null
$caNames = @(az containerapp list -g $AppResourceGroup --query "[].name" -o tsv 2>$null)
$funcNames = @(az functionapp list -g $AppResourceGroup --query "[].name" -o tsv 2>$null)

function Get-FabricState { if ($fabricId) { az resource show --ids $fabricId --query 'properties.state' -o tsv 2>$null } }
# Fabric suspend/resume are ARM resource actions (no `az` command on older CLIs).
function Invoke-FabricAction($act) {
  if (-not $fabricId) { Write-Warning "No Fabric capacity found in $DataResourceGroup"; return }
  az rest --method post --url ("https://management.azure.com{0}/{1}?api-version=2023-11-01" -f $fabricId, $act) --only-show-errors 2>$null | Out-Null
}
function Get-CaState($n) { az containerapp show -n $n -g $AppResourceGroup --query 'properties.runningStatus' -o tsv 2>$null }
# Start/stop a container app via ARM (works on any az CLI version).
function Invoke-CaPower($n, $act) {
  $id = az containerapp show -n $n -g $AppResourceGroup --query id -o tsv 2>$null
  if ($id) { az rest --method post --url ("https://management.azure.com{0}/{1}?api-version=2024-03-01" -f $id, $act) --only-show-errors 2>$null | Out-Null }
}
function Get-FuncState($n) { az resource show -g $AppResourceGroup -n $n --resource-type Microsoft.Web/sites --query 'properties.state' -o tsv 2>$null }

function Show-Status {
  Write-Output ("Fabric   {0,-32} : {1}" -f (($fabricId -split '/')[-1]), (Get-FabricState))
  foreach ($c in $caNames) { Write-Output ("CApp     {0,-32} : {1}" -f $c, (Get-CaState $c)) }
  foreach ($f in $funcNames) { Write-Output ("Func     {0,-32} : {1}" -f $f, (Get-FuncState $f)) }
}

if ($Action -eq 'status') { Show-Status; return }

if (-not $Yes) {
  $ans = Read-Host "About to $Action the LEGACY dealroom stack (Fabric + $($caNames.Count) container app(s) + $($funcNames.Count) function app(s)). Reversible, no data loss. Continue? [y/N]"
  if ($ans -ne 'y') { Write-Output 'aborted'; return }
}

if ($Action -eq 'suspend') {
  Write-Output 'suspending Fabric capacity ...'; Invoke-FabricAction 'suspend'
  foreach ($c in $caNames) { Write-Output "stopping container app $c ..."; Invoke-CaPower $c 'stop' }
  foreach ($f in $funcNames) { Write-Output "stopping function app $f ..."; az functionapp stop -n $f -g $AppResourceGroup --only-show-errors 2>$null | Out-Null }
  Write-Output 'Legacy stack suspended. Resume with:  ./scripts/legacy-power.ps1 -Action resume -Yes'
}
else {
  Write-Output 'resuming Fabric capacity ...'; Invoke-FabricAction 'resume'
  foreach ($c in $caNames) { Write-Output "starting container app $c ..."; Invoke-CaPower $c 'start' }
  foreach ($f in $funcNames) { Write-Output "starting function app $f ..."; az functionapp start -n $f -g $AppResourceGroup --only-show-errors 2>$null | Out-Null }
  Write-Output 'Legacy stack resumed.'
}

Start-Sleep -Seconds 2
Write-Output '--- status ---'
Show-Status
