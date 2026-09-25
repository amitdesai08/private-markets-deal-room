#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Sends fictional Deal Room messages to an already-provisioned Work IQ mailbox.

.DESCRIPTION
  Uses one Microsoft Graph device-code sign-in with delegated Mail.Send. Keeping this
  separate from Exchange provisioning avoids chained browser authentication prompts.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$MailboxAddress
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Users.Actions)) {
  Write-Host 'Installing Microsoft.Graph.Users.Actions for the current user...' -ForegroundColor Cyan
  Install-Module Microsoft.Graph.Users.Actions -Scope CurrentUser -Force -AllowClobber
}

Import-Module Microsoft.Graph.Users.Actions
Connect-MgGraph -Scopes 'Mail.Send' -UseDeviceCode -NoWelcome
try {
  $messages = @(
    @{ Subject = 'Helvetia - revised debt commitment and hedge indication'; Body = 'The updated senior commitment is $384M at approximately 4.2x. The indication also covers the CHF/EUR hedge and covenant headroom.' },
    @{ Subject = 'Helvetia - AI readiness findings for IC'; Body = 'LIMS remains fragmented across three lab sites and roughly 40% of instrument telemetry is not captured. Keep the digital uplift conditional until lineage and integration are validated.' },
    @{ Subject = 'Helvetia - reagent second-source qualification'; Body = 'Vendor B is qualified at a 6% unit-cost premium with an eight-week lead time. The second source closes the principal reagent concentration risk.' }
  )
  foreach ($message in $messages) {
    $body = @{
      Message = @{
        Subject = $message.Subject
        Body = @{ ContentType = 'Text'; Content = $message.Body }
        ToRecipients = @(@{ EmailAddress = @{ Address = $MailboxAddress } })
      }
      SaveToSentItems = $true
    }
    Send-MgUserMail -UserId 'me' -BodyParameter $body
    Write-Host "Sent demo message: $($message.Subject)"
  }
} finally {
  Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
}