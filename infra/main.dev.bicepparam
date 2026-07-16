using './main.bicep'

// ─── DEV ─────────────────────────────────────────────────────────────────────
// Fast, public dev deploy. Hardening toggles off so you can iterate and redeploy.

param location = 'swedencentral'
param locationShort = 'swc'
param workload = 'dealhub'
param environmentName = 'dev'
param costCenter = 'private-markets'

param openAiDeployments = [
  {
    name: 'gpt-5-mini'
    model: { format: 'OpenAI', name: 'gpt-5-mini', version: '2025-08-07' }
    sku: { name: 'GlobalStandard', capacity: 30 }
  }
  {
    name: 'gpt-5-nano'
    model: { format: 'OpenAI', name: 'gpt-5-nano', version: '2025-08-07' }
    sku: { name: 'GlobalStandard', capacity: 30 }
  }
  {
    name: 'text-embedding-3-large'
    model: { format: 'OpenAI', name: 'text-embedding-3-large', version: '1' }
    sku: { name: 'Standard', capacity: 30 }
  }
]

param appModelDeployment = 'gpt-5-mini'

param searchSku = 'basic'
// Azure AI Search is UNUSED by the app (~$75/mo standing cost). Kept true here to
// avoid an unattended deletion on redeploy; set to false to remove it and save.
param deploySearch = true
// Cap Log Analytics ingestion at 1 GB/day in dev (well above actual usage). -1 = unlimited.
param logAnalyticsDailyQuotaGb = 1
param storageSku = 'Standard_LRS'

// Fabric needs an admin — leave empty to skip, or add a UPN/objectId to provision.
param deployFabric = true
param fabricSkuName = 'F2'
param fabricAdminMembers = []

// APIM Developer SKU (~30-45 min). Off in dev for fast/cheap inner-loop deploys
// (the AI Gateway isn't required by the app or Teams). Prod keeps it on.
param deployApim = false
param apimSkuName = 'Developer'
param apimPublisherEmail = 'deal-room-platform@contoso.com'
param apimPublisherName = 'Private Markets Deal Room'

param orchestratorImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Teams interface Container App (ca-dealhub-teams). The image is rolled out
// separately after infra (like the orchestrator), so this stays portable.
param deployTeamsApp = true

// Orchestrator MUST stay single-replica: it holds the M365 delegated token in
// memory and a single writer avoids datastore races.
param orchestratorMinReplicas = 1
param orchestratorMaxReplicas = 1

// Teams tab SSO (per-user context) + in-channel bot. IDs are non-secret; the
// matching secrets (teamsTabClientSecret / botAppPassword / m365ClientSecret) are
// passed at deploy time (--parameters name=value) or sourced from Key Vault — never git.
param teamsTabClientId = ''   // Entra app (client) id for the Teams tab SSO
param deployBot = false        // set true (with botAppId + deployTeamsApp) to register the Azure Bot
param botAppId = ''            // MSA App id backing the Teams bot
param botAppType = 'MultiTenant'

// M365 channel/VDR provisioning (org-catalog app id is NOT a secret; group name is configurable).
param teamsAppCatalogId = ''   // org app-catalog id (per tenant; from the Teams admin center)
param m365PublishGroup = 'Private Equity Deals'

// ─────────────────────────── CUTOVER SWITCHES ───────────────────────────
// The VNet / private-endpoint posture is STAGED and inert while these stay off.
// To CUT OVER to the private (VNet-integrated) topology on command:
//   1. enablePrivateEndpoints = true   // VNet-integrates the CA env (snet-cae) + creates
//                                       // private endpoints + sets publicNetworkAccess =
//                                       // Disabled on Cosmos / Storage / Key Vault / Foundry.
//   2. deploySearch            = false // drop the unused AI Search (~$75/mo) in the same
//                                       // maintenance window (bundled cost cutover).
// PREREQUISITE (immutable env): an existing CA env cannot gain vnetConfiguration in place —
// DELETE cae-* + both container apps FIRST, then deploy. Keep Cosmos publicNetworkAccess =
// Enabled until private endpoints + DNS are confirmed. Full runbook: docs/OPERATIONS-PLAN.md.
// Leave both at the safe values below for routine (non-cutover) deploys.
param enablePrivateEndpoints = false
param keyVaultPurgeProtection = false

// Live Microsoft Fabric / OneLake market-intelligence binding (external workspace).
// Off by default — the app uses seeded market intel. Set fabricLive=true and fill
// the binding to point at your own Fabric workspace (the UAMI needs a workspace role).
param fabricLive = false
param fabricSqlEndpoint = ''
param fabricSqlDatabase = 'deal_room_starter'
param fabricWorkspace = 'Deal Room'
param fabricLakehouse = 'deal_room_starter'
param onelakeWorkspaceId = ''
param onelakeLakehouseId = ''
