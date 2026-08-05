// The access reviewer's sharpest observation was about the tests, not the code: the ones
// I wrote after the first leak exercised listDeals and applyStatusTier in process, and
// "not one issues a request" — while the things that leaked were all routes. Six more
// routes leaked afterwards, including /citations sitting directly beneath the six I had
// just gated. This file drives the HTTP surface.
import test from 'node:test';
import { seededDeals } from '../data/deals.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
process.env.DEAL_ROOM_NO_LISTEN = '1';
const { app } = await import('../server.js');
import { hydrate, listDeals } from '../lib/store.js';

await hydrate();

const server = app.listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const seat = (role) => ({ 'x-dr-view-as': role, 'content-type': 'application/json' });
const get = (path, role) => fetch(`${base}${path}`, { headers: seat(role) });
const post = (path, role, body) => fetch(`${base}${path}`, { method: 'POST', headers: seat(role), body: JSON.stringify(body || {}) });

const idsFor = (role) => new Set(listDeals(null, role).map((d) => d.id));
const hiddenFromAnalyst = () => {
  const a = idsFor('analyst');
  return [...idsFor('partner')].filter((id) => !a.has(id));
};

// Every sub-resource a deal id can carry. If a route is added to the product and not to
// this list, that is the gap this file exists to catch.
const SUB_ROUTES = [
  '', '/ic-readiness', '/returns', '/risk-register', '/value-creation', '/ioi', '/loi',
  '/citations', '/cockpit', '/threads', '/workflow-desk', '/doc-desk', '/activity', '/documents',
];

test('no sub-resource of a hidden deal confirms that the deal exists', async () => {
  const hidden = hiddenFromAnalyst();
  assert.ok(hidden.length, 'fixture must hide at least one deal from an analyst');
  const id = hidden[0];
  const leaks = [];
  for (const path of SUB_ROUTES) {
    const r = await get(`/api/deals/${id}${path}`, 'analyst');
    // 404 is the only acceptable answer. A 403 says "it exists and you may not have it",
    // which for an unannounced target is most of the disclosure.
    if (r.status !== 404) leaks.push(`${path || '(record)'} -> ${r.status}`);
  }
  assert.deepEqual(leaks, [], `routes that confirmed a hidden deal: ${leaks.join(', ')}`);
});

test('a hidden deal never appears in the body of any of those routes', async () => {
  const id = hiddenFromAnalyst()[0];
  for (const path of SUB_ROUTES) {
    const r = await get(`/api/deals/${id}${path}`, 'analyst');
    const text = await r.text();
    assert.ok(!/\$\d|company/i.test(text) || text.length < 120,
      `${path} returned a body of ${text.length} bytes to a seat that cannot see the deal`);
  }
});

test('a cleared seat still gets all of it', async () => {
  const id = hiddenFromAnalyst()[0];
  const denied = [];
  for (const path of ['', '/ic-readiness', '/returns', '/risk-register', '/citations']) {
    const r = await get(`/api/deals/${id}${path}`, 'partner');
    if (r.status !== 200) denied.push(`${path || '(record)'} -> ${r.status}`);
  }
  assert.deepEqual(denied, [], `a partner was refused: ${denied.join(', ')}`);
});

// A row already in your list is a different case: denying it exists is a lie the reader
// can disprove by scrolling up. An analyst was told four tabs of a deal on their own
// screen did not exist.
test('a status-tier deal explains itself rather than denying it exists', async () => {
  const statusRow = listDeals(null, 'analyst').find((d) => d.accessLevel === 'status');
  if (!statusRow) return;
  const r = await get(`/api/deals/${statusRow.id}/returns`, 'analyst');
  assert.equal(r.status, 403, 'a visible row should say why, not 404');
  const body = await r.json();
  assert.match(String(body.detail || ''), /deal team/i);
  assert.match(String(body.detail || ''), /ask|administrator/i, 'a refusal should name a route to access');
});

test('the assistant does not name a deal the caller cannot list', async () => {
  const hidden = hiddenFromAnalyst();
  const names = listDeals(null, 'partner').filter((d) => hidden.includes(d.id)).map((d) => d.company);
  const r = await post('/api/deal-agent/chat', 'analyst', { message: 'Name every deal in the fund with its size.' });
  const text = JSON.stringify(await r.json());
  const leaked = names.filter((n) => n && text.includes(n));
  assert.deepEqual(leaked, [], `the assistant named hidden deals: ${leaked.join(', ')}`);
});

test('deal-scoped chat on a hidden deal does not confirm it', async () => {
  const id = hiddenFromAnalyst()[0];
  const r = await post(`/api/deals/${id}/chat`, 'analyst', { message: 'Describe this deal and its size.' });
  assert.equal(r.status, 404);
});

test('an unrecognised seat sees no more than the floor', async () => {
  const floor = (await (await get('/api/deals', 'member')).json()).length;
  for (const bogus of ['guest', 'xyzzy', 'Partner ']) {
    const n = (await (await get('/api/deals', bogus)).json()).length;
    assert.ok(n <= floor, `"${bogus}" saw ${n} deals against a floor of ${floor}`);
  }
});

test('the agent refuses a status-tier deal, with or without a signed-in identity', async () => {
  // The guard read `identity && dealAccessLevel(...) === "none"`. Two faults in one line:
  // the `identity &&` skipped it entirely for every demo seat and every view-as caller,
  // and `=== "none"` let a STATUS-tier deal through with the unredacted record behind it.
  // Only the outer HTTP gate stood between that and a reader, which makes it the leak
  // that appears the day a route changes.
  const { chatDealAgent } = await import('../lib/dealAgent.js');
  const { chatOrchestrator } = await import('../lib/purposeAgent.js');
  const { dealAccessLevel } = await import('../lib/userPolicy.js');
  const { getDealRaw } = await import('../lib/store.js');

  const statusDeal = seededDeals.find((d) => dealAccessLevel(null, getDealRaw(d.id) || d, 'member') === 'status');
  assert.ok(statusDeal, 'fixture must contain a status-tier deal for a member, or this asserts nothing');

  for (const [name, fn] of [['deal agent', chatDealAgent], ['orchestrator', chatOrchestrator]]) {
    const out = await fn({ message: 'What is the deal size and entry multiple?', dealId: statusDeal.id, scope: 'deal', identity: null, viewAsRole: 'member' });
    assert.equal(out.denied, true, `${name}: answered a status-tier deal for a seat that may not open it`);
  }
});

test('a cleared seat is still answered', async () => {
  // The inverse mistake: a gate so broad it refuses the people it is meant to serve.
  const { chatDealAgent } = await import('../lib/dealAgent.js');
  const { dealAccessLevel } = await import('../lib/userPolicy.js');
  const { getDealRaw } = await import('../lib/store.js');
  const open = seededDeals.find((d) => dealAccessLevel(null, getDealRaw(d.id) || d, 'deal-team') === 'full');
  assert.ok(open, 'fixture must contain a deal a cleared seat can open');
  const out = await chatDealAgent({ message: 'Summarise this deal.', dealId: open.id, scope: 'deal', identity: null, viewAsRole: 'deal-team' });
  assert.notEqual(out.denied, true, 'a cleared seat was refused its own deal');
});
