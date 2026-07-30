<#
.SYNOPSIS
  Publishes / installs the "Deal Room - Beta" Teams app and points the beta channel tab at it.

.DESCRIPTION
  Runs unattended using the sp-dealroom-teams-automation service principal.
  The credential is read from %USERPROFILE%\.dealroom\automation.json, where the
  client secret is DPAPI-encrypted (decryptable only by the creating user on the
  creating machine).

  Steps:
    1. Acquire an app-only Microsoft Graph token.
    2. Find the beta app in the org catalog; upload the package if it is absent.
    3. Install the app into the "Private Equity Deals" team.
    4. Add a channel tab bound to the app, and remove the interim Website tab.

  NOTE: step 2 (first-time upload) is refused by the Teams service for app-only
  callers in this tenant. If that happens the script tells you to upload the zip
  once by hand; every later run, and steps 3-4, are fully unattended.

.EXAMPLE
  pwsh ./teams-app/scripts/publish-beta.ps1
#>
[CmdletBinding()]
param(
  [string]$TeamId = '1c85ef26-2d94-4445-9d12-377f019f01d1',
  [string]$ChannelId = '19:0c1c9fb56f264550806539d65eab5c5e@thread.tacv2',
  [string]$AppShortName = 'Deal Room - Beta',
  [string]$ContentUrl = 'https://ca-dealhub-teams-beta.ambitiousforest-08192d93.swedencentral.azurecontainerapps.io',
  [string]$PackagePath = "$PSScriptRoot/../package-beta/deal-room-teams-beta.zip",
  [string]$CredentialPath = "$env:USERPROFILE/.dealroom/automation.json"
)

$ErrorActionPreference = 'Stop'
$graph = 'https://graph.microsoft.com/v1.0'

function Get-GraphToken {
  param([string]$Path)
  if (-not (Test-Path $Path)) { throw "Credential file not found: $Path" }
  $c = Get-Content $Path -Raw | ConvertFrom-Json
  $sec = $c.secretDpapi | ConvertTo-SecureString
  $plain = [System.Net.NetworkCredential]::new('', $sec).Password
  $resp = Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$($c.tenantId)/oauth2/v2.0/token" `
    -Body @{
      client_id     = $c.appId
      client_secret = $plain
      scope         = 'https://graph.microsoft.com/.default'
      grant_type    = 'client_credentials'
    }
  return $resp.access_token
}

$token = Get-GraphToken -Path $CredentialPath
$json = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$auth = @{ Authorization = "Bearer $token" }
Write-Host 'Acquired app-only Graph token.'

# --- 1. Locate the app in the org catalog -----------------------------------
$catalog = Invoke-RestMethod -Headers $auth `
  -Uri "$graph/appCatalogs/teamsApps?`$filter=distributionMethod eq 'organization'"
$app = $catalog.value | Where-Object { $_.displayName -eq $AppShortName } | Select-Object -First 1

if (-not $app) {
  Write-Host "'$AppShortName' is not in the org catalog. Attempting upload..."
  try {
    $app = Invoke-RestMethod -Method Post -Uri "$graph/appCatalogs/teamsApps" `
      -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/zip' } `
      -InFile (Resolve-Path $PackagePath).Path
    Write-Host "Uploaded. teamsAppId=$($app.id)"
  }
  catch {
    Write-Warning @"
Upload refused by the Teams service (app-only publishing is blocked in this tenant).
One-time manual step:
  Teams > Apps > Manage your apps > Upload an app > Upload a custom app
  File: $((Resolve-Path $PackagePath).Path)
Then re-run this script and the remaining steps will complete unattended.
"@
    return
  }
}
else {
  Write-Host "Found in catalog: $($app.displayName) ($($app.id))"
}

# --- 2. Install into the team ------------------------------------------------
$installed = Invoke-RestMethod -Headers $auth -Uri "$graph/teams/$TeamId/installedApps?`$expand=teamsApp"
if ($installed.value | Where-Object { $_.teamsApp.id -eq $app.id }) {
  Write-Host 'Already installed in the team.'
}
else {
  Invoke-RestMethod -Method Post -Uri "$graph/teams/$TeamId/installedApps" -Headers $json `
    -Body (@{ 'teamsApp@odata.bind' = "$graph/appCatalogs/teamsApps/$($app.id)" } | ConvertTo-Json)
  Write-Host 'Installed into the team.'
}

# --- 3. Add the tab, then drop the interim Website tab -----------------------
$tabs = Invoke-RestMethod -Headers $auth -Uri "$graph/teams/$TeamId/channels/$ChannelId/tabs?`$expand=teamsApp"

if ($tabs.value | Where-Object { $_.teamsApp.id -eq $app.id }) {
  Write-Host 'Tab already bound to the app.'
}
else {
  $body = @{
    displayName            = $AppShortName
    'teamsApp@odata.bind'  = "$graph/appCatalogs/teamsApps/$($app.id)"
    configuration          = @{
      entityId   = 'dealroom-home'
      contentUrl = $ContentUrl
      websiteUrl = $ContentUrl
    }
  } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Post -Uri "$graph/teams/$TeamId/channels/$ChannelId/tabs" -Headers $json -Body $body
  Write-Host 'Created app-backed tab.'
}

$stale = $tabs.value | Where-Object {
  $_.teamsApp.id -eq 'com.microsoft.teamspace.tab.web' -and $_.displayName -eq $AppShortName
}
foreach ($t in $stale) {
  Invoke-RestMethod -Method Delete -Headers $auth -Uri "$graph/teams/$TeamId/channels/$ChannelId/tabs/$($t.id)"
  Write-Host "Removed interim Website tab $($t.id)."
}

Write-Host 'Done.'
