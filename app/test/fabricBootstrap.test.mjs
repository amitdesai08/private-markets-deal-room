import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import {
  EXPECTED_FABRIC_COUNTS,
  assertSnapshotContract,
  bootstrap,
  dataAgentMcpUrl,
  ensureContributor,
  ensureWorkspace,
  ontologyMcpUrl,
  parseAzdValues,
  snapshotCounts,
  upsertItem,
} from '../../scripts/bootstrap-fabric.mjs';
import { hostedRouterEndpoint } from '../../scripts/bind-hosted-router.mjs';

const repo = resolve(import.meta.dirname, '../..');
const snapshot = JSON.parse(await readFile(join(repo, 'app/data/fabric-cache.json'), 'utf8'));

test('bundled snapshot preserves the exact Fabric demo contract', () => {
  assert.deepEqual(snapshotCounts(snapshot), {
    'silver.dim_company': 15,
    'silver.fact_deal': 12,
    'bronze.bronze_diligence_findings': 59,
    'bronze.bronze_ic_approvals': 12,
    'bronze.bronze_sec_filings': 14,
  });
  assert.deepEqual(assertSnapshotContract(snapshot), snapshotCounts(snapshot));
  assert.equal(EXPECTED_FABRIC_COUNTS['silver.company_deal_links'], 12);
  assert.equal(EXPECTED_FABRIC_COUNTS['bronze.company_filing_links'], 14);
});

test('changed source data fails before any Fabric calls', () => {
  const changed = structuredClone(snapshot);
  changed.comparableDeals.pop();
  assert.throws(() => assertSnapshotContract(changed), /Fabric seed contract changed/);
});

test('disabled and dry-run bootstraps never require Azure credentials', async () => {
  const skipped = await bootstrap({ values: { HYDRATE_FABRIC_DEMO: 'false' } });
  assert.equal(skipped.mode, 'skipped');
  const planned = await bootstrap({
    dryRun: true,
    values: {
      HYDRATE_FABRIC_DEMO: 'true',
      FABRIC_CAPACITY_NAME: 'dealroomfabric',
      FABRIC_WORKSPACE: 'Deal Room Fabric IQ',
      FABRIC_LAKEHOUSE: 'deal_room_starter',
    },
  });
  assert.equal(planned.mode, 'dry-run');
  assert.equal(planned.sourceCounts['bronze.bronze_sec_filings'], 14);
});

test('azd values and ontology MCP endpoints are deterministic', () => {
  assert.deepEqual(parseAzdValues('A="one"\nB=two\nIGNORED\n'), { A: 'one', B: 'two' });
  assert.equal(
    ontologyMcpUrl('workspace-id', 'ontology-id'),
    'https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/workspace-id/items/ontology-id/ontologyEndpoint',
  );
  assert.equal(
    dataAgentMcpUrl('workspace-id', 'agent-id'),
    'https://api.fabric.microsoft.com/v1/mcp/workspaces/workspace-id/dataagents/agent-id/agent',
  );
});

test('hydration notebook targets the requested lakehouse and asserts every count', async () => {
  const output = await mkdtemp(join(tmpdir(), 'deal-room-fabric-test-'));
  const notebookPath = join(output, 'hydrate.ipynb');
  try {
    const result = spawnSync(process.execPath, [
      join(repo, 'app/scripts/generate-fabric-hydration-notebook.mjs'),
      notebookPath,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'custom_lakehouse',
    ], { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const notebook = JSON.parse(await readFile(notebookPath, 'utf8'));
    const configure = notebook.cells[0].source.join('');
    const hydration = notebook.cells[1].source.join('');
    assert.match(configure, /custom_lakehouse/);
    assert.match(hydration, /expected_counts/);
    assert.match(hydration, /Expected \{expected_count\} rows in \{table_name\}/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('existing Fabric items update in place instead of being duplicated', async () => {
  const calls = [];
  const existing = { id: 'item-id', type: 'Ontology', displayName: 'DealRoomInvestmentOntology' };
  const client = {
    pages: async () => [existing],
    request: async (url, options) => {
      calls.push({ url, options });
      return { response: { status: 200 }, data: null };
    },
    complete: async () => {},
  };
  const result = await upsertItem(client, 'workspace-id', { ...existing, definition: { parts: [] } });
  assert.equal(result, existing);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /items\/item-id\/updateDefinition$/);
});

test('workspace and Contributor reconciliation are idempotent', async () => {
  const requests = [];
  const client = {
    pages: async (url) => url.endsWith('/workspaces')
      ? [{ id: 'workspace-id', displayName: 'Deal Room Fabric IQ', capacityId: 'capacity-id' }]
      : [{ id: 'role-id', principal: { id: 'principal-id' }, role: 'Contributor' }],
    request: async (...args) => {
      requests.push(args);
      return { response: { status: 200 }, data: null };
    },
    complete: async () => {},
  };
  const workspace = await ensureWorkspace(client, 'Deal Room Fabric IQ', 'capacity-id');
  await ensureContributor(client, workspace.id, 'principal-id');
  assert.equal(workspace.id, 'workspace-id');
  assert.deepEqual(requests, []);
});

test('hosted router binding accepts only a valid Responses endpoint', () => {
  const endpoint = 'https://example.services.ai.azure.com/api/projects/project/agents/router/endpoint/protocols/openai/responses?api-version=v1';
  assert.equal(hostedRouterEndpoint({ agent_endpoints: { responses: endpoint } }), endpoint);
  assert.throws(() => hostedRouterEndpoint({ agent_endpoints: {} }), /valid Responses endpoint/);
});