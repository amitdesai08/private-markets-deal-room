targetScope = 'resourceGroup'

@description('Existing Microsoft Foundry account name.')
param foundryAccountName string

@description('Existing Microsoft Foundry project name.')
param foundryProjectName string

@description('Existing Azure AI Search service name.')
param searchServiceName string

@description('Existing Foundry IQ knowledge base name.')
param foundryIqKnowledgeBase string

@description('Azure AI Search knowledge-base API version.')
param foundryIqApiVersion string = '2026-08-01-preview'

@description('Published Microsoft Fabric IQ MCP endpoint.')
param fabricIqServerUrl string
@description('Fabric item type targeted by the MCP endpoint.')
@allowed([ 'DataAgent', 'Ontology', 'SemanticModel' ])
param fabricIqTargetKind string = 'DataAgent'
param fabricIqTargetName string = ''
param fabricIqWorkspaceId string = ''
param fabricIqItemId string = ''

var searchIndexDataReaderRoleId = '1407120a-92aa-4202-b7e9-c0e197c71c8f'

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: foundry
  name: foundryProjectName
}

resource search 'Microsoft.Search/searchServices@2025-05-01' existing = {
  name: searchServiceName
}

resource foundryIqConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-10-01-preview' = {
  parent: foundryProject
  name: 'deal-room-foundry-iq'
  properties: {
    category: 'RemoteTool'
    #disable-next-line BCP036
    authType: 'ProjectManagedIdentity'
    target: 'https://${search.name}.search.windows.net/knowledgebases/${foundryIqKnowledgeBase}/mcp?api-version=${foundryIqApiVersion}'
    audience: 'https://search.azure.com/'
    isSharedToAll: true
    metadata: {
      ApiType: 'Azure'
      type: 'foundry_iq'
    }
  }
}

resource fabricIqConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-10-01-preview' = {
  parent: foundryProject
  name: 'deal-room-fabric-iq'
  properties: {
    category: 'RemoteTool'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: fabricIqServerUrl
    audience: 'https://analysis.windows.net/powerbi/api'
    isSharedToAll: false
    metadata: {
      ApiType: 'Azure'
      type: 'fabric_iq_preview'
      targetKind: fabricIqTargetKind
      targetName: fabricIqTargetName
      workspaceId: fabricIqWorkspaceId
      itemId: fabricIqItemId
    }
  }
}

resource foundryProjectSearchReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, foundryProject.id, searchIndexDataReaderRoleId)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
    principalId: foundryProject.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output foundryIqConnectionId string = foundryIqConnection.id
output foundryIqServerUrl string = foundryIqConnection.properties.target
output fabricIqConnectionId string = fabricIqConnection.id
output fabricIqServerUrl string = fabricIqConnection.properties.target
