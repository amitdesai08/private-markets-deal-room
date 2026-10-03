//==============================================================================
//  dealhub · AI domain — Foundry account + project, model deployments,
//  Document Intelligence, Content Safety, Speech, AI Search
//  RG: rg-dealhub-ai-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param workload string
param environmentName string
param suffix string
param tags object
param enablePrivateEndpoints bool
param searchSku string
@description('Provision Azure AI Search for Foundry IQ knowledge retrieval. Off by default for lean deployments.')
param deploySearch bool = false
param openAiDeployments array
@description('Principal ID of the core UAMI granted data-plane access to the AI services.')
param uamiPrincipalId string
@description('Foundry IQ knowledge base name. Empty disables the native Foundry IQ tool connection.')
param foundryIqKnowledgeBase string = ''
@description('Azure AI Search knowledge-base API version used by the Foundry IQ MCP endpoint.')
param foundryIqApiVersion string = '2026-08-01-preview'
@description('Published Microsoft Fabric IQ MCP endpoint. Empty disables the native Fabric IQ tool connection.')
param fabricIqServerUrl string = ''
@allowed([ 'DataAgent', 'Ontology', 'SemanticModel' ])
param fabricIqTargetKind string = 'DataAgent'
param fabricIqTargetName string = ''
param fabricIqWorkspaceId string = ''
param fabricIqItemId string = ''
param enableAgent365Logging bool = true

var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
var pnaSearch = enablePrivateEndpoints ? 'disabled' : 'enabled'
var netDefaultAction = enablePrivateEndpoints ? 'Deny' : 'Allow'
var foundryProjectEndpoint = 'https://aif-${workload}-${environmentName}-${suffix}.services.ai.azure.com/api/projects/proj-${workload}-${environmentName}'

var roleIds = {
  cognitiveServicesOpenAIUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
  cognitiveServicesUser: 'a97b65f3-24c7-4388-baec-2e87135dc908'
  searchIndexDataReader: '1407120a-92aa-4202-b7e9-c0e197c71c8f'
}

// Microsoft Foundry (AIServices account with project management) — hosts Azure OpenAI deployments
resource foundry 'Microsoft.CognitiveServices/accounts@2026-03-15-preview' = {
  name: 'aif-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    allowProjectManagement: true
    a365LoggingEnabled: enableAgent365Logging
    customSubDomainName: 'aif-${workload}-${environmentName}-${suffix}'
    disableLocalAuth: false
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: 'proj-${workload}-${environmentName}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Deal Room (${environmentName})'
    description: 'Hosts the Deal Orchestrator and specialist deal-flow agents.'
  }
}

// Grounding with Bing — powers the news-scout agent's real-time M&A catalyst search.
resource bing 'Microsoft.Bing/accounts@2020-06-10' = {
  name: 'bing-${workload}-${environmentName}-${suffix}'
  location: 'global'
  kind: 'Bing.Grounding'
  sku: { name: 'G1' }
  properties: {}
}

// Foundry project connection so agents can call Grounding with Bing (ApiKey auth).
resource bingConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'bingGrounding'
  properties: {
    category: 'ApiKey'
    authType: 'ApiKey'
    target: 'https://api.bing.microsoft.com/'
    credentials: { key: bing.listKeys().key1 }
    isSharedToAll: true
    metadata: {
      type: 'bing_grounding'
      ResourceId: bing.id
      ApiType: 'Azure'
      location: 'global'
    }
  }
}

// Native Work IQ keeps Microsoft 365 retrieval user-scoped through delegated Entra tokens.
resource workIqConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'deal-room-work-iq'
  properties: {
    category: 'RemoteTool'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: 'https://workiq.svc.cloud.microsoft/mcp'
    audience: 'fdcc1f02-fc51-4226-8753-f668596af7f7'
    isSharedToAll: false
  }
}

// Foundry's native Work IQ toolbox tool resolves the Microsoft-hosted A2A agent card.
resource workIqNativeConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'deal-room-work-iq-native'
  properties: {
    category: 'RemoteA2A'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: 'https://workiq.svc.cloud.microsoft/a2a/'
    audience: 'fdcc1f02-fc51-4226-8753-f668596af7f7'
    isSharedToAll: false
    metadata: {
      ApiType: 'Azure'
      type: 'work_iq_preview'
    }
  }
}

resource workIqA2aConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'deal-room-work-iq-a2a'
  properties: {
    category: 'RemoteA2A'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: '${foundryProjectEndpoint}/agents/deal-room-work-iq/endpoint/protocols/a2a'
    audience: 'https://ai.azure.com'
    isSharedToAll: false
    metadata: {
      ApiType: 'Azure'
      type: 'custom_A2A'
    }
  }
}

resource webIqA2aConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'deal-room-web-iq-a2a'
  properties: {
    category: 'RemoteA2A'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: '${foundryProjectEndpoint}/agents/deal-room-web-iq/endpoint/protocols/a2a'
    audience: 'https://ai.azure.com'
    isSharedToAll: false
    metadata: {
      ApiType: 'Azure'
      type: 'custom_A2A'
    }
  }
}

