#Requires -Version 7
<#
.SYNOPSIS
  Power the whole Deal Room platform off/on for cost control.

.DESCRIPTION
  The Deal Room's running cost is dominated by its two Azure Container Apps. This
  script stops/starts them as one unit so an idle demo costs almost nothing.

    stop    Stop BOTH apps (orchestrator + Teams) — the whole platform off.
    start   Start both apps (marks the orchestrator lease "indefinite").
    sleep   Stop the ORCHESTRATOR only, leaving the Teams app up so anyone can
            self-serve "Bring online" from the in-Teams offline gate.
    status  Show the running state of both apps and the orchestrator's lease tag.

  Resource/app names default to the dev naming convention and can be overridden.
  Requires the Azure CLI, logged in (az login) with rights on the app resource group.

.EXAMPLE
  ./platform-power.ps1 -Action sleep          # cheap idle state; Teams gate stays up
.EXAMPLE
  ./platform-power.ps1 -Action stop -Yes      # full shutdown, no prompt
.EXAMPLE
  ./platform-power.ps1 -Action start          # bring the whole platform back up
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
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
if (-not $ResourceGroup)   { $ResourceGroup   = "rg-$Workload-app-$Env-$LocationShort" }
if (-not $OrchestratorApp) { $OrchestratorApp = "ca-$Workload-orch-$Env-$LocationShort" }
if (-not $TeamsApp)        { $TeamsApp        = "ca-$Workload-teams-$Env-$LocationShort" }

$orchId = az containerapp show -n $OrchestratorApp -g $ResourceGroup --query id -o tsv 2>$null
if (-not $orchId) {
  Write-Error "Orchestrator app '$OrchestratorApp' not found in '$ResourceGroup'. Pass -ResourceGroup/-OrchestratorApp/-Env."
  exit 1
}

function Get-Running($name) { az containerapp show -n $name -g $ResourceGroup --query 'properties.runningStatus' -o tsv 2>$null }
function Set-Lease($mode, $expires = '0') {
  az tag update --resource-id $orchId --operation Merge `
    --tags "dealroom-lease-mode=$mode" "dealroom-lease-expires=$expires" 'dealroom-lease-by=script' | Out-Null
}
function Confirm-Action($what) {
  if ($Yes) { return $true }
  $ans = Read-Host "About to $what. Continue? [y/N]"
  return ($ans -match '^(y|yes)$')
}

switch ($Action) {
  'status' {
    Write-Host "Orchestrator  $OrchestratorApp : $(Get-Running $OrchestratorApp)"
    Write-Host "Teams app     $TeamsApp : $(Get-Running $TeamsApp)"
    $tags = az containerapp show -n $OrchestratorApp -g $ResourceGroup --query 'tags' -o json | ConvertFrom-Json
    Write-Host "Lease         mode=$($tags.'dealroom-lease-mode') expires=$($tags.'dealroom-lease-expires')"
  }
  'sleep' {
    if (-not (Confirm-Action "put the orchestrator to sleep (Teams gate stays up)")) { Write-Host 'Cancelled.'; return }
    Set-Lease 'asleep'
    az containerapp stop -n $OrchestratorApp -g $ResourceGroup | Out-Null
    Write-Host "Orchestrator asleep. The Teams app stays up so users can wake it from the offline gate."
  }
  'stop' {
    if (-not (Confirm-Action "STOP the whole platform (both apps)")) { Write-Host 'Cancelled.'; return }
    Set-Lease 'asleep'
    az containerapp stop -n $OrchestratorApp -g $ResourceGroup | Out-Null
    az containerapp stop -n $TeamsApp -g $ResourceGroup | Out-Null
    Write-Host "Whole platform stopped. Run '-Action start' to bring it back up."
  }
  'start' {
    az containerapp start -n $OrchestratorApp -g $ResourceGroup | Out-Null
    az containerapp start -n $TeamsApp -g $ResourceGroup | Out-Null
    Set-Lease 'indefinite'
    Write-Host "Whole platform started (lease: indefinite). Give the apps ~1 minute to become ready."
  }
}
