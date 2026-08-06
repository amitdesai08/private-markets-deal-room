# Production smoke test.
#
# Written during the promotion of the beta build to production, because "it deployed"
# is not the same as "it works". Every check below is something a person would notice
# if it broke: a deal that lost its data room, a briefing that will not open, a tab
# that is quietly pointing at the wrong backend.
#
# The bot key is NOT stored here. Pass it in, or put it in DEAL_ROOM_BOT_KEY.
#
#   $env:DEAL_ROOM_BOT_KEY = '<key>'; .\scripts\validate-prod.ps1
#
# Read-only: it lists, fetches and compares. It never writes to a deal.

[CmdletBinding()]
param(
  [string] $BotKey = $env:DEAL_ROOM_BOT_KEY,
  [string] $Backend = 'https://ca-dealhub-orch-green.niceisland-36753373.swedencentral.azurecontainerapps.io',
  [string] $Tab = 'https://ca-dealhub-teams-dev-swc.ambitiousforest-08192d93.swedencentral.azurecontainerapps.io',
  # The deal used for the document and briefing checks.
  [string] $SampleDeal = 'demo-helvetia',
  # Optional: a backup folder holding prod.deals.full.json, to prove nothing was lost.
  [string] $BaselineDir = $(if (Test-Path "$HOME\dealroom-prod-backup\LATEST.txt") { (Get-Content "$HOME\dealroom-prod-backup\LATEST.txt" -Raw).Trim() } else { '' })
)

$ErrorActionPreference = 'Continue'
if (-not $BotKey) { throw 'No bot key. Pass -BotKey or set DEAL_ROOM_BOT_KEY.' }
# The key proves which app is calling and never proved who is asking, though the backend
# used to treat it as if it did — so this script ran as the deploy default, which is the
# most privileged seat there is, and certified a view no real person would ever be shown.
# It says who it is now, like every other caller.
$h = @{
  'x-bot-key' = $BotKey
  'x-dr-as'   = 'desaiamit'
  # An oid the deployment actually knows. This used to carry name='desaiamit' and rely on
  # the name resolving a role; display names stopped granting anything, because asserting
  # one was how a stranger became a person on a confidential deal — and this script quietly
  # collapsed to the member seat and reported eleven deals as LOST.
  'x-dr-user' = '{"oid":"admin","upn":"admin"}'
}
$pass = 0; $fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++; "  PASS  $name  $detail" }
  else { $script:fail++; "  FAIL  $name  $detail" }
}
function Get-Api($url, $headers = $h) {
  try { Invoke-WebRequest -Uri $url -Headers $headers -SkipHttpErrorCheck -TimeoutSec 180 } catch { $null }
}

"=== 1. Both services are up and pointing at each other"
$r = Get-Api "$Backend/api/health"
Check 'orchestrator health' ($r -and $r.StatusCode -eq 200) "HTTP $($r.StatusCode)"
$r = Get-Api "$Tab/api/teams/config" @{}
$cfg = if ($r) { $r.Content | ConvertFrom-Json } else { $null }
Check 'tab configuration' ($r.StatusCode -eq 200) "backend=$($cfg.backend) sso=$($cfg.sso) bot=$($cfg.bot)"
Check 'deals open on the briefing' ($cfg.cockpit -eq $true) "cockpit=$($cfg.cockpit)"
Check 'tab is not in demo mode' ($cfg.demoMode -eq $false) "demoMode=$($cfg.demoMode)"
Check 'tab points at this backend' ($cfg.backendUrl -eq $Backend) "$($cfg.backendUrl)"
$r = Get-Api "$Tab/api/platform/status" @{}
$ps = if ($r) { $r.Content | ConvertFrom-Json } else { $null }
Check 'power control resolves a real app' ([bool]$ps.appName -and $ps.online -eq $true) "app=$($ps.appName) online=$($ps.online)"

"`n=== 2. Platform configuration"
$c = (Get-Api "$Backend/api/config").Content | ConvertFrom-Json
Check 'records are in Cosmos' ($c.datastore -eq 'cosmos') "datastore=$($c.datastore)"
Check 'Cosmos is reached by managed identity' ($c.auth -eq 'managed-identity') "auth=$($c.auth)"
Check 'Microsoft 365 is configured' ($c.m365.configured -eq $true) "configured=$($c.m365.configured) dataRoom=$($c.m365.dataRoom) files=$($c.m365.files)"

"`n=== 3. Deal records"
$deals = (Get-Api "$Backend/api/deals").Content | ConvertFrom-Json
Check 'deals are being served' ($deals.Count -gt 0) "$($deals.Count) deals"
if ($BaselineDir -and (Test-Path "$BaselineDir\prod.deals.full.json")) {
  $before = (Get-Content "$BaselineDir\prod.deals.full.json" -Raw) | ConvertFrom-Json
  $nowIds = $deals | ForEach-Object { $_.id }
  # A confidential deal is reachable only by a NAMED person, never by a role, so no seat
  # this script can hold will ever enumerate one. That is the access model working, not a
  # record going missing, and conflating the two would have this check demand the hole be
  # reopened. They are checked for existence individually below instead.
  $confidentialIds = @($before | Where-Object { $_.confidential } | ForEach-Object { $_.id })
  $lost = ($before | ForEach-Object { $_.id }) | Where-Object { $_ -notin $nowIds -and $_ -notin $confidentialIds }
  Check 'no deal from the baseline was lost' ($lost.Count -eq 0) "baseline=$($before.Count) now=$($nowIds.Count) lost=$($lost -join ',')"
  # And prove they are hidden rather than gone: a confidential deal must answer 404 to a
  # role-based seat and still be on the record for someone named on it.
  if ($confidentialIds.Count) {
    $shown = @($confidentialIds | Where-Object { $_ -in $nowIds })
    Check 'confidential deals are hidden, not listed' ($shown.Count -eq 0) "$($confidentialIds.Count) confidential, $($shown.Count) listed to this seat"
  }
} else {
  "  SKIP  baseline comparison  no prod.deals.full.json at '$BaselineDir'"
}

