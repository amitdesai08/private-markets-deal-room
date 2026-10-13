import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const FABRIC_API = 'https://api.fabric.microsoft.com/v1';
const POWER_BI_API = 'https://api.powerbi.com/v1.0/myorg';

export const EXPECTED_FABRIC_COUNTS = Object.freeze({
  'silver.dim_company': 15,
  'silver.fact_deal': 12,
  'bronze.bronze_diligence_findings': 59,
  'bronze.bronze_ic_approvals': 12,
  'bronze.bronze_sec_filings': 14,
  'silver.company_deal_links': 12,
  'bronze.company_filing_links': 14,
});

export function snapshotCounts(snapshot) {
  const financials = Object.values(snapshot.companyFinancials || {});
  return {
    'silver.dim_company': (snapshot.companies || []).length + (snapshot.comparableDeals || []).length,
    'silver.fact_deal': (snapshot.comparableDeals || []).length,
    'bronze.bronze_diligence_findings': (snapshot.benchmarkFindings || []).reduce(
      (total, finding) => total + Object.values(finding.byRisk || {}).reduce((sum, count) => sum + Number(count || 0), 0),
      0,
    ),
    'bronze.bronze_ic_approvals': (snapshot.icPrecedents || []).length,
    'bronze.bronze_sec_filings': financials.reduce((total, metrics) => total + Object.keys(metrics || {}).length, 0),
  };
}

export function assertSnapshotContract(snapshot) {
  const actual = snapshotCounts(snapshot);
  for (const [table, expected] of Object.entries(EXPECTED_FABRIC_COUNTS)) {
    if (table.includes('_links')) continue;
    if (actual[table] !== expected) throw new Error(`Fabric seed contract changed for ${table}: expected ${expected}, found ${actual[table]}`);
  }
  return actual;
}

export function ontologyMcpUrl(workspaceId, ontologyId) {
  return `${FABRIC_API}/mcp/dataPlane/workspaces/${workspaceId}/items/${ontologyId}/ontologyEndpoint`;
}

export function dataAgentMcpUrl(workspaceId, dataAgentId) {
  return `${FABRIC_API}/mcp/workspaces/${workspaceId}/dataagents/${dataAgentId}/agent`;
}

export function parseAzdValues(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replaceAll('\\"', '"');
    values[match[1].trim()] = value;
  }
  return values;
}

function bool(value) {
  return /^(1|true|yes)$/i.test(String(value || ''));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, AZURE_DEV_USER_AGENT: 'microsoft_foundry_skill', ...(options.env || {}) },
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function azJson(args) {
  const output = run('az', [...args, '-o', 'json']);
  return output ? JSON.parse(output) : null;
}

function azdValues() {
  return parseAzdValues(run('azd', ['env', 'get-values']));
}

function first(values, ...names) {
  for (const name of names) if (values[name] !== undefined && values[name] !== '') return values[name];
  return '';
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function token(resource) {
  return run('az', ['account', 'get-access-token', '--resource', resource, '--query', 'accessToken', '-o', 'tsv']);
}

class ApiClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async request(url, { method = 'GET', body, accepted = [200, 201, 202, 204] } = {}) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 429 && attempt < 4) {
        await sleep(Math.max(1000, Number(response.headers.get('retry-after') || 2) * 1000));
        continue;
      }
      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!accepted.includes(response.status)) {
        const detail = typeof data === 'string' ? data : JSON.stringify(data);
        throw new Error(`${method} ${url} returned ${response.status}: ${detail.slice(0, 1000)}`);
      }
      return { response, data };
    }
    throw new Error(`${method} ${url} remained throttled`);
  }

  async complete(result, terminal = ['Succeeded', 'Completed']) {
    if (result.response.status !== 202) return result.data;
    const location = result.response.headers.get('location');
    if (!location) throw new Error('Fabric accepted an operation without a Location header');
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const retryAfter = Math.min(30, Math.max(1, Number(result.response.headers.get('retry-after') || 5)));
      await sleep(retryAfter * 1000);
      const polled = await this.request(location);
      const status = polled.data?.status;
      if (terminal.includes(status)) return polled.data;
      if (['Failed', 'Cancelled'].includes(status)) throw new Error(`Fabric operation failed: ${JSON.stringify(polled.data)}`);
    }
    throw new Error(`Timed out waiting for Fabric operation ${location}`);
  }

  async pages(url) {
    const values = [];
    let next = url;
    while (next) {
      const page = await this.request(next);
      values.push(...(page.data?.value || []));
      next = page.data?.continuationUri || '';
    }
    return values;
  }
}

