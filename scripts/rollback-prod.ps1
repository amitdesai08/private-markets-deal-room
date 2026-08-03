#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Put production back exactly as it was before the 2026-08-03 promotion.

.DESCRIPTION
  Two ways back, in order of preference:

    -Mode revision  (default) — reactivate the revisions that were serving before the
                     promotion and give them all the traffic. This restores the image
                     AND the environment variables that revision was created with, in
                     one move, without a rebuild. Fastest and most complete.

    -Mode image    — pin the container images back by DIGEST (not tag: a tag can be
                     repointed, a digest cannot). Use this if the old revisions have
                     been garbage-collected.

  Neither mode touches Cosmos. Deal data is not versioned with the image: the store
  inserts seeded deals only when their id is absent and never overwrites an existing
  one, so rolling the image back leaves the records alone. If a bad write needs undoing
  that is a separate job — the account has periodic backups, and the pre-promotion
  export is in the backup folder named below.

.EXAMPLE
  ./scripts/rollback-prod.ps1 -WhatIf
.EXAMPLE
  ./scripts/rollback-prod.ps1
#>
[CmdletBinding()]
param(
  [ValidateSet('revision', 'image')][string]$Mode = 'revision',
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'

# Captured 2026-08-03 from the running production apps, before the promotion.
$rg          = 'rg-dealhub-app-dev-swc'
$acr         = 'acrdealhubdevp3tks.azurecr.io'
$backupDir   = 'C:\Users\desaiamit\dealroom-prod-backup'   # see LATEST.txt inside

$targets = @(
  [pscustomobject]@{
    App      = 'ca-dealhub-orch-green'
    Revision = 'ca-dealhub-orch-green--0000043'
    Image    = "$acr/deal-room@sha256:ffc90974b7cf6dd374a8e447e24723de57f921ddcffc8d45585d826f2ff92d6c"
    WasTag   = 'deal-room:persona11'
    Probe    = 'https://ca-dealhub-orch-green.niceisland-36753373.swedencentral.azurecontainerapps.io/api/health'
  },
  [pscustomobject]@{
    App      = 'ca-dealhub-teams-dev-swc'
    Revision = 'ca-dealhub-teams-dev-swc--0000101'
    Image    = "$acr/deal-room-teams@sha256:52eebbc94ee8e8fafcab49a2ce8f25ed4e9d2e457bdfe29245cd3eeaba1d3dac"
    WasTag   = 'deal-room-teams:persona15'
    Probe    = 'https://ca-dealhub-teams-dev-swc.ambitiousforest-08192d93.swedencentral.azurecontainerapps.io/api/teams/config'
  }
)

Write-Host "Rolling production back ($Mode mode)" -ForegroundColor Cyan
Write-Host "Pre-promotion export: $(Get-Content "$backupDir\LATEST.txt" -ErrorAction SilentlyContinue)"
Write-Host ''

foreach ($t in $targets) {
  Write-Host "== $($t.App)  ->  $($t.WasTag)" -ForegroundColor Cyan
  if ($WhatIf) {
    if ($Mode -eq 'revision') { Write-Host "   would activate $($t.Revision) and give it 100% traffic" }
    else { Write-Host "   would set image $($t.Image)" }
    continue
  }

  if ($Mode -eq 'revision') {
    az containerapp revision activate -n $t.App -g $rg --revision $t.Revision | Out-Null
    az containerapp ingress traffic set -n $t.App -g $rg --revision-weight "$($t.Revision)=100" | Out-Null
  }
  else {
    az containerapp update -n $t.App -g $rg --image $t.Image | Out-Null
  }

  # Deactivate everything that is not the target, so one revision serves and there is
  # no chance of a replica still running the promoted build.
  $others = az containerapp revision list -n $t.App -g $rg --query "[?properties.active && name!='$($t.Revision)'].name" -o tsv
  foreach ($r in ($others -split "`n" | Where-Object { $_ })) {
    if ($Mode -eq 'revision') {
      az containerapp revision deactivate -n $t.App -g $rg --revision $r.Trim() 2>$null | Out-Null
      Write-Host "   deactivated $($r.Trim())"
    }
  }
  Write-Host "   ok" -ForegroundColor Green
}

if ($WhatIf) { Write-Host "`n(what-if only — nothing changed)"; return }

Write-Host "`n== Verifying ==" -ForegroundColor Cyan
Start-Sleep -Seconds 20
foreach ($t in $targets) {
  $img = az containerapp show -n $t.App -g $rg --query "properties.template.containers[0].image" -o tsv
  $ok = $false
  try { $ok = (Invoke-WebRequest -Uri $t.Probe -TimeoutSec 30 -SkipHttpErrorCheck).StatusCode -eq 200 } catch {}
  Write-Host ("  {0,-26} {1,-8} {2}" -f $t.App, ($ok ? 'answering' : 'SILENT'), $img) -ForegroundColor ($ok ? 'Green' : 'Red')
}
