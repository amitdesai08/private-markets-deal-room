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

// Entra security groups → app role, resolved from the token 'groups' claim (requires
// groupMembershipClaims = SecurityGroup on the tab app registration). Created 2026-07-27.
// Membership in one of these grants the app role AND (once wired) the deal Team + channels.
param adminGroupIds = 'fd59b346-caf3-4fb3-a007-04bb5620c473'     // DealRoom-Admins
param partnerGroupIds = '8dd70eea-63fc-4bad-b3c9-5a739c56f308'   // DealRoom-Partners
param dealTeamGroupIds = 'bfaefdc0-571d-415c-85a4-04d7989c843a'  // DealRoom-DealTeam
param analystGroupIds = 'bc7a96a4-abc9-4014-b71a-11127ca9dacd'   // DealRoom-Analysts
// Territory (region) groups → base regions. Grouped territory West Coast = NW + SW.
param regionGroupIds = '{"d35bd3a2-7823-4fd0-a1f7-398f4a5a111c":["northeast"],"4f5fb7c1-b545-4e9a-8a66-f1d52356aa16":["southeast"],"135d84b7-5e88-4105-88ff-ecade1efb0a9":["midwest"],"e3d789c7-cc02-431f-a364-3028dc186396":["southcentral"],"cbd8f4e9-48c6-4771-a3de-501ca4f948a5":["northwest"],"9392a429-d0cb-4ce6-986c-4c9639828432":["southwest"],"89c5e3de-e97c-4e33-a5eb-06948fbc9aea":["northwest","southwest"]}'

// ─────────────────────────── CUTOVER SWITCHES ───────────────────────────
// STATE (2026-07-26): dev is ALREADY on the private topology, but it was cut over
// SIDE-BY-SIDE (blue/green) rather than via this param's in-place recreate path:
//   • A NEW VNet-integrated env `cae-dealhub-green-swc` (snet-cae) + app
//     `ca-dealhub-orch-green` were stood up imperatively; the Teams app's
//     SHARED_BACKEND_URL was repointed to green (Teams FQDN unchanged).
//   • Cosmos private endpoint `pe-cosmos-dealhub-dev` + private DNS zone
//     `privatelink.documents.azure.com` were created; Cosmos publicNetworkAccess = Disabled.
//   • The old blue orch app was deleted; blue env `cae-dealhub-dev-swc` is KEPT (it hosts
//     the Teams app). These green/PE/DNS resources are managed OUT-OF-BAND (not in this
//     template yet) — reconciling them into IaC requires either renaming green to the
//     canonical `ca-dealhub-orch-*` or adopting them, and is a separate change.
// Therefore enablePrivateEndpoints STAYS false here: flipping it and redeploying would try
// to VNet-join the EXISTING (immutable) blue env — forcing a recreate that destroys the live
// Teams app. Do NOT flip it against the current dev without a maintenance window + the runbook.
//
// The in-place cutover path (if ever rebuilding dev from scratch):
//   1. enablePrivateEndpoints = true   // VNet-integrates the CA env (snet-cae) + creates
//                                       // private endpoints + sets publicNetworkAccess =
//                                       // Disabled on Cosmos / Storage / Key Vault / Foundry.
//   2. deploySearch            = false // drop the unused AI Search (~$75/mo) in the same
//                                       // maintenance window (bundled cost cutover).
// PREREQUISITE (immutable env): an existing CA env cannot gain vnetConfiguration in place —
// DELETE cae-* + both container apps FIRST, then deploy. Keep Cosmos publicNetworkAccess =
// Enabled until private endpoints + DNS are confirmed. Full runbook: docs/operations/OPERATIONS-PLAN.md.
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
