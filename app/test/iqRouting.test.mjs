import test from 'node:test';
import assert from 'node:assert/strict';
import { listIqRoutes, routePromptToIq } from '../lib/iqRegistry.js';
import { contextDisclosure } from '../lib/purposeAgent.js';

test('the registry exposes exactly the four named IQ routes', () => {
  assert.deepEqual(listIqRoutes().map((iq) => iq.label), [
    'Foundry IQ',
    'Fabric IQ',
    'Work IQ',
    'Web IQ',
  ]);
});

test('representative prompts route to the owning IQ agent', () => {
  const cases = [
    ['Use our IC playbook to draft the recommendation', 'foundry', 'deal-room-foundry-iq'],
    ['Compare portfolio returns and fund exposure', 'fabric', 'deal-room-fabric-iq'],
    ['Find the latest Teams message and email thread', 'work', 'deal-room-work-iq'],
    ['Search the public web for the latest company news', 'web', 'deal-room-web-iq'],
  ];
  for (const [prompt, id, agent] of cases) {
    const route = routePromptToIq(prompt);
    assert.equal(route.id, id, prompt);
    assert.equal(route.agent, agent, prompt);
    assert.equal(route.protocol, 'A2A', prompt);
  }
});

test('private work context cannot be combined with public web egress', () => {
  const route = routePromptToIq('Read my email and search the public web for a response');
  assert.equal(route.blockedCombination, true);
  assert.deepEqual(route.matched, ['work', 'web']);
});

test('orchestration disclosure separates explicit context from inferred boundaries', () => {
  const disclosure = contextDisclosure({
    scope: 'deal',
    focusCompany: 'Lumen Analytics',
    focusId: 'lumen-analytics',
    viewAsRole: 'partner',
    previousResponseId: 'response-1',
  });
  assert.deepEqual(disclosure.explicit, [
    'Focused deal: Lumen Analytics',
    'Conversation context: prior assistant turn',
  ]);
  assert.deepEqual(disclosure.inferred, [
    'Effective scope: single deal',
    'Answering lens: partner',
    'Access boundary: caller permissions and deal need-to-know',
  ]);
});