using './fabric-demo.bicep'

param location = 'swedencentral'
param resourceGroupName = 'rg-deal-room-data'
param capacityName = 'dealroomfabric'
param capacitySku = 'F2'
param capacityAdministrators = [
  'desaiamit@MngEnvMCAP336646.onmicrosoft.com'
]