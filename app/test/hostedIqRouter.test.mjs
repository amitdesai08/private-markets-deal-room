import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHostedIqRoute, parseHostedIqRouteStream, resolveIqRoute } from '../lib/hostedIqRouter.js';

function responseFor(route) {
  return {
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(route) }] }],
  };
}

test('accepts a hosted decision but restores canonical agent metadata', () => {
  const route = parseHostedIqRoute(responseFor({
    id: 'work',
    agent: 'untrusted-agent',
    matched: ['work'],
    blockedCombination: false,
    decision: 'Work context requested.',
    trace: [],
  }));
  assert.equal(route.agent, 'deal-room-work-iq');
  assert.equal(route.router, 'hosted');
});

test('uses the hosted Responses endpoint when configured', async () => {
  const route = await resolveIqRoute('latest public news', {
    endpoint: 'https://router.example/responses',
    getToken: async () => 'token',
    fetchImpl: async () => ({
      ok: true,
      json: async () => responseFor({
        id: 'web', matched: ['web'], blockedCombination: false, decision: 'Public research.', trace: [],
      }),
    }),
  });
  assert.equal(route.id, 'web');
  assert.equal(route.router, 'hosted');
});

test('parses the terminal route from a Responses event stream', () => {
  const response = responseFor({
    id: 'web', matched: ['web'], blockedCombination: false, decision: 'Public research.', trace: [],
  });
  const stream = [
    'event: response.created',
    `data: ${JSON.stringify({ type: 'response.created', response: { output: [] } })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({ type: 'response.completed', response })}`,
    '',
  ].join('\n');
  const route = parseHostedIqRouteStream(stream);
  assert.equal(route.id, 'web');
  assert.equal(route.router, 'hosted');
});

test('uses a hosted Responses event stream when configured', async () => {
  const response = responseFor({
    id: 'work', matched: ['work'], blockedCombination: false, decision: 'Work context.', trace: [],
  });
  const stream = `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`;
  const route = await resolveIqRoute('read my email', {
    endpoint: 'https://router.example/responses',
    getToken: async () => 'token',
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'text/event-stream; charset=utf-8' },
      text: async () => stream,
    }),
  });
  assert.equal(route.id, 'work');
  assert.equal(route.router, 'hosted');
});

test('fails closed to the identical local policy when hosted routing fails', async () => {
  const route = await resolveIqRoute('Read my email and search the public web', {
    endpoint: 'https://router.example/responses',
    getToken: async () => 'token',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(route.router, 'local-fallback');
  assert.equal(route.blockedCombination, true);
});