async function findCapacity(capacityName) {
  const client = new ApiClient(await token('https://analysis.windows.net/powerbi/api'));
  const result = await client.request(`${POWER_BI_API}/capacities`);
  const matches = (result.data?.value || []).filter((capacity) => capacity.displayName === capacityName);
  if (matches.length !== 1) throw new Error(`Expected one visible Fabric capacity named ${capacityName}; found ${matches.length}`);
  return matches[0];
}

export async function ensureWorkspace(client, displayName, capacityId) {
  const workspaces = await client.pages(`${FABRIC_API}/workspaces`);
  let workspace = workspaces.find((candidate) => candidate.displayName === displayName);
  let createdNow = false;
  if (!workspace) {
    const created = await client.request(`${FABRIC_API}/workspaces`, {
      method: 'POST',
      body: { displayName, capacityId, description: 'Deal Room simulated market intelligence and Fabric IQ assets.' },
    });
    workspace = created.data;
    createdNow = true;
  }
  if (!workspace?.id) throw new Error(`Fabric workspace ${displayName} was not returned after creation`);
  if (workspace.capacityId && workspace.capacityId !== capacityId) {
    throw new Error(`Workspace ${displayName} is assigned to another capacity; refusing to move an existing workspace`);
  }
  if (!createdNow && !workspace.capacityId) {
    const assigned = await client.request(`${FABRIC_API}/workspaces/${workspace.id}/assignToCapacity`, {
      method: 'POST',
      body: { capacityId },
    });
    await client.complete(assigned);
  }
  return workspace;
}

export async function ensureContributor(client, workspaceId, principalId) {
  if (!principalId) throw new Error('managedIdentityPrincipalId is required for Fabric workspace access');
  const url = `${FABRIC_API}/workspaces/${workspaceId}/roleAssignments`;
  const assignments = await client.pages(url);
  const existing = assignments.find((assignment) => assignment.principal?.id?.toLowerCase() === principalId.toLowerCase());
  if (!existing) {
    await client.request(url, {
      method: 'POST',
      body: { principal: { id: principalId, type: 'ServicePrincipal' }, role: 'Contributor' },
    });
    return;
  }
  if (!['Admin', 'Member', 'Contributor'].includes(existing.role)) {
    await client.request(`${url}/${existing.id}`, { method: 'PATCH', body: { role: 'Contributor' } });
  }
}

async function listItems(client, workspaceId) {
  return client.pages(`${FABRIC_API}/workspaces/${workspaceId}/items`);
}

async function ensureLakehouse(client, workspaceId, displayName) {
  const existing = (await listItems(client, workspaceId)).find((item) => item.type === 'Lakehouse' && item.displayName === displayName);
  if (existing) return existing;
  const result = await client.request(`${FABRIC_API}/workspaces/${workspaceId}/lakehouses`, {
    method: 'POST',
    body: {
      displayName,
      description: 'Deal Room simulated comparables, diligence benchmarks, IC precedents, and filing metrics.',
      creationPayload: { enableSchemas: true },
    },
  });
  await client.complete(result);
  const created = (await listItems(client, workspaceId)).find((item) => item.type === 'Lakehouse' && item.displayName === displayName);
  if (!created) throw new Error(`Lakehouse ${displayName} was not returned after creation`);
  return created;
}

async function waitForSqlEndpoint(client, workspaceId, lakehouseId) {
  const url = `${FABRIC_API}/workspaces/${workspaceId}/lakehouses/${lakehouseId}`;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const lakehouse = (await client.request(url)).data;
    const sql = lakehouse?.properties?.sqlEndpointProperties;
    if (sql?.provisioningStatus === 'Success' && sql.connectionString) return sql;
    if (sql?.provisioningStatus === 'Failed') throw new Error('Fabric lakehouse SQL endpoint provisioning failed');
    await sleep(10000);
  }
  throw new Error('Timed out waiting for Fabric lakehouse SQL endpoint');
}

export async function upsertItem(client, workspaceId, request) {
  const item = (await listItems(client, workspaceId)).find(
    (candidate) => candidate.type === request.type && candidate.displayName === request.displayName,
  );
  if (item) {
    const updated = await client.request(`${FABRIC_API}/workspaces/${workspaceId}/items/${item.id}/updateDefinition`, {
      method: 'POST',
      body: { definition: request.definition },
    });
    await client.complete(updated);
    return item;
  }
  const created = await client.request(`${FABRIC_API}/workspaces/${workspaceId}/items`, { method: 'POST', body: request });
  await client.complete(created);
  const result = (await listItems(client, workspaceId)).find(
    (candidate) => candidate.type === request.type && candidate.displayName === request.displayName,
  );
  if (!result) throw new Error(`${request.type} ${request.displayName} was not returned after creation`);
  return result;
}

