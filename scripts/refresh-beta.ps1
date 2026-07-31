# Refreshes the Deal Room BETA stack: build -> deploy -> single revision -> reseed -> verify.
#
# WHY THIS EXISTS
# ---------------
# Doing these steps by hand in the obvious order silently produces a stale demo.
# `az containerapp update` returns Succeeded and `revision list` shows 100% traffic on
# the new revision BEFORE that revision is actually serving. The old revision keeps
# answering for a short window. If the demo reseed lands in that window it runs the OLD
# image's fixture and writes it into Cosmos, so the seed changes you just built are
# overwritten by the ones you replaced — and every later restart re-reads them. The
# code changes ARE live, which is what makes it confusing: the page renders new wording
# over old data and looks like a build that didn't take.
#
# So ordering alone is not enough, and this script does not rely on it:
#   - it waits for the new revision to report Running/Healthy, then DEACTIVATES every
#     other revision, so no old replica can answer the reseed even if it wanted to;
#   - it reseeds only after that;
#   - it then PROVES the served workstreams match app/data/deals.js, and fails loudly
#     if they do not, rather than leaving you to notice during a demo.
#
# Beta only. This script names no production resource and must never be pointed at one.
#
#   .\scripts\refresh-beta.ps1 -Tag cockpit24
#   .\scripts\refresh-beta.ps1 -Tag cockpit24 -TeamsTag cockpit18
#   .\scripts\refresh-beta.ps1 -Tag cockpit24 -SkipBuild        # image already in ACR
#   .\scripts\refresh-beta.ps1 -Verify                          # check the live stack only

[CmdletBinding()]
param(
  [string] $Tag,
  [string] $TeamsTag,
  [switch] $SkipBuild,
  [switch] $SkipReseed,
  [switch] $Verify
)

$ErrorActionPreference = 'Stop'

$RG         = 'rg-dealhub-app-dev-swc'
$ACR        = 'acrdealhubdevp3tks'
$BETA_ORCH  = 'ca-dealhub-orch-beta'
$BETA_TEAMS = 'ca-dealhub-teams-beta'
$REPO       = Split-Path $PSScriptRoot -Parent

function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  ok  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !   $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "`nFAILED: $m" -ForegroundColor Red; exit 1 }

if (-not $Verify -and -not $Tag) { Die 'give -Tag <image tag>, or -Verify to check the live stack' }

# A guard, not a formality: every destructive step below assumes beta.
foreach ($n in @($BETA_ORCH, $BETA_TEAMS)) {
  if ($n -notmatch 'beta') { Die "refusing to run: $n is not a beta app" }
}

# ---------------------------------------------------------------- 1. build
if (-not $Verify -and -not $SkipBuild) {
  Step "1. Build deal-room:$Tag"
  # --no-logs because ACR's log stream dies on the unicode in the seed data.
  $status = az acr build --registry $ACR --image "deal-room:$Tag" --file app/Dockerfile app --no-logs -o tsv --query 'status'
  if ($status -ne 'Succeeded') { Die "ACR build returned '$status'" }
  Ok "deal-room:$Tag"

  if ($TeamsTag) {
    $statusT = az acr build --registry $ACR --image "deal-room-teams:$TeamsTag" --file teams-app/Dockerfile teams-app --no-logs -o tsv --query 'status'
    if ($statusT -ne 'Succeeded') { Die "ACR build (teams) returned '$statusT'" }
    Ok "deal-room-teams:$TeamsTag"
  }
} elseif (-not $Verify) { Warn "1. Build skipped, expecting deal-room:$Tag to exist in $ACR" }

# --------------------------------------------------------------- 2. deploy
if (-not $Verify) {
  Step "2. Deploy to $BETA_ORCH"
  $state = az containerapp update -n $BETA_ORCH -g $RG --image "$ACR.azurecr.io/deal-room:$Tag" -o tsv --query 'properties.provisioningState'
  if ($state -ne 'Succeeded') { Die "containerapp update returned '$state'" }
  Ok "image set to deal-room:$Tag"

  if ($TeamsTag) {
    $stateT = az containerapp update -n $BETA_TEAMS -g $RG --image "$ACR.azurecr.io/deal-room-teams:$TeamsTag" -o tsv --query 'properties.provisioningState'
    if ($stateT -ne 'Succeeded') { Die "containerapp update (teams) returned '$stateT'" }
    Ok "teams image set to deal-room-teams:$TeamsTag"
  }
}

# ------------------------------------------- 3. one revision, and it is the new one
# The step the manual process skips. Until this passes, anything you ask the API to do
# may be answered by the previous build.
Step '3. Converge to a single serving revision'
$expected = if ($Tag) { "$ACR.azurecr.io/deal-room:$Tag" } else { $null }
$target = $null
for ($i = 1; $i -le 40; $i++) {
  $revs = az containerapp revision list -n $BETA_ORCH -g $RG -o json | ConvertFrom-Json | Where-Object { $_.properties.active }
  $target = if ($expected) { $revs | Where-Object { $_.properties.template.containers[0].image -eq $expected } | Select-Object -Last 1 }
            else { $revs | Sort-Object { $_.properties.trafficWeight } | Select-Object -Last 1 }
  if (-not $target) { Start-Sleep -Seconds 5; continue }

  $running = $target.properties.runningState
  $health  = $target.properties.healthState
  # RunningAtMaxScale is also running. Testing for the literal 'Running' spun for three
  # minutes and then declared a healthy revision dead.
  if ($running -like 'Running*' -and $health -ne 'Unhealthy') {
    # Healthy and serving. Now make it the ONLY thing that can serve.
    $stale = $revs | Where-Object { $_.name -ne $target.name }
    if ($Verify) {
      foreach ($s in $stale) { Warn "stale revision still active: $($s.name) — a refresh would deactivate it" }
    } else {
      foreach ($s in $stale) {
        az containerapp revision deactivate -n $BETA_ORCH -g $RG --revision $s.name -o none
        Ok "deactivated stale revision $($s.name) ($($s.properties.template.containers[0].image -replace '.*/', ''))"
      }
    }
    break
  }
  Write-Host "  .. $($target.name) runningState=$running healthState=$health"
  Start-Sleep -Seconds 5
}
if (-not $target) { Die "no active revision is running the expected image ($expected)" }
if ($target.properties.runningState -notlike 'Running*') { Die "$($target.name) never started (last: $($target.properties.runningState))" }
Ok "serving revision $($target.name)"

