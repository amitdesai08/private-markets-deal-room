#Requires -Version 7
<#
.SYNOPSIS
  Power the whole Deal Room platform off/on for cost control.

.DESCRIPTION
  Stops/starts everything that CAN be stopped as one unit, and reports the
  standing-cost resources that cannot (so there are no surprises on the bill).

  Stoppable / pausable (acted on):
    * Container Apps  — orchestrator + Teams (start/stop)
    * Function App    — start/stop
    * Fabric capacity — suspend/resume (only if deployed)     [skip with -ComputeOnly]

  Standing cost (reported, not stopped — remove by tearing down the stack):
    * Azure AI Search, API Management  — SKU-billed while they exist
    * Container Registry               — small (Basic); holds your images
    * Log Analytics, App Insights      — ingestion/retention billed
    * Cosmos DB (serverless)           — per-request; left up to protect data

  Actions:
    stop    Stop everything stoppable (the whole platform off).
    start   Start everything back up.
    sleep   Stop the ORCHESTRATOR only, leaving the Teams app up so anyone can
            self-serve "Bring online" from the in-Teams offline gate.
    status  Show running state of the apps (+ Fabric) and list standing costs.

  Requires the Azure CLI, logged in (az login) with rights on the resource groups.

.EXAMPLE
  ./platform-power.ps1 -Action sleep                 # cheap idle; Teams gate stays up
.EXAMPLE
  ./platform-power.ps1 -Action stop -Yes             # full shutdown, no prompt
.EXAMPLE
  ./platform-power.ps1 -Action start -ComputeOnly    # just the container apps
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('stop', 'start', 'sleep', 'status')][string]$Action,
  [string]$Env = 'dev',
  [string]$LocationShort = 'swc',
  [string]$Workload = 'dealhub',
  [string]$ResourceGroup,
  [string]$OrchestratorApp,
  [string]$TeamsApp,
  [switch]$ComputeOnly,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$appRg  = if ($ResourceGroup) { $ResourceGroup } else { "rg-$Workload-app-$Env-$LocationShort" }
$dataRg = "rg-$Workload-data-$Env-$LocationShort"
$aiRg   = "rg-$Workload-ai-$Env-$LocationShort"
$coreRg = "rg-$Workload-core-$Env-$LocationShort"
$intRg  = "rg-$Workload-integration-$Env-$LocationShort"
if (-not $OrchestratorApp) { $OrchestratorApp = "ca-$Workload-orch-$Env-$LocationShort" }
if (-not $TeamsApp)        { $TeamsApp        = "ca-$Workload-teams-$Env-$LocationShort" }

$orchId = az containerapp show -n $OrchestratorApp -g $appRg --query id -o tsv 2>$null
if (-not $orchId) {
  Write-Error "Orchestrator app '$OrchestratorApp' not found in '$appRg'. Pass -ResourceGroup/-OrchestratorApp/-Env."
  exit 1
}
$teamsId = az containerapp show -n $TeamsApp -g $appRg --query id -o tsv 2>$null

