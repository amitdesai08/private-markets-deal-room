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
  for (const bogus of ['guest', 'xyzzy', 'Partner ', 'root', 'superuser', 'ADMIN']) {
    // A name the deployment does not define is a refusal now, not a quiet demotion. It
    // used to be read as a CLAIM — the boundary tested that the header was present, never
    // that it meant anything — so `x-dr-view-as: root` lifted a caller off the floor and
    // onto the deploy default, and five live deals came back for a word.
    const r = await get('/api/deals', bogus);
    if (r.status === 401) continue;
    const n = (await r.json()).length;
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
  // These used to read a list off the floor. The floor is refused outright now, so the
  // property is stronger than the one this test was written to hold: a caller that has
  // proved nothing is not served a shorter list, it is not served a list.
  const ids = async (headers) => {
    const r = await fetch(`${base}/api/deals`, { headers });
    if (r.status === 401) return [];
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
  // Refusing outright is the stronger answer, and it is the one given now. Accept either,
  // because what this test exists to prove is the loop below: that a CLAIM changes nothing.
  const floorRes = await fetch(`${base}/api/capabilities`);
  if (floorRes.status === 200) assert.equal((await floorRes.json()).canWrite, false, 'the floor cannot write');
  else assert.equal(floorRes.status, 401, `the floor was answered ${floorRes.status}`);

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

// THE LIST THAT CLAIMED COMPLETENESS ONLY EVER LOOKED AT GET.
//
// Every assertion above this line issues a GET. The router serves twenty-eight MUTATING
// sub-routes of a deal id and not one test had ever sent a request to any of them, so
// POST /deals/:id/assumption-snapshot returned twenty kilobytes of a confidential record
// to an unauthenticated caller AND wrote a snapshot to it, and the suite was green.
// Reading the verbs from the router is the point: a hand-kept literal is what went stale.
const mutatingSubRoutes = async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/api\.(post|patch|put|delete)\(\s*'\/deals\/:id([^']*)'/g)) {
    // Nested parameters are real routes; give them a value that cannot match anything.
    out.add([m[1].toUpperCase(), m[2].replace(/:[A-Za-z]+/g, 'x-not-a-real-id')].join(' '));
  }
  return [...out];
};

test('a mutating sub-route of a hidden deal answers exactly as it does for an invented id', async () => {
  const routes = await mutatingSubRoutes();
  assert.ok(routes.length > 20, `only ${routes.length} mutating sub-routes found — the scan has drifted`);
  const id = hiddenFromAnalyst()[0];
  const leaks = [];
  for (const entry of routes) {
    const [method, tail] = entry.split(' ');
    const call = (d) => fetch(`${base}/api/deals/${d}${tail || ''}`, { method, headers: seat('analyst'), body: method === 'DELETE' ? undefined : '{}' });
    const [real, invented] = await Promise.all([call(id), call('deal-that-does-not-exist')]);
    const [a, b] = await Promise.all([real.text(), invented.text()]);
    if (real.status !== 404) leaks.push(`${entry} -> ${real.status}`);
    // Same status is not enough. Refusing differently is still an answer to "does it exist".
    else if (a !== b) leaks.push(`${entry} -> 404 but a different body than for an invented id`);
  }
  assert.deepEqual(leaks, [], `mutating routes that confirmed a hidden deal: ${leaks.join(', ')}`);
});