# A revision that was already up before the stale ones were deactivated may hold deal
# records it read from Cosmos at boot. Restart so the reseed writes onto a clean read.
if (-not $Verify) {
  az containerapp revision restart -n $BETA_ORCH -g $RG --revision $target.name -o none
  Ok 'restarted so every replica re-reads Cosmos'
}

# ------------------------------------------------------------ backend plumbing
$base = 'https://' + (az containerapp show -n $BETA_ORCH -g $RG --query 'properties.configuration.ingress.fqdn' -o tsv)
$key  = az containerapp show -n $BETA_ORCH -g $RG --query "properties.template.containers[0].env[?name=='BOT_BACKEND_KEY'].value | [0]" -o tsv
if (-not $key) { Die 'BOT_BACKEND_KEY is not a plain env var on the beta app; cannot call the admin route' }
$headers = @{ 'x-bot-key' = $key; 'x-dr-user' = '{"upn":"admin","name":"Demo Administrator"}' }

# Responses are cached by Invoke-RestMethod when the URL is identical, which has already
# produced one false "the deploy didn't take" diagnosis. Every call gets a fresh URL.
function Get-Api($path) {
  $sep = if ($path.Contains('?')) { '&' } else { '?' }
  Invoke-RestMethod -Uri "$base$path$sep`cb=$([guid]::NewGuid())" -Headers $headers
}

# Wait for the restarted replica to answer before asking it to do anything.
for ($i = 1; $i -le 30; $i++) {
  try { $null = Get-Api '/api/health'; break } catch { Start-Sleep -Seconds 4 }
  if ($i -eq 30) { Die "$base/api/health never answered" }
}
Ok "$base is answering"

# ----------------------------------------------------------------- 4. reseed
# Seed edits do NOT reach a booted environment on their own: hydrate() only inserts a
# deal whose id is absent, so app/data/deals.js is a one-time initialiser everywhere
# except a brand new store. The admin route is the only way to push seed changes.
function Invoke-Reseed {
  $body = '{"confirm":"replace-demo-deals"}'
  $r = Invoke-RestMethod -Uri "$base/api/admin/reseed-demo-deals?cb=$([guid]::NewGuid())" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
  Ok "reseeded $($r.applied) deals ($($r.mode))"
}
if (-not $Verify -and -not $SkipReseed) { Step '4. Reseed demo deals'; Invoke-Reseed }

# ----------------------------------------------------------------- 5. verify
# The check that would have caught the stale write immediately. Compare what the API
# serves against the seed in this working tree, lane by lane. Only lanes the seed
# actually declares are compared: the store backfills the rest as not_started/0 by
# design, and that backfill is not a mismatch.
Step '5. Verify served data matches app/data/deals.js'
Push-Location $REPO
try {
  $json = node --input-type=module -e "const m = await import('./app/data/deals.js'); console.log(JSON.stringify(m.seededDeals.flatMap(d => (d.workstreams||[]).map(w => ({ id: d.id, lane: w.lane, status: w.status||'not_started', progress: Number(w.progress)||0 })))));"
} finally { Pop-Location }
$seed = $json | ConvertFrom-Json
if (-not $seed) { Die 'could not read the seed from app/data/deals.js' }

function Test-Served($seedRows) {
  $bad = @()
  foreach ($g in ($seedRows | Group-Object id)) {
    try { $d = Get-Api "/api/deals/$($g.Name)" } catch { $bad += "$($g.Name): not served ($($_.Exception.Message))"; continue }
    foreach ($row in $g.Group) {
      $w = $d.workstreams | Where-Object { $_.lane -eq $row.lane } | Select-Object -First 1
      if (-not $w) { $bad += "$($g.Name)/$($row.lane): missing"; continue }
      $status = if ($w.status) { $w.status } else { 'not_started' }
      $progress = [int]($w.progress)
      if ($status -ne $row.status -or $progress -ne $row.progress) {
        $bad += "$($g.Name)/$($row.lane): served $status/$progress%, seed says $($row.status)/$($row.progress)%"
      }
    }
  }
  return $bad
}

$bad = Test-Served $seed
if ($bad.Count -and -not $Verify -and -not $SkipReseed) {
  # The one known transient: a stale replica answered the first reseed. Now that the old
  # revisions are deactivated, a second attempt is served by the new build.
  Warn "$($bad.Count) lane(s) stale — reseeding once more"
  Invoke-Reseed
  $bad = Test-Served $seed
}
if ($bad.Count) {
  $bad | Select-Object -First 15 | ForEach-Object { Write-Host "  x   $_" -ForegroundColor Red }
  Die "$($bad.Count) workstream(s) do not match the seed in this working tree"
}
Ok "$(($seed | Group-Object id).Count) deals match the seed, lane for lane"

Step 'DONE'
Write-Host "backend: $base"
Write-Host "tab:     https://$(az containerapp show -n $BETA_TEAMS -g $RG --query 'properties.configuration.ingress.fqdn' -o tsv)"
if ($Tag) { Write-Host "image:   deal-room:$Tag on $($target.name)" }
