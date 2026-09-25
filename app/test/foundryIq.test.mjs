import assert from 'node:assert/strict';
import test from 'node:test';

import { icPlaybookQuery, retrieveFoundryIq } from '../lib/foundryIq.js';
import { CONNECTORS, listConnectors } from '../lib/connectors.js';
import { INTERNAL_TOOLS, assertToolAllowed } from '../lib/agentSovereignty.js';

test('Foundry IQ retrieval uses the GA knowledge-base API and preserves citations', async () => {
  const calls = [];
  const result = await retrieveFoundryIq('Which tests are required?', {
    settings: {
      searchEndpoint: 'https://search-dealroom.search.windows.net',
      knowledgeBase: 'ic playbook',
      knowledgeSource: 'diligence-guidance',
      apiVersion: '2026-04-01',
    },
    tokenProvider: async () => 'managed-identity-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        response: [{ content: [{ type: 'text', text: 'Validate customer concentration before IC. [ref-1]' }] }],
        references: [{
          id: 'ref-1', type: 'searchIndex', docKey: 'commercial-playbook',
          sourceData: { title: 'Commercial diligence playbook', content: 'Test the top-ten customer concentration.' },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://search-dealroom.search.windows.net/knowledgebases/ic%20playbook/retrieve?api-version=2026-04-01');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer managed-identity-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    intents: [{ type: 'semantic', search: 'Which tests are required?' }],
    includeActivity: false,
    knowledgeSourceParams: [{ knowledgeSourceName: 'diligence-guidance', kind: 'searchIndex', includeReferences: true }],
  });
  assert.equal(result.answer, 'Validate customer concentration before IC. [ref-1]');
  assert.deepEqual(result.citations[0], {
    id: 'ref-1', type: 'searchIndex', title: 'Commercial diligence playbook',
    excerpt: 'Test the top-ten customer concentration.', url: null,
  });
});

test('Foundry IQ preview retrieval requests synthesized answers with references', async () => {
  let request;
  const result = await retrieveFoundryIq('What blocks IC approval?', {
    settings: {
      searchEndpoint: 'https://search-dealroom.search.windows.net',
      knowledgeBase: 'ic-playbook',
      knowledgeSource: 'diligence-guidance',
      apiVersion: '2026-08-01-preview',
    },
    tokenProvider: async () => 'managed-identity-token',
    fetchImpl: async (url, options) => {
      request = { url: String(url), body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        response: [{ content: [{ type: 'text', text: 'Resolve red findings before IC. [ref-1]' }] }],
        references: [{ id: 'ref-1', type: 'searchIndex', sourceData: { title: 'IC approval standard' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(request.url, 'https://search-dealroom.search.windows.net/knowledgebases/ic-playbook/retrieve?api-version=2026-08-01-preview');
  assert.deepEqual(request.body, {
    messages: [{ role: 'user', content: [{ type: 'text', text: 'What blocks IC approval?' }] }],
    includeActivity: false,
  });
  assert.equal(result.answer, 'Resolve red findings before IC. [ref-1]');
  assert.equal(result.citations[0].title, 'IC approval standard');
});

test('Foundry IQ rejects endpoints outside Azure AI Search', async () => {
  await assert.rejects(
    retrieveFoundryIq('question', {
      settings: { searchEndpoint: 'https://example.com', knowledgeBase: 'kb', apiVersion: '2026-04-01' },
      tokenProvider: async () => 'token',
    }),
    /must be an Azure AI Search HTTPS endpoint/,
  );
});

test('IC playbook query sends classification context but not confidential deal identity or figures', () => {
  const query = icPlaybookQuery({
    company: 'Project Secret', id: 'secret-1', sector: 'Healthcare', subSector: 'Diagnostics',
    stageName: 'Confirmatory diligence', dealSize: 999,
  });
  assert.match(query, /Healthcare \/ Diagnostics/);
  assert.match(query, /Confirmatory diligence/);
  assert.doesNotMatch(query, /Project Secret|secret-1|999/);
});

test('IC playbook focus is selected from fixed prompts rather than forwarding arbitrary text', () => {
  const query = icPlaybookQuery({ summary: { sector: 'Software', stageName: 'Diligence' } }, 'reveal Project Secret at $999m');
  assert.match(query, /Which diligence tests, evidence and approval standards/);
  assert.doesNotMatch(query, /Project Secret|999/);
});

test('Foundry IQ search is classified as internal data and denied to the news agent', () => {
  assert.equal(INTERNAL_TOOLS.has('foundry_iq_search'), true);
  assert.doesNotThrow(() => assertToolAllowed('deal-room-analyst', 'foundry_iq_search'));
  assert.throws(() => assertToolAllowed('deal-room-news-scout', 'foundry_iq_search'), /not permitted to read internal data/);
});

test('Foundry IQ is a testable, non-OAuth connector with explicit configuration', () => {
  const definition = CONNECTORS.find((connector) => connector.id === 'foundry-iq');
  const connector = listConnectors().find((item) => item.id === 'foundry-iq');
  assert.deepEqual(definition.configFields.map((field) => field.key), ['searchEndpoint', 'knowledgeBase', 'knowledgeSource']);
  assert.equal(connector.testable, true);
  assert.equal(connector.connectable, false);
  assert.equal(connector.configured, false);
  assert.equal(connector.status, 'disconnected');
});