function Test-Rg($rg) { (az group exists -n $rg) -eq 'true' }
function Get-Running($name, $rg) { az containerapp show -n $name -g $rg --query 'properties.runningStatus' -o tsv 2>$null }
# Start/stop a container app via ARM — works on any az CLI (`az containerapp stop`
# isn't available on older versions).
function Invoke-CaPower($id, $action) {
  if (-not $id) { return }
  az rest --method post --url ("https://management.azure.com{0}/{1}?api-version=2024-03-01" -f $id, $action) --only-show-errors 2>$null | Out-Null
}
function Set-Lease($mode, $expires = '0') {
  az tag update --resource-id $orchId --operation Merge `
    --tags "dealroom-lease-mode=$mode" "dealroom-lease-expires=$expires" 'dealroom-lease-by=script' | Out-Null
}
function Confirm-Action($what) {
  if ($Yes) { return $true }
  $ans = Read-Host "About to $what. Continue? [y/N]"
  return ($ans -match '^(y|yes)$')
}

function Invoke-Functions($op) {
  if ($ComputeOnly -or -not (Test-Rg $appRg)) { return }
  $fns = az functionapp list -g $appRg --query '[].name' -o tsv 2>$null
  foreach ($f in $fns) {
    if ($f) { Write-Host "  $op function app $f"; az functionapp $op -n $f -g $appRg 2>$null | Out-Null }
  }
}
function Invoke-Fabric($action) {
  if ($ComputeOnly -or -not (Test-Rg $dataRg)) { return }
  $caps = az resource list -g $dataRg --resource-type 'Microsoft.Fabric/capacities' --query '[].id' -o tsv 2>$null
  foreach ($c in $caps) {
    if ($c) { Write-Host "  $action Fabric capacity"; az resource invoke-action --ids $c --action $action --api-version 2023-11-01 2>$null | Out-Null }
  }
}
function Get-FabricState {
  if (-not (Test-Rg $dataRg)) { return $null }
  az resource list -g $dataRg --resource-type 'Microsoft.Fabric/capacities' --query '[0].properties.state' -o tsv 2>$null
}
function Show-StandingCosts {
  $items = @(
    @{ rg = $aiRg;   type = 'Microsoft.Search/searchServices';           note = 'SKU-billed while it exists (not stoppable)' },
    @{ rg = $intRg;  type = 'Microsoft.ApiManagement/service';           note = 'SKU-billed while it exists (not stoppable)' },
    @{ rg = $appRg;  type = 'Microsoft.ContainerRegistry/registries';    note = 'small (Basic); holds your images' },
    @{ rg = $coreRg; type = 'Microsoft.OperationalInsights/workspaces';  note = 'ingestion/retention billed' },
    @{ rg = $coreRg; type = 'Microsoft.Insights/components';             note = 'ingestion billed' },
    @{ rg = $dataRg; type = 'Microsoft.DocumentDB/databaseAccounts';     note = 'serverless = per-request; left up to protect data' }
  )
  Write-Host ''
  Write-Host 'Standing-cost resources (NOT stopped — remove by tearing down the stack):'
  $any = $false
  foreach ($i in $items) {
    if (-not (Test-Rg $i.rg)) { continue }
    $names = az resource list -g $i.rg --resource-type $i.type --query '[].name' -o tsv 2>$null
    foreach ($n in $names) { if ($n) { $any = $true; Write-Host ("  - {0,-22} {1}  ({2})" -f ($i.type -split '/')[-1], $n, $i.note) } }
  }
  if (-not $any) { Write-Host '  (none found)' }
}

switch ($Action) {
  'status' {
    Write-Host "Orchestrator  $OrchestratorApp : $(Get-Running $OrchestratorApp $appRg)"
    Write-Host "Teams app     $TeamsApp : $(Get-Running $TeamsApp $appRg)"
    $fns = az functionapp list -g $appRg --query '[].{n:name,s:state}' -o tsv 2>$null
    if ($fns) { Write-Host "Function app  $fns" }
    $fab = Get-FabricState; if ($fab) { Write-Host "Fabric        capacity: $fab" }
    $tags = az containerapp show -n $OrchestratorApp -g $appRg --query 'tags' -o json | ConvertFrom-Json
    Write-Host "Lease         mode=$($tags.'dealroom-lease-mode') expires=$($tags.'dealroom-lease-expires')"
    Show-StandingCosts
  }
  'sleep' {
    if (-not (Confirm-Action "put the orchestrator to sleep (Teams gate stays up)")) { Write-Host 'Cancelled.'; return }
    Set-Lease 'asleep'
    Invoke-CaPower $orchId 'stop'
    Write-Host "Orchestrator asleep. The Teams app stays up so users can wake it from the offline gate."
  }
  'stop' {
    $scope = if ($ComputeOnly) { 'the container apps' } else { 'the whole platform (apps + functions + Fabric)' }
    if (-not (Confirm-Action "STOP $scope")) { Write-Host 'Cancelled.'; return }
    Set-Lease 'asleep'
    Invoke-CaPower $orchId 'stop'
    Invoke-CaPower $teamsId 'stop'
    Invoke-Functions 'stop'
    Invoke-Fabric 'suspend'
    Write-Host "Platform stopped. Run '-Action start' to bring it back up."
    Show-StandingCosts
  }
  'start' {
    Invoke-CaPower $orchId 'start'
    Invoke-CaPower $teamsId 'start'
    Invoke-Functions 'start'
    Invoke-Fabric 'resume'
    Set-Lease 'indefinite'
    Write-Host "Platform started (lease: indefinite). Give the apps ~1 minute to become ready."
  }
}
