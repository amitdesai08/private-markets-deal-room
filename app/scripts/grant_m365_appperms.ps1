# Grant the Microsoft Graph APPLICATION permissions the Deal Room needs to run the
# deal data room (Teams channel in the parent team + SharePoint folders + document
# list/upload) APP-ONLY — no per-user sign-in, durable across redeploys.
#
# WHY: the connector app registration (Deal Room M365 Connector) was set up with
# DELEGATED scopes only. The app-only data-room path (lib/m365/graph.js) needs the
# matching APPLICATION (Role) permissions, admin-consented once by a Global Admin.
#
# PREREQUISITE: an interactive login as a Global Admin (satisfies the tenant's
# Conditional-Access step-up that automation can't):
#     az login --scope https://graph.microsoft.com/.default
#
# Then run this script:  pwsh -NoProfile -File grant_m365_appperms.ps1
#
# It resolves each Graph appRole id dynamically (so no GUIDs are hardcoded), adds
# them to the app, admin-consents, and re-tests provisioning against the live app.

$ErrorActionPreference = 'Stop'

$GraphAppId = '00000003-0000-0000-c000-000000000000'   # Microsoft Graph
$App        = '2ecae299-02ce-41d0-8b4f-31b157a74930'   # Deal Room M365 Connector (dev)

# Application permissions used by the app-only data-room code (lib/m365/graph.js).
$Perms = @(
  'Team.ReadBasic.All',                    # GET /teams/{id}
  'Channel.Create',                        # POST /teams/{id}/channels
  'ChannelSettings.ReadWrite.All',         # PATCH channel layoutType = chat (threads)
  'ChannelMember.ReadWrite.All',           # private-channel membership
  'TeamMember.ReadWrite.All',              # publish deal channel to the PE Deals team
  'TeamsAppInstallation.ReadWriteForTeam.All', # install the Deal Dashboard bot app
  'Group.ReadWrite.All',                   # create/read deal access + tag security groups
  'GroupMember.ReadWrite.All',             # manage group membership
  'Sites.ReadWrite.All',                   # resolve the team's SharePoint drive
  'Files.ReadWrite.All'                    # create VDR folders + upload documents
)

Write-Host "Resolving Microsoft Graph application roles..." -ForegroundColor Cyan
$graphSp = az ad sp show --id $GraphAppId | ConvertFrom-Json

foreach ($p in $Perms) {
  $role = $graphSp.appRoles | Where-Object { $_.value -eq $p -and ($_.allowedMemberTypes -contains 'Application') }
  if (-not $role) { Write-Warning "  appRole not found (skipped): $p"; continue }
  Write-Host "  + $p  ($($role.id))"
  az ad app permission add --id $App --api $GraphAppId --api-permissions "$($role.id)=Role" --only-show-errors | Out-Null
}

Write-Host "Granting admin consent (Global Admin required)..." -ForegroundColor Cyan
az ad app permission admin-consent --id $App

Write-Host "Waiting 30s for app-role assignments to propagate..." -ForegroundColor Cyan
Start-Sleep -Seconds 30

# Re-test: trigger app-only provisioning on a deal and print the result.
$base = 'https://ca-dealhub-orch-green.niceisland-36753373.swedencentral.azurecontainerapps.io'
$deals = (Invoke-WebRequest -Uri "$base/api/deals" -TimeoutSec 25 -UseBasicParsing).Content | ConvertFrom-Json
$d = $deals | Where-Object { -not $_.teamsChannel } | Select-Object -First 1
if (-not $d) { $d = $deals | Select-Object -First 1 }
Write-Host "Testing app-only provisioning on: $($d.id) — $($d.company)" -ForegroundColor Cyan
$r = (Invoke-WebRequest -Uri "$base/api/deals/$($d.id)/teams/ensure" -Method POST -TimeoutSec 180 -UseBasicParsing).Content | ConvertFrom-Json
if ($r.ok) { Write-Host "SUCCESS — data room provisioned app-only. Teams URL: $($r.teamsUrl)" -ForegroundColor Green }
else { Write-Warning "Still failing: $($r.error)" }
