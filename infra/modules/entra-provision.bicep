//==============================================================================
//  dealhub · ADVANCED — in-deployment Entra provisioning via a deploymentScript.
//  Runs scripts/provision-entra.sh inside an Azure CLI container to create the
//  Teams SSO / M365 / bot / MCP app registrations during `az deployment sub create`.
//
//  PREREQUISITE: `provisioningIdentityResourceId` must be a user-assigned managed
//  identity that has been granted Microsoft Graph **Application.ReadWrite.All** and
//  **AppRoleAssignment.ReadWrite.All** (admin-consented) — this is a one-time
//  bootstrap an admin performs so the script can create apps + grant consent.
//
//  NOTE: this creates the app registrations during the deploy and writes their IDs
//  to the script outputs. Wiring those IDs into the already-deployed Container Apps
//  is a second pass (re-run with the generated params) — for a single admin-run
//  flow prefer scripts/deploy.ps1 / deploy.sh with the `provision` identity path.
//==============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param workload string
param environmentName string

@description('User-assigned managed identity (resource ID) with Microsoft Graph app-provisioning permissions.')
param provisioningIdentityResourceId string

@description('FQDN of the Teams Container App (sets the SSO identifier URI).')
param teamsFqdn string
@description('FQDN of the orchestrator Container App (M365 callback).')
param orchFqdn string

@description('Raw URL of the provisioning script (bash).')
param scriptUri string

resource entraProvision 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: 'ds-entra-${workload}-${environmentName}'
  location: location
  tags: tags
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${provisioningIdentityResourceId}': {}
    }
  }
  properties: {
    azCliVersion: '2.61.0'
    primaryScriptUri: scriptUri
    arguments: '--workload ${workload} --env ${environmentName} --teams-fqdn ${teamsFqdn} --orch-fqdn ${orchFqdn}'
    timeout: 'PT30M'
    retentionInterval: 'PT1H'
    cleanupPreference: 'OnSuccess'
  }
}

output deploymentScriptName string = entraProvision.name