async function generateArtifacts(workspaceId, lakehouseId, sqlEndpoint, sqlDatabase) {
  const output = await mkdtemp(join(tmpdir(), 'deal-room-fabric-'));
  const notebookPath = join(output, 'fabric-hydrate.ipynb');
  const agentPath = join(output, 'fabric-data-agent.json');
  const iqPath = join(output, 'fabric-iq.json');
  run(process.execPath, [join(repo, 'app/scripts/generate-fabric-hydration-notebook.mjs'), notebookPath, workspaceId, lakehouseId, sqlDatabase]);
  run(process.execPath, [join(repo, 'app/scripts/generate-fabric-data-agent-definition.mjs'), agentPath, workspaceId, lakehouseId]);
  run(process.execPath, [join(repo, 'app/scripts/generate-fabric-iq-definitions.mjs'), iqPath, workspaceId, lakehouseId, sqlEndpoint, sqlDatabase]);
  const [notebook, dataAgent, iq] = await Promise.all([
    readFile(notebookPath),
    readFile(agentPath, 'utf8').then(JSON.parse),
    readFile(iqPath, 'utf8').then(JSON.parse),
  ]);
  return { output, notebook, dataAgent, iq };
}

async function runHydration(client, workspaceId, notebookId) {
  const started = await client.request(`${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/DefaultJob/instances`, {
    method: 'POST',
    body: {},
    accepted: [202],
  });
  await client.complete(started, ['Completed', 'Succeeded']);
}

function setAzdValue(name, value) {
  run('azd', ['env', 'set', name, String(value)]);
}

function updateApp(values, binding) {
  const foundryAccountName = first(values, 'foundryAccountName', 'FOUNDRY_ACCOUNT_NAME');
  const foundryProjectName = first(values, 'foundryProjectName', 'FOUNDRY_PROJECT_NAME');
  const searchServiceName = first(values, 'searchName', 'AZURE_AI_SEARCH_NAME');
  const knowledgeBase = first(values, 'FOUNDRY_IQ_KNOWLEDGE_BASE', 'foundryIqKnowledgeBase');
  if (!foundryAccountName || !foundryProjectName) {
    throw new Error('Foundry account and project outputs are required for the Fabric IQ connection deployment');
  }
  const foundryResource = azJson(['resource', 'list', '--name', foundryAccountName, '--resource-type', 'Microsoft.CognitiveServices/accounts', '--query', '[0]']);
  if (!foundryResource?.resourceGroup) throw new Error(`Could not resolve resource group for Foundry account ${foundryAccountName}`);
  run('az', [
    'deployment', 'group', 'create',
    '--resource-group', foundryResource.resourceGroup,
    '--template-file', join(repo, 'infra/native-iq-connections.bicep'),
    '--parameters',
    `foundryAccountName=${foundryAccountName}`,
    `foundryProjectName=${foundryProjectName}`,
    `searchServiceName=${searchServiceName}`,
    `foundryIqKnowledgeBase=${knowledgeBase}`,
    `fabricIqServerUrl=${binding.fabricIqServerUrl}`,
    'fabricIqTargetKind=Ontology',
    'fabricIqTargetName=DealRoomInvestmentOntology',
    `fabricIqWorkspaceId=${binding.workspaceId}`,
    `fabricIqItemId=${binding.ontologyId}`,
  ]);
  const fabricIqConnectionId = `${foundryResource.id}/projects/${foundryProjectName}/connections/deal-room-fabric-iq`;
  setAzdValue('fabricIqConnectionId', fabricIqConnectionId);

  const apps = azJson(['containerapp', 'list', '--query', "[?tags.'azd-service-name'=='orchestrator'].{name:name,resourceGroup:resourceGroup}"]);
  if (!Array.isArray(apps) || apps.length !== 1) throw new Error(`Expected one azd orchestrator Container App; found ${apps?.length || 0}`);
  run('az', [
    'containerapp', 'update', '--name', apps[0].name, '--resource-group', apps[0].resourceGroup,
    '--set-env-vars',
    'FABRIC_LIVE=true',
    `FABRIC_SQL_ENDPOINT=${binding.sqlEndpoint}`,
    `FABRIC_SQL_DATABASE=${binding.sqlDatabase}`,
    `FABRIC_WORKSPACE=${binding.workspaceName}`,
    `FABRIC_LAKEHOUSE=${binding.lakehouseName}`,
    `FABRIC_DATA_AGENT_URL=${binding.dataAgentUrl}`,
    `ONELAKE_WORKSPACE_ID=${binding.workspaceId}`,
    `ONELAKE_LAKEHOUSE_ID=${binding.lakehouseId}`,
  ]);
}

