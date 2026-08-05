// The access reviewer's sharpest observation was about the tests, not the code: the ones
// I wrote after the first leak exercised listDeals and applyStatusTier in process, and
// "not one issues a request" — while the things that leaked were all routes. Six more
// routes leaked afterwards, including /citations sitting directly beneath the six I had
// just gated. This file drives the HTTP surface.
import test from 'node:test';
import { seededDeals } from '../data/deals.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
process.env.DEAL_ROOM_NO_LISTEN = '1';
// The seat-claim gate is `BOT_BACKEND_KEY && ...`, so with no key configured it is inert
// and every boundary assertion below would skip itself into a green run. Set one.
process.env.BOT_BACKEND_KEY = process.env.BOT_BACKEND_KEY || 'test-bot-key';
const { app } = await import('../server.js');
import { hydrate, listDeals } from '../lib/store.js';

await hydrate();

const server = app.listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

// A seat claim is only honoured for a caller that proves it is the app, so these tests
// have to prove it too — otherwise every one of them silently tests the member floor.
const seat = (role) => ({ 'x-dr-view-as': role, 'x-bot-key': process.env.BOT_BACKEND_KEY, 'content-type': 'application/json' });
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
  '', '/ic-readiness', '/case', '/comparables', '/returns', '/risk-register', '/value-creation', '/ioi', '/loi',
  '/citations', '/cockpit', '/threads', '/workflow-desk', '/doc-desk', '/activity', '/documents',
  // Nine the list had never named. It called itself "every sub-resource a deal id can
  // carry" and was a hand-kept literal, so it passed while four other routes handed the
  // funnel to anonymous callers. The completeness test below reads the router.
  '/model.html', '/model.csv', '/document-brief', '/document-brief.docx', '/document-brief.pdf',
  '/recent', '/workiq-notes', '/workiq-corpus',
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
  for (const path of ['', '/ic-readiness', '/case', '/returns', '/risk-register', '/citations']) {
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

// ---------------------------------------------------------------------------
// A seat claim from a caller that has not proven itself.
//
// The public ingress answered an anonymous request as 'deal-team' - the deploy default -
// so 24 deals including the confidential ones, and the assistant reading out a
// confidential carve-out's enterprise value. Flooring the no-header case was not enough:
// one added x-dr-view-as header put it all back, because view-as was read before the
// floor applied. Both need a bot key now, and this is the only place that can be proved.
// ---------------------------------------------------------------------------
test('an unproven caller cannot ask to be a cleared seat', async () => {
  const { BOT_BACKEND_KEY } = process.env;
  if (!BOT_BACKEND_KEY) {
    // The gate is `BOT_BACKEND_KEY && ...`: with no key configured there is nothing to
    // prove and the check is inert by design. Say so rather than passing silently.
    assert.ok(true, 'no bot key configured in this run - boundary gate is inert');
    return;
  }
  const ids = async (headers) => {
    const r = await fetch(`${base}/api/deals`, { headers });
    return (await r.json()).map((d) => d.id).sort();
  };
  const anon = await ids({});
  const claimed = await ids({ 'x-dr-view-as': 'deal-team' });
  assert.deepEqual(claimed, anon, 'naming a seat without proving anything changed what was served');
  const proven = await ids({ 'x-dr-view-as': 'deal-team', 'x-bot-key': BOT_BACKEND_KEY });
  assert.ok(proven.length >= anon.length, 'a proven caller must still reach its seat');
});

// ---------------------------------------------------------------------------
// The surfaces that had no test, and drifted because of it.
//
// A review found /api/capabilities still reading the body seat claim ahead of the floor,
// long after every other route was gated: an anonymous POST of {"viewAsRole":"admin"} came
// back canWrite and canViewStage2. Nothing pinned it. Nothing pinned the decide route's
// refusals either, or the status-tier strip.
// ---------------------------------------------------------------------------
test('no route grants a seat to a caller that has not proven itself', async () => {
  const { BOT_BACKEND_KEY } = process.env;
  if (!BOT_BACKEND_KEY) { assert.ok(true, 'no bot key configured — boundary gate is inert'); return; }
  const floor = await (await fetch(`${base}/api/capabilities`)).json();
  assert.equal(floor.canWrite, false, 'fixture assumption: the floor cannot write');

  // Every shape a claim can arrive in, on every route that reads one.
  const claims = [
    ['header', `${base}/api/capabilities`, { 'x-dr-view-as': 'admin' }, null],
    ['body', `${base}/api/capabilities`, { 'content-type': 'application/json' }, { viewAsRole: 'admin' }],
    ['body', `${base}/api/me/access`, { 'content-type': 'application/json' }, { viewAsRole: 'deal-team' }],
  ];
  for (const [how, url, headers, body] of claims) {
    const r = await fetch(url, { method: 'POST', headers, body: body ? JSON.stringify(body) : '{}' });
    const j = await r.json();
    assert.notEqual(j.canWrite, true, `${url} granted write to an unproven caller via the ${how}`);
    assert.notEqual(j.canViewStage2, true, `${url} granted stage-2 to an unproven caller via the ${how}`);
    assert.notEqual(j.isAdmin, true, `${url} granted admin to an unproven caller via the ${how}`);
  }
});

test('the decide route refuses what it should and admits what it cannot do', async () => {
  const { BOT_BACKEND_KEY } = process.env;
  if (!BOT_BACKEND_KEY) { assert.ok(true, 'no bot key configured'); return; }
  const cleared = { 'x-bot-key': BOT_BACKEND_KEY, 'x-dr-view-as': 'deal-team', 'content-type': 'application/json' };
  const statusSeat = { 'x-bot-key': BOT_BACKEND_KEY, 'x-dr-view-as': 'member', 'content-type': 'application/json' };

  const target = [...idsFor('member')].find((id) => !idsFor('member').has(id) === false);
  const ask = await fetch(`${base}/api/deals/${target}/request-access`, { method: 'POST', headers: statusSeat, body: '{}' });
  assert.ok([200, 409].includes(ask.status), `request-access answered ${ask.status}`);
  if (ask.status === 200) {
    const body = await ask.json();
    assert.equal(body.withWhom, null, 'the deal team was named to a seat that may only see status');
  }

  const queue = await (await fetch(`${base}/api/access-requests`, { headers: cleared })).json();
  const open = (queue.requests || [])[0];
  if (!open) { assert.ok(true, 'no open request to decide in this run'); return; }

  const bad = await fetch(`${base}/api/deals/${open.dealId}/access-requests/${open.id}`, { method: 'POST', headers: cleared, body: JSON.stringify({ decision: 'maybe' }) });
  assert.equal(bad.status, 400, 'an unrecognised decision must not be treated as a decline');

  const ok = await fetch(`${base}/api/deals/${open.dealId}/access-requests/${open.id}`, { method: 'POST', headers: cleared, body: JSON.stringify({ decision: 'approve' }) });
  const decided = await ok.json();
  assert.equal(decided.dealSize, undefined, 'the decide route serialised the deal record');
  assert.equal(decided.keyFigures, undefined, 'the decide route serialised the deal record');
  // A seat with no named identity cannot be admitted, and saying "approved" while the
  // team is unchanged is the one outcome an approver must never be given.
  if (!decided.request?.person) {
    assert.equal(decided.granted, false, 'reported a grant that admitted nobody');
    assert.match(String(decided.detail || ''), /nobody was added/i);
  }
});

test('the status tier strips the progress detail, and keeps only what it means to keep', async () => {
  const rows = listDeals(null, 'member').filter((d) => d.accessLevel === 'status');
  assert.ok(rows.length, 'fixture must produce a status-tier row');
  for (const r of rows) {
    for (const k of ['stepIndex', 'stepNumber', 'totalSteps', 'flowProgress', 'hoursSaved', 'projectedDaysSaved', 'leadAnalyst', 'sponsorPersona']) {
      assert.equal(r[k] ?? null, null, `${r.company}: ${k} survived the status-tier strip`);
    }
    // Deliberately kept: a metadata seat is entitled to know a deal is not ready.
    assert.notEqual(r.readiness, undefined, `${r.company}: readiness is meant to survive`);
  }
});

test('every seat a proven caller can preview actually resolves to that seat', async () => {
  const { BOT_BACKEND_KEY } = process.env;
  if (!BOT_BACKEND_KEY) { assert.ok(true, 'no bot key configured'); return; }
  // Shipped a 500 to production here: the demo profile lookup is a map and was called as
  // a function, so /api/capabilities threw for every seat. Nothing exercised it.
  const me = await (await fetch(`${base}/api/me/access`, { method: 'POST', headers: { 'x-bot-key': BOT_BACKEND_KEY, 'content-type': 'application/json' }, body: '{}' })).json();
  for (const role of ['partner', 'admin', 'analyst', 'deal-team', 'member']) {
    const r = await fetch(`${base}/api/capabilities`, { headers: { 'x-bot-key': BOT_BACKEND_KEY, 'x-dr-view-as': role } });
    assert.equal(r.status, 200, `${role}: /api/capabilities answered ${r.status}`);
    const j = await r.json();
    assert.ok(j.roleLabel, `${role}: no label`);
    // Previewing a seat ABOVE the deploy default is a demo affordance and only resolves
    // when demo mode is on; below it, view-as narrows and must always land exactly.
    if (me.demoMode || role === 'analyst' || role === 'member' || role === 'deal-team') {
      assert.equal(j.role, role, `asked to preview ${role} and was answered as ${j.role}`);
    }
  }
});

// AN UNAUTHENTICATED CALLER ENUMERATED PART OF THE FUND'S FUNNEL BY NAME AND SIZE.
//
// GET /api/companies?inFunnel=true, no headers, returned four companies that are live
// deals at D1 and D3 — with dealSize and "the fund is looking" — while a PROVEN member
// and a PROVEN analyst were both refused the same deals with a 404. Name, size and the
// fact that the fund is looking are the three things userPolicy itself calls the
// sensitive part, and ?inFunnel=true is a purpose-built enumeration of the pursued set.
//
// The correction had already been written for /analytics and applied to none of its
// neighbours: the same `_req` was still sitting on the origination cohort, and no test
// had ever issued a request to any of these four routes.
test('the origination feeds never name a company whose deal is invisible to the caller', async () => {
  const { canonicalCompanies, getPipeline, getScoredTargets, getSignalCompanies, getSourcingDesk, listDeals } = await import('../lib/store.js');
  // The seats that genuinely hide deals. An anonymous caller is floored to `member` at
  // the HTTP boundary, not in the store, so passing null here would assert nothing.
  for (const seat of ['member', 'analyst']) {
    const visible = new Set(listDeals(null, seat).map((d) => String(d.company || '').toLowerCase()));
    const hiddenNames = seededDeals
      .map((d) => String(d.company || '').toLowerCase())
      .filter((n) => !visible.has(n));
    assert.ok(hiddenNames.length, `no deal is hidden from ${seat || 'an anonymous caller'} — the guard would be inert`);

    const bodies = [
      JSON.stringify(canonicalCompanies({ inFunnel: true, identity: null, viewAsRole: seat })),
      JSON.stringify(canonicalCompanies({ identity: null, viewAsRole: seat })),
      JSON.stringify(getPipeline(null, seat)),
      JSON.stringify(getScoredTargets(null, seat)),
      JSON.stringify(getSignalCompanies(null, seat)),
      JSON.stringify(getSourcingDesk(null, seat)),
    ].join(' ').toLowerCase();

    for (const name of hiddenNames) {
      assert.ok(!bodies.includes(name), `${seat || 'anonymous'}: "${name}" is hidden as a deal and named on an origination feed`);
    }
  }
});

// The list this file calls "every sub-resource a deal id can carry" was a literal, and it
// omitted eight routes the router actually serves. All 39 assertions passed while four
// routes handed the funnel to anonymous callers, which is the point: a list that claims
// completeness and cannot prove it is worse than one that does not claim it.
test('the sub-route list is complete against the router', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const served = new Set();
  for (const m of src.matchAll(/api\.get\(\s*'\/deals\/:id([^']*)'/g)) {
    const tail = m[1];
    if (tail.includes(':')) continue; // a nested parameter is a different shape of route
    served.add(tail);
  }
  const missing = [...served].filter((r) => !SUB_ROUTES.includes(r));
  assert.deepEqual(missing, [], `sub-resources the router serves and this file does not test: ${missing.join(', ')}`);
});
