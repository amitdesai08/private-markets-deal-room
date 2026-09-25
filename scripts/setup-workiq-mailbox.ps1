#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Creates and scopes a shared Microsoft 365 mailbox for Work IQ mail search.

.DESCRIPTION
  Idempotently creates a shared mailbox and a mail-enabled security group, adds the
  mailbox to that group, and restricts the supplied Entra application's Mail.Read
  application permission to the group with an Exchange Application Access Policy.
  Optionally sends fictional demo messages through the signed-in administrator's
  delegated Microsoft Graph Mail.Send permission.

.EXAMPLE
  ./scripts/setup-workiq-mailbox.ps1 `
    -Domain contoso.onmicrosoft.com `
    -AppId 00000000-0000-0000-0000-000000000000 `
    -AdminUser admin@contoso.onmicrosoft.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Domain,

  [Parameter(Mandatory = $true)]
  [guid]$AppId,

  [string]$AdminUser = '',
  [string]$MailboxAlias = 'dealroom.workiq',
  [string]$MailboxName = 'Deal Room Work IQ',
  [string]$AccessGroupAlias = 'dealroom-workiq-access',
  [switch]$UseDeviceCode
)

$ErrorActionPreference = 'Stop'
$mailboxAddress = "$MailboxAlias@$Domain"
$groupAddress = "$AccessGroupAlias@$Domain"
$policyDescription = 'Restrict Deal Room Work IQ Mail.Read to its shared mailbox.'

if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
  Write-Host 'Installing ExchangeOnlineManagement for the current user...' -ForegroundColor Cyan
  Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force -AllowClobber
}

Import-Module ExchangeOnlineManagement
$connectArgs = @{ ShowBanner = $false }
if ($UseDeviceCode) { $connectArgs.Device = $true }
elseif ($AdminUser) { $connectArgs.UserPrincipalName = $AdminUser }
Connect-ExchangeOnline @connectArgs

try {
  $mailbox = Get-EXOMailbox -Identity $mailboxAddress -ErrorAction SilentlyContinue
  if (-not $mailbox) {
    Write-Host "Creating shared mailbox $mailboxAddress..." -ForegroundColor Cyan
    $mailbox = New-Mailbox -Shared -Name $MailboxName -DisplayName $MailboxName -Alias $MailboxAlias -PrimarySmtpAddress $mailboxAddress
  } else {
    Write-Host "Shared mailbox already exists: $mailboxAddress"
  }

  $group = Get-DistributionGroup -Identity $groupAddress -ErrorAction SilentlyContinue
  if (-not $group) {
    Write-Host "Creating mail-enabled security group $groupAddress..." -ForegroundColor Cyan
    $group = New-DistributionGroup -Name 'Deal Room Work IQ Mail Access' -Alias $AccessGroupAlias -PrimarySmtpAddress $groupAddress -Type Security
  } else {
    Write-Host "Access group already exists: $groupAddress"
  }

  $member = Get-DistributionGroupMember -Identity $groupAddress -ResultSize Unlimited |
    Where-Object { $_.PrimarySmtpAddress -eq $mailboxAddress }
  if (-not $member) {
    Add-DistributionGroupMember -Identity $groupAddress -Member $mailboxAddress -BypassSecurityGroupManagerCheck
    Write-Host 'Added the shared mailbox to the Work IQ access group.'
  }

  $policies = @(Get-ApplicationAccessPolicy | Where-Object { $_.AppId -eq [string]$AppId })
  $matchingPolicy = $policies | Where-Object {
    $_.AccessRight -eq 'RestrictAccess' -and (
      $_.PolicyScopeGroupId -eq $groupAddress -or
      $_.ScopeName -eq $group.DisplayName -or
      $_.Description -eq $policyDescription
    )
  }
  if (-not $matchingPolicy) {
    if ($policies.Count) {
      $existing = $policies | ForEach-Object { $_.PolicyScopeGroupId ?? $_.ScopeName ?? $_.Identity }
      throw "App $AppId already has an application access policy scoped to: $($existing -join ', '). Review it before changing mailbox scope."
    }
    New-ApplicationAccessPolicy -AppId $AppId -PolicyScopeGroupId $groupAddress -AccessRight RestrictAccess -Description $policyDescription | Out-Null
    Write-Host 'Created the restrictive Exchange application access policy.'
  } else {
    Write-Host 'Restrictive Exchange application access policy already exists.'
  }

  $policyTest = Test-ApplicationAccessPolicy -Identity $mailboxAddress -AppId $AppId
  Write-Host "Policy test for ${mailboxAddress}: $($policyTest.AccessCheckResult)" -ForegroundColor Green
} finally {
  Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Work IQ mailbox is ready.' -ForegroundColor Green
Write-Host "Mailbox: $mailboxAddress"
Write-Host "Set WORKIQ_MAILBOX_USER=$mailboxAddress on the orchestrator deployment."
Write-Host 'Run scripts/seed-workiq-mailbox.ps1 separately if the mailbox needs demo messages.'
Write-Warning 'A new Exchange application access policy can take over an hour to propagate.'