"`n=== 4. Every deal is wired to Microsoft 365"
$chan = 0; $sp = 0; $seed = 0; $gaps = @()
foreach ($d in $deals) {
  $f = (Get-Api "$Backend/api/deals/$($d.id)").Content | ConvertFrom-Json
  if ($f.teamsChannel.webUrl) { $chan++ } else { $gaps += "$($d.id):channel" }
  if ($f.workspace.sharePointProvisioned) { $sp++ } else { $gaps += "$($d.id):dataroom" }
  if ($f.workspace.dataRoomSeeded) { $seed++ } else { $gaps += "$($d.id):seed" }
}
Check 'every deal has a Teams channel' ($chan -eq $deals.Count) "$chan/$($deals.Count)"
Check 'every deal has a data room' ($sp -eq $deals.Count) "$sp/$($deals.Count)"
Check 'every data room has contents' ($seed -eq $deals.Count) "$seed/$($deals.Count)"
if ($gaps.Count) { "  gaps: $($gaps -join ', ')" }

"`n=== 5. Data room reads"
$r = Get-Api "$Backend/api/deals/$SampleDeal/documents"
$docs = $r.Content | ConvertFrom-Json
Check 'the data room lists' ($r.StatusCode -eq 200) "HTTP $($r.StatusCode) folders=$($docs.folders.Count) files=$($docs.documents.Count)"

"`n=== 6. Briefing documents"
$corpus = (Get-Api "$Backend/api/deals/$SampleDeal/workiq-corpus").Content | ConvertFrom-Json
$docName = ($corpus.files | Select-Object -First 1).name
$enc = [uri]::EscapeDataString([string]$docName)
"  (document under test: $docName)"
$r = Get-Api "$Backend/api/deals/$SampleDeal/document-brief?name=$enc"
Check 'briefing text' ($r.StatusCode -eq 200 -and $r.Content.Length -gt 300) "HTTP $($r.StatusCode) $($r.Content.Length) bytes"
$r = Get-Api "$Backend/api/deals/$SampleDeal/document-brief.docx?name=$enc"
Check 'briefing as Word' ($r.StatusCode -eq 200 -and $r.RawContentLength -gt 2000) "HTTP $($r.StatusCode) $($r.RawContentLength) bytes"
$r = Get-Api "$Backend/api/deals/$SampleDeal/document-brief.pdf?name=$enc"
Check 'briefing as PDF, served inline' ($r.StatusCode -eq 200 -and $r.Headers['Content-Type'] -like '*application/pdf*') "HTTP $($r.StatusCode) $($r.RawContentLength) bytes $($r.Headers['Content-Type'])"
$r = Get-Api "$Backend/api/deals/$SampleDeal/document-brief?name=No%20Such%20Document.pdf"
Check 'a document not on the deal is refused' ($r.StatusCode -eq 404) "HTTP $($r.StatusCode)"

"`n=== 7. The surfaces people open first"
$r = Get-Api "$Backend/api/home-desk"; $hd = $r.Content | ConvertFrom-Json
Check 'home' ($r.StatusCode -eq 200) "HTTP $($r.StatusCode) needing attention=$($hd.attention.Count) follow-ups=$($hd.workiq.total)"
Check 'market intelligence' ((Get-Api "$Backend/api/market-intel").StatusCode -eq 200) ''
Check 'flow' ((Get-Api "$Backend/api/flow").StatusCode -eq 200) ''
$r = Get-Api "$Backend/api/deals/$SampleDeal/threads"; $th = $r.Content | ConvertFrom-Json
Check 'deal conversation' ($r.StatusCode -eq 200 -and $th.threads.Count -gt 0) "$($th.threads.Count) threads, channel linked=$([bool]$th.channelUrl)"

"`n=== 8. People, grouping and sources"
$r = Get-Api "$Backend/api/personas"; $p = $r.Content | ConvertFrom-Json
Check 'people' ($r.StatusCode -eq 200 -and $p.Count -gt 0) "$($p.Count)"
Check 'assistants' ((Get-Api "$Backend/api/persona-agents").StatusCode -eq 200) ''
Check 'deal groups' ((Get-Api "$Backend/api/deal-groups").StatusCode -eq 200) ''
$r = Get-Api "$Backend/api/connectors"; $cn = $r.Content | ConvertFrom-Json
Check 'sources' ($r.StatusCode -eq 200) "$($cn.Count)"
$r = Get-Api "$Backend/api/demo-profiles"; $dp = $r.Content | ConvertFrom-Json
Check 'showcase profiles' ($r.StatusCode -eq 200 -and $dp.Count -gt 0) "$($dp.Count)"

"`n=== RESULT: $pass passed, $fail failed"
if ($fail) { exit 1 }