resource foundryIqA2aConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'deal-room-foundry-iq-a2a'
  properties: {
    category: 'RemoteA2A'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: '${foundryProjectEndpoint}/agents/deal-room-foundry-iq/endpoint/protocols/a2a'
    audience: 'https://ai.azure.com'
    isSharedToAll: false
    metadata: {
      ApiType: 'Azure'
      type: 'custom_A2A'
    }
  }
}

resource fabricIqA2aConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-04-01-preview' = {
  parent: foundryProject
  name: 'deal-room-fabric-iq-a2a'
  properties: {
    category: 'RemoteA2A'
    #disable-next-line BCP036
    authType: 'UserEntraToken'
    target: '${foundryProjectEndpoint}/agents/deal-room-fabric-iq/endpoint/protocols/a2a'
    audience: 'https://ai.azure.com'
    isSharedToAll: false
    metadata: {
      ApiType: 'Azure'
      type: 'custom_A2A'
    }
  }
}

resource foundryIqConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-10-01-preview' = if (deploySearch && !empty(foundryIqKnowledgeBase)) {
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

resource fabricIqConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-10-01-preview' = if (!empty(fabricIqServerUrl)) {
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

@batchSize(1)
resource modelDeployments 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = [
  for d in openAiDeployments: {
    parent: foundry
    name: d.name
    sku: {
      name: d.sku.name
      capacity: d.sku.capacity
    }
    properties: {
      model: {
        format: d.model.format
        name: d.model.name
        version: d.model.version
      }
    }
  }
]

resource docIntelligence 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'di-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'di-${workload}-${environmentName}-${suffix}'
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource contentSafety 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'cs-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'ContentSafety'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'cs-${workload}-${environmentName}-${suffix}'
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource speech 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'spch-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'SpeechServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'spch-${workload}-${environmentName}-${suffix}'
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource search 'Microsoft.Search/searchServices@2023-11-01' = if (deploySearch) {
  name: 'srch-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  sku: { name: searchSku }
  identity: { type: 'SystemAssigned' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    semanticSearch: 'standard'
    publicNetworkAccess: pnaSearch
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http401WithBearerChallenge'
      }
    }
  }
}

// RBAC — core UAMI gets least-privilege data-plane access to the AI services.
resource raFoundryOpenAIUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uamiPrincipalId, roleIds.cognitiveServicesOpenAIUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesOpenAIUser)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raFoundryCogUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uamiPrincipalId, roleIds.cognitiveServicesUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// UAMI can call the Content Safety data plane (text:analyze) to screen chat input.
resource raContentSafetyUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(contentSafety.id, uamiPrincipalId, roleIds.cognitiveServicesUser)
  scope: contentSafety
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raSearchIndexReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySearch) {
  name: guid(search.id, uamiPrincipalId, roleIds.searchIndexDataReader)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchIndexDataReader)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raFoundryProjectSearchReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySearch) {
  name: guid(search.id, foundryProject.id, roleIds.searchIndexDataReader)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchIndexDataReader)
    principalId: foundryProject.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Foundry IQ answer synthesis calls the model as the Search service identity.
resource raSearchFoundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySearch) {
  name: guid(foundry.id, search.id, roleIds.cognitiveServicesUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: search!.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output foundryId string = foundry.id
output foundryAccountName string = foundry.name
output foundryEndpoint string = foundry.properties.endpoint
output foundryProjectName string = foundryProject.name
// The data-plane project endpoint the agents + Responses API use (agents SDK,
// lib/dealAgent.js / lib/personaAgent.js, and scripts/create_*_agents.py).
output foundryProjectEndpoint string = foundryProjectEndpoint
output deployedModels array = [for (d, i) in openAiDeployments: d.name]
output documentIntelligenceEndpoint string = docIntelligence.properties.endpoint
output contentSafetyEndpoint string = contentSafety.properties.endpoint
output bingConnectionId string = bingConnection.id
output workIqConnectionId string = workIqConnection.id
output workIqNativeConnectionId string = workIqNativeConnection.id
output workIqA2aConnectionId string = workIqA2aConnection.id
output webIqA2aConnectionId string = webIqA2aConnection.id
output foundryIqA2aConnectionId string = foundryIqA2aConnection.id
output fabricIqA2aConnectionId string = fabricIqA2aConnection.id
output foundryIqConnectionId string = (deploySearch && !empty(foundryIqKnowledgeBase)) ? foundryIqConnection.id : ''
output fabricIqConnectionId string = !empty(fabricIqServerUrl) ? fabricIqConnection.id : ''
output speechEndpoint string = speech.properties.endpoint
output searchId string = deploySearch ? search.id : ''
output searchName string = deploySearch ? search.name : ''
output searchEndpoint string = deploySearch ? 'https://${search.name}.search.windows.net' : ''
