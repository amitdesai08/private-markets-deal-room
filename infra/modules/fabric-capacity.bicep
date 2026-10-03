@description('Azure region for the Microsoft Fabric capacity.')
param location string

@description('Globally unique name of the Microsoft Fabric capacity.')
param capacityName string

@description('Microsoft Fabric capacity SKU.')
param capacitySku string

@description('Microsoft Entra user principal names that administer the Fabric capacity.')
param capacityAdministrators array

resource capacity 'Microsoft.Fabric/capacities@2023-11-01' = {
  name: capacityName
  location: location
  tags: {
    application: 'private-markets-deal-room'
    component: 'fabric-iq'
    environment: 'demo'
  }
  sku: {
    name: capacitySku
    tier: 'Fabric'
  }
  properties: {
    administration: {
      members: capacityAdministrators
    }
  }
}

output capacityId string = capacity.id
output capacityName string = capacity.name