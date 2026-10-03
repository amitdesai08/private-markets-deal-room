import test from 'node:test';
import assert from 'node:assert/strict';

import { seedFilesResult, seedMailResult, seedChannelResult } from '../data/workiqSeed.js';
import { seededDeals } from '../data/deals.js';
import { workiqSeedFallbackAllowed } from '../lib/mcp/workiq.js';
import { corpusForDeal } from '../lib/workiqCorpus.js';

test('configured Work IQ does not silently fall back to seed data', () => {
  const original = process.env.WORKIQ_ALLOW_SEED_FALLBACK;
  delete process.env.WORKIQ_ALLOW_SEED_FALLBACK;
  try {
    assert.equal(workiqSeedFallbackAllowed({ graphConfigured: true, mcpUrl: '' }), false);
    assert.equal(workiqSeedFallbackAllowed({ graphConfigured: false, mcpUrl: 'https://workiq.example/mcp' }), false);
    assert.equal(workiqSeedFallbackAllowed({ graphConfigured: false, mcpUrl: '' }), true);
  } finally {
    if (original === undefined) delete process.env.WORKIQ_ALLOW_SEED_FALLBACK;
    else process.env.WORKIQ_ALLOW_SEED_FALLBACK = original;
  }
});

test('seed Work IQ records are explicitly marked and traceable', () => {
  const results = [
    seedFilesResult('Helvetia'),
    seedMailResult({ query: 'Helvetia' }),
    seedChannelResult({ query: 'Helvetia' }),
  ];
  for (const result of results) {
    assert.equal(result.sourceType, 'seed');
    assert.equal(result.ingestionPath, 'bundled-demo-corpus');
    assert.equal(result.demo, true);
    assert.ok(result.results.length > 0);
    for (const item of result.results) {
      assert.equal(item.sourceType, 'seed');
      assert.equal(item.ingestionPath, 'bundled-demo-corpus');
      assert.ok(item.id);
      assert.ok(item.dealId);
      assert.ok(item.timestamp);
    }
  }
});

test('workspace demo corpus labels every record as seed or derived', () => {
  const corpus = corpusForDeal(seededDeals.find((deal) => deal.id === 'helvetia'));
  assert.equal(corpus.sourceType, 'demo');
  const items = [...(corpus.channel?.messages || []), ...corpus.files, ...corpus.mail];
  assert.ok(items.length > 0);
  for (const item of items) {
    assert.ok(['seed', 'derived'].includes(item.sourceType));
    assert.ok(['bundled-demo-corpus', 'deal-record-composition'].includes(item.ingestionPath));
    assert.equal(item.dealId, 'helvetia');
  }
});