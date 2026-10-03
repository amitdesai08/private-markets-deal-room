targetScope = 'subscription'

@description('Azure region for the Fabric capacity and its resource group.')
param location string = 'swedencentral'

@description('Resource group dedicated to the Fabric demo capacity.')
param resourceGroupName string = 'rg-deal-room-data'

@description('Globally unique name of the Microsoft Fabric capacity.')
@minLength(3)
@maxLength(63)
param capacityName string = 'dealroomfabric'

@description('Microsoft Fabric capacity SKU.')
@allowed([
  'F2'
])
param capacitySku string = 'F2'

@description('Microsoft Entra user principal names that administer the Fabric capacity.')
@minLength(1)
param capacityAdministrators array

resource fabricResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    application: 'private-markets-deal-room'
    component: 'fabric-iq'
    environment: 'demo'
  }
}

module fabricCapacity 'modules/fabric-capacity.bicep' = {
  name: 'fabric-capacity-${uniqueString(subscription().id, resourceGroupName, capacityName)}'
  scope: fabricResourceGroup
  params: {
    capacityAdministrators: capacityAdministrators
    capacityName: capacityName
    capacitySku: capacitySku
    location: location
  }
}

output capacityId string = fabricCapacity.outputs.capacityId
output capacityName string = fabricCapacity.outputs.capacityName
output resourceGroupName string = fabricResourceGroup.name