// NOTHING IN THIS FILE HAD EVER MADE AN UNAUTHENTICATED REQUEST.
//
// The seat() helper sends the bot key on every call, which is correct for testing what a
// PROVEN seat may see — and it meant the anonymous floor, the one surface reachable by
// anyone who has the URL, was the only one with no coverage at all. Four unauthenticated
// routes were returning confidential records and provisioning channels when this was
// written. No headers below, deliberately.
test('an unauthenticated caller gets nothing from a deal it cannot see, on any verb', async () => {
  const anon = new Set(listDeals(null, 'member').map((d) => d.id));
  const hidden = [...idsFor('partner')].filter((id) => !anon.has(id));
  assert.ok(hidden.length, 'fixture must hide at least one deal from the anonymous floor');
  const id = hidden[0];
  const routes = [...SUB_ROUTES.map((t) => `GET ${t}`), ...(await mutatingSubRoutes())];
  const leaks = [];
  for (const entry of routes) {
    const [method, tail] = entry.split(' ');
    const r = await fetch(`${base}/api/deals/${id}${tail || ''}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    });
    const text = await r.text();
    if (r.status !== 404) leaks.push(`${entry} -> ${r.status}`);
    else if (text.length > 120) leaks.push(`${entry} -> 404 carrying ${text.length} bytes`);
  }
  assert.deepEqual(leaks, [], `answered an anonymous caller about a hidden deal: ${leaks.join(', ')}`);
});

// The five feeds the access review listed as still unscoped. None of them names a deal
// the caller cannot see today, and the fix for that is to hold it rather than to add a
// filter that does nothing — but nothing was checking, and /sourcing in particular is one
// promote away from carrying a live target. If a future edit joins these to the deal
// records, this is the test that says so.
test('the market and sourcing feeds never name a deal the caller cannot see', async () => {
  const S = await import('../lib/store.js');
  const sectors = [...new Set(seededDeals.map((d) => d.sector).filter(Boolean))];
  const visible = new Set(listDeals(null, 'member').map((d) => String(d.company || '').toLowerCase()));
  const hiddenNames = seededDeals.map((d) => String(d.company || '').toLowerCase()).filter((n) => n && !visible.has(n));
  assert.ok(hiddenNames.length, 'no deal is hidden from the anonymous floor — the guard would be inert');

  const parts = [S.listSourcing(), S.getPassReasons(), S.getFramework()];
  for (const sector of sectors) parts.push(S.comparableDeals({ sector }), S.icPrecedents(sector));
  const body = JSON.stringify(parts).toLowerCase();
  // These feeds carry several kilobytes of seeded content. If they ever come back empty
  // the assertion below would pass for the wrong reason, so fail on that instead.
  assert.ok(body.length > 4000, `the feeds returned only ${body.length} bytes — this test has gone inert`);
  for (const name of hiddenNames) {
    assert.ok(!body.includes(name), `"${name}" is hidden as a deal and named on an open feed`);
  }
});

// Refusal copy is the one place the product speaks to someone it is turning away, and it
// was the last place the house words were still in use: "This seat cannot move deals",
// "read-only-seat", "you cannot remove Work IQ notes", "the deal desk is deal-team only".
// A reader who is refused should be told what they cannot do in their own language, not
// in the vocabulary of the implementation.
test('no refusal explains itself in words the product does not use', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const banned = /\b(cockpit|lane|gate|module|orchestrator|MCP|connector|provenance|seat|desk|agent|Work IQ)\b/i;
  const offences = [];
  // Only the prose fields. `error` codes are read by callers, not by people.
  for (const m of src.matchAll(/\b(?:detail|reason|reply):\s*'([^']{12,})'/g)) {
    const hit = m[1].match(banned);
    if (hit) offences.push(`"${hit[0]}" in: ${m[1].slice(0, 70)}`);
  }
  assert.deepEqual(offences, [], `refusal copy using house words:\n${offences.join('\n')}`);
});

// THE GUARD I ADDED TO /candidates SHIPPED WITH ITS IMPORT MISSING.
//
// `dealForCandidate` was called and never imported, so the middleware threw ReferenceError
// on every request and production answered 500 for every candidate route for an hour. The
// whole suite was green: nothing in it had ever issued a request to /candidates, so the
// only evidence the guard worked was that I had written it. A guard with no request
// against it is not a guard, which is the same lesson as the mutating sweep above.
test('the candidate routes answer, and never name a candidate whose deal is hidden', async () => {
  const { seedCandidates } = await import('../data/candidates.js');
  const ids = seedCandidates.map((c) => c.id).filter(Boolean);
  assert.ok(ids.length > 4, `only ${ids.length} candidates seeded — this test would be inert`);
  const visible = new Set(listDeals(null, 'member').map((d) => String(d.company || '').toLowerCase()));
  const hiddenNames = seededDeals.map((d) => String(d.company || '').toLowerCase()).filter((n) => n && !visible.has(n));
  const faults = [];
  for (const id of [...ids, 'an-invented-candidate']) {
    for (const tail of ['', '/chat']) {
      const r = await fetch(`${base}/api/candidates/${id}${tail}`);
      // 5xx is a fault in its own right and it is also an answer: it tells a caller the
      // route exists and reached code. Refusals must be quiet, not loud.
      if (r.status >= 500) { faults.push(`${id}${tail} -> ${r.status}`); continue; }
      // A refusal that is a different length for a real id than for an invented one sorts
      // the firm's targets out of the id space without ever being granted anything.
      if (r.status === 404) {
        const control = await fetch(`${base}/api/candidates/zz-never-issued${tail}`);
        // Express's own 404 page echoes the path, which it does for every id alike, so
        // the id itself is not the disclosure. Take it out and compare what is left.
        const strip = (s, k) => s.split(k).join('<id>');
        const [x, y] = await Promise.all([r.clone().text(), control.text()]);
        if (strip(x, id) !== strip(y, 'zz-never-issued')) faults.push(`${id}${tail} refused differently than an invented id`);
      }
      const body = (await r.text()).toLowerCase();
      for (const name of hiddenNames) {
        if (body.includes(name)) faults.push(`${id}${tail} named "${name}", hidden as a deal`);
      }
    }
  }
  assert.deepEqual(faults, [], faults.join('; '));
});

// The in-process feed test above calls the store directly, which is how /stage1/cohort
// escaped it: the route reads a cohort of CANDIDATES rather than deals, so it is served by
// a function that test never names, and it answers 200 to an anonymous caller. Everything
// open enough to answer without a header gets swept here, over HTTP, as anyone would.

// THE SWEEP ABOVE IS FIFTEEN LITERALS AND THAT IS THE SAME MISTAKE, ONE FILE LOWER.
//
// It listed /api/companies and not /api/companies/:id — and the singular served every
// company the list omitted, with the funnel disposition and the firm's screening notes.
// It listed ic-precedents WITH a sector filter and not without, and the unfiltered form
// returned the committee's voting record. One test derives its routes from the router and
// catches what I forgot; the other enumerates and catches only what I remembered.
//
// The assertion is a subset rule rather than a name list, because a name list only finds
// leaks shaped like a company name — it passed vacuously over IC precedents, which are
// historical deals. Anything an anonymous caller is told must also be told to a member.

// Both directions, because each half is a different failure.
//
// An unproven caller used to be floored to `member`, so the firm's own staff and whoever
// had the URL were the same seat, and five live unannounced transactions were served to
// the open internet by name with stage and readiness attached. The floor is its own role
// now. The second half of this test is the one that matters in six months: `anonymous`
// can be over-corrected into refusing the firm too, and nothing else here would notice.

// The fund's own reporting, checked by hand because the subset test above only compares
// routes that answer 200 to BOTH seats — a 401 to the floor is invisible to it, which is
// exactly the state I want and therefore exactly the state that needs pinning.
test('fund reporting and market intelligence are closed to the open internet', async () => {
  for (const path of ['/api/fund/value', '/api/fund/portfolio', '/api/market-intel', '/api/market-intel/ic-precedents']) {
    const anon = await fetch(`${base}${path}`);
    assert.equal(anon.status, 401, `${path} answered an unproven caller with ${anon.status}`);
    const firm = await fetch(`${base}${path}`, { headers: seat('partner') });
    assert.equal(firm.status, 200, `${path} refused a partner with ${firm.status}`);
  }
});

// DENY BY DEFAULT, PROVED ROUTE BY ROUTE OFF THE ROUTER.
//
// This replaces three tests, and it is worth saying what they were and why they went.
// Two of them swept the routes an anonymous caller could reach and checked that the bodies
// named no hidden company and were no longer than a member's. Both passed while POST
// /connectors returned 201 to the open internet and persisted a record, /signals/mailbox
// served the firm's inbound deal mail with the senders' addresses, and /stage1/cohort/O3
// named a live target with its size and screening verdict — because all of those are
// IDENTICAL for anonymous and member, and a subset rule calls identical acceptable.
//
// The third asserted the anonymous deal list was empty, which is now the least of what is
// true. Comparing what the floor is told against what a member is told was the wrong
// question; the right one is whether the floor is told anything at all.
test('every route refuses a caller that has proved nothing, except the ones that cannot', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const routes = new Set();
  for (const m of src.matchAll(/api\.(get|post|patch|put|delete)\(\s*'(\/[^']*)'/g)) {
    routes.add(`${m[1].toUpperCase()} ${m[2].replace(/:[A-Za-z]+/g, 'probe-value')}`);
  }
  assert.ok(routes.size > 100, `only ${routes.size} routes found — the scan has drifted`);

  // The whole set that legitimately arrives without proof. Adding to it should feel like
  // a decision, which is why it is spelled out rather than derived.
  const OPEN = [/^\/health$/, /^\/graph\/notifications$/, /^\/m365\/(login|callback)$/, /^\/mcp\/[^/]+\/(login|callback)$/];
  // The app has to be able to draw the sign-in list before anyone has signed in, and to
  // ask what it is currently allowed to do. Neither answer depends on who is asking, and
  // both are checked below for what they must NOT contain.
  const BOOTSTRAP = [/^\/demo-profiles$/, /^\/me\/access$/, /^\/capabilities$/];

  const answered = [];
  for (const entry of routes) {
    const [method, path] = entry.split(' ');
    if (OPEN.some((re) => re.test(path)) || BOOTSTRAP.some((re) => re.test(path))) continue;
    const r = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    });
    // A deal sub-route answers 404 instead, because the deal boundary guard runs first
    // and a 404 discloses strictly less than a 401: it does not concede that the id names
    // anything. Both are refusals; only 2xx and 3xx are answers.
    const acceptable = path.startsWith('/deals/') ? [401, 404] : [401];
    if (!acceptable.includes(r.status)) answered.push(`${entry} -> ${r.status}`);
  }
  assert.deepEqual(answered, [], `routes that answered a caller who proved nothing: ${answered.join(', ')}`);
});

// The other half, and the half that will matter later: deny-by-default is one line away
// from denying the firm too, and nothing above would notice.
test('the firm is still served everything it should be', async () => {
  const aware = seededDeals.filter((d) => d.pipelineVisible && !d.confidential);
  assert.ok(aware.length, 'no deal is marked visible to the firm — this test would be vacuous');

  const member = await (await fetch(`${base}/api/deals`, { headers: seat('member') })).json();
  assert.ok(member.length >= aware.length,
    `a proven member sees ${member.length} deals but the firm marked ${aware.length} to be known`);
  const partner = await (await fetch(`${base}/api/deals`, { headers: seat('partner') })).json();
  assert.ok(partner.length > member.length, 'a partner sees no more than a member — the ladder has collapsed');

  for (const path of ['/api/fund/value', '/api/market-intel', '/api/analytics', '/api/companies', '/api/sourcing', '/api/signals/mailbox']) {
    const r = await fetch(`${base}${path}`, { headers: seat('partner') });
    assert.equal(r.status, 200, `${path} refused a partner with ${r.status}`);
  }

  // And awareness is still only awareness.
  const status = member.find((d) => aware.some((a) => a.id === d.id));
  if (status) {
    const r = await fetch(`${base}/api/deals/${status.id}/case`, { headers: seat('member') });
    assert.notEqual(r.status, 200, `${status.id} is marked for awareness and served its full case to a member`);
  }
});

// Bootstrap is the hole in deny-by-default, so it gets its own assertions rather than a
// `continue` and the benefit of the doubt.
test('the routes open before sign-in say nothing about the firm', async () => {
  const partnerIds = [...idsFor('partner')];
  const anonNames = new Set(listDeals(null, 'anonymous').map((d) => String(d.company || '').toLowerCase()));
  const hiddenNames = seededDeals
    .filter((d) => partnerIds.includes(d.id))
    .map((d) => String(d.company || '').toLowerCase())
    .filter((n) => n && !anonNames.has(n));
  assert.ok(hiddenNames.length, 'nothing is hidden from the floor — this test would be inert');

  for (const path of ['/api/demo-profiles', '/api/capabilities']) {
    const r = await fetch(`${base}${path}`);
    if (r.status !== 200) continue;
    const body = (await r.text()).toLowerCase();
    for (const name of hiddenNames) {
      assert.ok(!body.includes(name), `${path} names "${name}" before anyone has signed in`);
    }
  }
  // And it must not hand out a seat.
  const caps = await fetch(`${base}/api/capabilities`);
  if (caps.status === 200) {
    const j = await caps.json();
    assert.notEqual(j.canWrite, true, 'the pre-sign-in seat can write');
    assert.notEqual(j.canViewStage2, true, 'the pre-sign-in seat is cleared for diligence');
  }
});