export async function bootstrap({ dryRun = false, values } = {}) {
  values ||= { ...azdValues(), ...process.env };
  const enabled = bool(first(values, 'fabricBootstrapEnabled', 'HYDRATE_FABRIC_DEMO'));
  const snapshot = JSON.parse(await readFile(join(repo, 'app/data/fabric-cache.json'), 'utf8'));
  const sourceCounts = assertSnapshotContract(snapshot);
  const plan = {
    enabled,
    capacityName: first(values, 'fabricCapacityName', 'FABRIC_CAPACITY_NAME'),
    workspaceName: first(values, 'fabricBootstrapWorkspace', 'FABRIC_WORKSPACE') || 'Deal Room Fabric IQ',
    lakehouseName: first(values, 'fabricBootstrapLakehouse', 'FABRIC_LAKEHOUSE') || 'deal_room_starter',
    sourceCounts,
  };
  if (!enabled || dryRun) return { ...plan, mode: enabled ? 'dry-run' : 'skipped' };
  if (!plan.capacityName || plan.capacityName === 'not-deployed') {
    throw new Error('HYDRATE_FABRIC_DEMO=true requires deployFabric=true and at least one FABRIC_ADMIN_MEMBERS entry');
  }

  const client = new ApiClient(await token('https://api.fabric.microsoft.com'));
  const capacity = await findCapacity(plan.capacityName);
  const workspace = await ensureWorkspace(client, plan.workspaceName, capacity.id);
  await ensureContributor(client, workspace.id, first(values, 'managedIdentityPrincipalId', 'MANAGED_IDENTITY_PRINCIPAL_ID'));
  const lakehouse = await ensureLakehouse(client, workspace.id, plan.lakehouseName);
  const sql = await waitForSqlEndpoint(client, workspace.id, lakehouse.id);
  const artifacts = await generateArtifacts(workspace.id, lakehouse.id, sql.connectionString, plan.lakehouseName);
  try {
    const notebook = await upsertItem(client, workspace.id, {
      displayName: 'Hydrate Deal Room Demo',
      description: 'Idempotently replaces the five Deal Room demo-owned Delta tables.',
      type: 'Notebook',
      definition: {
        format: 'ipynb',
        parts: [{ path: 'notebook-content.ipynb', payload: artifacts.notebook.toString('base64'), payloadType: 'InlineBase64' }],
      },
    });
    await runHydration(client, workspace.id, notebook.id);
    const dataAgent = await upsertItem(client, workspace.id, { ...artifacts.dataAgent, type: 'DataAgent' });
    const semanticModel = await upsertItem(client, workspace.id, artifacts.iq.semanticModel);
    const ontology = await upsertItem(client, workspace.id, artifacts.iq.ontology);
    const binding = {
      workspaceId: workspace.id,
      workspaceName: plan.workspaceName,
      lakehouseId: lakehouse.id,
      lakehouseName: plan.lakehouseName,
      sqlEndpoint: sql.connectionString,
      sqlDatabase: plan.lakehouseName,
      dataAgentId: dataAgent.id,
      dataAgentUrl: dataAgentMcpUrl(workspace.id, dataAgent.id),
      semanticModelId: semanticModel.id,
      ontologyId: ontology.id,
      fabricIqServerUrl: ontologyMcpUrl(workspace.id, ontology.id),
    };
    for (const [name, value] of Object.entries({
      FABRIC_WORKSPACE_ID: binding.workspaceId,
      FABRIC_LAKEHOUSE_ID: binding.lakehouseId,
      FABRIC_SQL_ENDPOINT: binding.sqlEndpoint,
      FABRIC_SQL_DATABASE: binding.sqlDatabase,
      FABRIC_DATA_AGENT_URL: binding.dataAgentUrl,
      FABRIC_IQ_SERVER_URL: binding.fabricIqServerUrl,
      FABRIC_IQ_TARGET_KIND: 'Ontology',
      FABRIC_IQ_TARGET_NAME: 'DealRoomInvestmentOntology',
      FABRIC_IQ_ITEM_ID: binding.ontologyId,
    })) setAzdValue(name, value);
    updateApp(values, binding);
    return { ...plan, mode: 'live', ...binding };
  } finally {
    await rm(artifacts.output, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dryRun = process.argv.includes('--dry-run');
  const explicitDryRun = dryRun && Object.hasOwn(process.env, 'HYDRATE_FABRIC_DEMO');
  bootstrap({ dryRun, values: explicitDryRun ? process.env : undefined })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`[fabric] ${error.message}`);
      process.exitCode = 1;
    });
}