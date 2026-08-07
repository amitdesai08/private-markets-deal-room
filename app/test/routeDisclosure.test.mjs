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

// A seat is something a PERSON holds, and a person has to be somebody the deployment knows.
// These tests used to claim a seat with no identity on the request at all, which the
// boundary now refuses — so without this every assertion below would quietly become a test
// of the anonymous floor, five times over, and pass.
const { setRoleAssignments } = await import('../lib/accessConfig.js');
for (const role of ['admin', 'partner', 'deal-team', 'analyst']) {
  await setRoleAssignments(role, [role, `${role}@dealroom.test`]);
}

const server = app.listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

// A seat claim is only honoured for a caller that proves it is the app, so these tests
// have to prove it too — otherwise every one of them silently tests the member floor.
// A seat is something a PERSON holds, and these used to claim one without naming anybody —
// which is exactly the request the boundary now refuses, so every assertion below would
// have quietly become a test of the anonymous floor.
const seat = (role) => ({
  'x-dr-view-as': role,
  'x-bot-key': process.env.BOT_BACKEND_KEY,
  // The roster is keyed by role name — `partner` is a person, and so is `legal-gc` — so
  // this names the one who actually holds the seat. An invented oid resolves to nobody and
  // view-as only ever narrows, so every seat below would have collapsed to `member` and the
  // suite would have passed by testing the floor five times over.
  'x-dr-user': JSON.stringify({ oid: role, upn: role }),
  'content-type': 'application/json',
});
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
    const ask = (id) => fn({ message: 'What is the deal size and entry multiple?', dealId: id, scope: 'deal', identity: null, viewAsRole: 'member' });
    const [hidden, invented] = await Promise.all([ask(statusDeal.id), ask('a-deal-that-was-never-opened')]);
    // This asserted `denied === true`, and `denied` WAS the disclosure: "You do not have
    // access to this deal" for a real id, and a normal answer for one that names nothing,
    // told them apart. The REST routes beside it answer 404 to both. Deliberately stricter
    // — refusing is no longer enough, the two must be indistinguishable.
    assert.equal(hidden.scope, invented.scope, `${name}: a hidden id is scoped differently to an invented one`);
    assert.equal(!!hidden.denied, !!invented.denied, `${name}: a hidden id is refused differently to an invented one`);
    // The NAME is not the secret at this tier — status means the firm wants the deal known
    // and the reader can already list it. The figures are what the tier withholds.
    const body = JSON.stringify(hidden).toLowerCase();
    for (const figure of [statusDeal.dealSize, statusDeal.ebitda].filter((x) => x != null)) {
      assert.ok(!body.includes(String(figure)), `${name}: quoted ${figure} from a deal the caller may not open`);
    }
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
  const cleared = seat('deal-team');
  const statusSeat = seat('member');

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
  // These built headers inline and named no person, which is the request the boundary now
  // refuses — so every seat below came back `anonymous` and the preview was never exercised.
  const me = await (await fetch(`${base}/api/me/access`, { method: 'POST', headers: seat('admin'), body: '{}' })).json();
  for (const role of ['partner', 'admin', 'analyst', 'deal-team', 'member']) {
    const r = await fetch(`${base}/api/capabilities`, { headers: seat(role) });
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
  // The LAST such deal, not the first. The decide-route test earlier in this file asks for
  // access to the first one a member can see and the request is granted — which appends to
  // that deal's team, so by the time this ran the answer was legitimately 200 and the
  // assertion had quietly become about membership rather than about awareness.
  const awareRows = member.filter((d) => aware.some((a) => a.id === d.id));
  const status = awareRows[awareRows.length - 1];
  if (status) {
    // A reader nobody has admitted to anything. Once the seats carried real identities, the
    // request-access test earlier in this file started genuinely ADDING its member to a deal
    // team — so by the time this ran, `member` was on the deal and 200 was the correct
    // answer. The assertion was about awareness and had quietly become about membership.
    const stranger = { ...seat('member'), 'x-dr-user': JSON.stringify({ oid: 'u-never-admitted', upn: 'never-admitted@dealroom.test' }) };
    const r = await fetch(`${base}/api/deals/${status.id}/case`, { headers: stranger });
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

// OVER-REFUSAL, WHICH IS THE FAILURE THIS FILE KEPT CAUSING AND NEVER CHECKED.
//
// Every test above asks whether someone is told too much. Tightening the boundary five
// times in a row and never asking the other question is how thirty-five routes came to
// answer "Sign in to continue" to people who had — fund reporting, market intelligence,
// the sourcing feed, the signals mailbox and the news desk, all dark, for everyone.
//
// A refusal that states the wrong remedy is worse than a leak in one respect: nobody
// reports it as a security problem, they report it as the product being broken, and the
// team that hears it loosens something to make it stop.
test('a proven partner is refused nothing the router serves', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const paths = new Set();
  for (const m of src.matchAll(/api\.get\(\s*'(\/[^']*)'/g)) {
    const route = m[1];
    if (route.includes(':') || route.includes('*')) continue; // needs a real id; covered above
    paths.add(route);
  }
  assert.ok(paths.size > 30, `only ${paths.size} plain GET routes found — the scan has drifted`);

  // A signed-in partner, not just a proven app naming a seat: routes like /demo/acting-as
  // legitimately need a person, and refusing an app that named nobody is the right answer.
  const signedIn = { ...seat('partner'), 'x-dr-user': JSON.stringify({ oid: 'u-test-partner', upn: 'partner@dealroom.test', name: 'Test Partner' }) };
  const refused = [];
  for (const path of paths) {
    const r = await fetch(`${base}/api${path}`, { headers: signedIn });
    // 4xx is the fault. A 5xx is a different bug and 404 may be honest for an unwired
    // integration, so only the refusals that mean "not for you" are counted.
    if (r.status === 401 || r.status === 403) refused.push(`${path} -> ${r.status}`);
  }
  assert.deepEqual(refused, [], `a partner was refused: ${refused.join(', ')}`);
});

// A ROLE THAT SAYS READ-ONLY AND WRITES ANYWAY IS NOT A ROLE.
//
// Every seat is told whether it may write and /deals/:id/issues never asked. A member and
// an analyst, both reporting canWrite false, POSTed findings onto a live deal in production
// and both persisted — with raisedBy empty, so the record could not even name who had done
// it. Nothing here had ever attempted a write as a read-only seat; every mutating test
// above uses a HIDDEN deal, which 404s at the boundary long before any of this is reached.
// The refusal was the only thing being tested, never the permission behind it.
test('a read-only seat cannot write to a deal it can otherwise see', async () => {
  const visible = await (await fetch(`${base}/api/deals`, { headers: seat('analyst') })).json();
  assert.ok(visible.length, 'an analyst can see no deal — this test would be inert');
  const id = visible[0].id;

  const writes = [
    ['POST', `/issues`, { lane: 'commercial', title: 'written by a read-only seat', severity: 'medium' }],
    ['POST', `/conditions`, { text: 'written by a read-only seat' }],
    ['POST', `/contributions`, { lane: 'commercial', text: 'written by a read-only seat' }],
    ['POST', `/advance`, {}],
    ['POST', `/launch`, {}],
    ['POST', `/tags`, { tags: ['written-by-a-read-only-seat'] }],
    ['POST', `/workiq-notes`, { text: 'written by a read-only seat' }],
    ['PATCH', `/swimlanes/commercial`, { start: '2026-01-01' }],
  ];
  const wrote = [];
  for (const [method, tail, body] of writes) {
    for (const role of ['member', 'analyst']) {
      const r = await fetch(`${base}/api/deals/${id}${tail}`, { method, headers: seat(role), body: JSON.stringify(body) });
      if (r.status < 400) wrote.push(`${role} ${method} ${tail} -> ${r.status}`);
    }
  }
  assert.deepEqual(wrote, [], `a read-only seat was allowed to write: ${wrote.join(', ')}`);

  // And the seat that IS supposed to write still can, or this has been fixed by breaking it.
  const allowed = await fetch(`${base}/api/deals/${id}/issues`, {
    method: 'POST',
    headers: seat('deal-team'),
    body: JSON.stringify({ lane: 'commercial', title: 'recorded by the deal team', severity: 'medium' }),
  });
  assert.ok(allowed.status < 400, `the deal team was refused a write with ${allowed.status}`);
});

// A confidential deal needs a NAME on it, and the check guarded only the status tier —
// the tier already excluded. So any deal-team-tier role not on Project Onyx's team was
// served the record at `full`: the size, the entry multiple, the returns model, and the
// team roster telling them who to ask. Project Sterling is a listed payments processor,
// so the same hole was handing out inside information on a public issuer.
test('a confidential deal is invisible to everyone not named on it', async () => {
  const { dealAccessLevel } = await import('../lib/userPolicy.js');
  const confidential = seededDeals.filter((d) => d.confidential);
  assert.ok(confidential.length, 'no confidential deal in the fixture — this test would be inert');

  for (const deal of confidential) {
    for (const role of ['member', 'analyst', 'deal-team', 'partner', 'admin']) {
      const named = (deal.team || []).map((x) => String(x).toLowerCase());
      if (named.includes(role)) continue; // a role slug ON the team is a name, of a sort
      assert.equal(dealAccessLevel(null, deal, role), 'none',
        `${deal.id} is confidential and reads as ${dealAccessLevel(null, deal, role)} to ${role}`);
    }
  }
});

// Origination is the stage at which nobody is supposed to know, and it was the one place
// with no rule at all: a candidate nobody has promoted has no deal, so none of the deal
// tiers governed it, and the funnel returned a live target's size, ownership, revenue,
// EBITDA and screening verdict to any seat that asked. The name and the stage are what a
// colleague needs so two teams do not court the same target. The figures are not.
test('an uncleared seat is told a target exists, not what it is worth', async () => {
  const { scopeCandidates, listDeals } = await import('../lib/store.js');
  const { seedCandidates } = await import('../data/candidates.js');
  // Against the SEED, not the runtime list: candidates come from Cosmos and are empty in a
  // test run, so a test that read them would assert nothing and look green doing it.
  assert.ok(seedCandidates.length > 4, 'no candidates in the seed — this test would be inert');
  const FIGURES = ['dealSize', 'revenue', 'ebitda', 'score'];

  for (const seatName of ['member', 'analyst']) {
    const rows = scopeCandidates(null, seatName)(seedCandidates);
    const openable = new Set(listDeals(null, seatName)
      .filter((d) => d.accessLevel === 'full')
      .map((d) => String(d.company || '').toLowerCase()));
    const leaked = rows.filter((c) => {
      if (!FIGURES.some((k) => c[k] != null)) return false;
      const names = [c.company, c.name].filter(Boolean).map((x) => String(x).toLowerCase());
      return !names.some((n) => openable.has(n));
    });
    assert.deepEqual(leaked.map((c) => c.company || c.name), [],
      `${seatName} was given figures for targets it cannot open`);
  }

  // And a cleared seat still gets the numbers, or this has been fixed by breaking it.
  const cleared = scopeCandidates(null, 'partner')(seedCandidates);
  assert.ok(cleared.some((c) => FIGURES.some((k) => c[k] != null)),
    'a partner was shown no figures on any target — the funnel has been emptied, not scoped');
});

// THE THREE WAYS AN IDENTITY CAN BE FAKED, EACH PINNED ON A CONFIDENTIAL DEAL.
//
// Counting rows was how all three of these survived a review: a smaller list looks like a
// working boundary. Each assertion below names demo-onyx specifically, because that is the
// record the fault actually reached.
//   - view-as with NO identity returned the roster's partner, who is on Onyx's team, so a
//     request naming nobody was answered as somebody. Omit the person, get 24 rows and a 200.
//   - an UNREADABLE x-dr-user fell through the same way: a truncated header upgraded the
//     caller from 21 deals to 24, both confidential ones included.
//   - an asserted display NAME of 'partner' matched the deal team, because the team on a
//     confidential deal is a list of person ids and the sign-in list publishes the names.
test('no unsigned assertion reaches a confidential deal', async () => {
  const confidential = seededDeals.filter((d) => d.confidential);
  assert.ok(confidential.length, 'no confidential deal in the fixture — this test would be inert');
  const key = process.env.BOT_BACKEND_KEY;

  const attempts = [
    ['view-as with no identity', { 'x-bot-key': key, 'x-dr-view-as': 'partner' }],
    ['an unreadable identity', { 'x-bot-key': key, 'x-dr-view-as': 'partner', 'x-dr-user': 'not-json' }],
    ['an empty identity', { 'x-bot-key': key, 'x-dr-view-as': 'partner', 'x-dr-user': '{}' }],
  ];
  for (const name of ['partner', 'analyst', 'legal-gc', 'admin']) {
    attempts.push([`a display name of "${name}"`, {
      'x-bot-key': key,
      'x-dr-view-as': 'partner',
      'x-dr-user': JSON.stringify({ oid: 'u-stranger', upn: 'stranger@example.test', name }),
    }]);
  }

  const reached = [];
  for (const [how, headers] of attempts) {
    for (const deal of confidential) {
      const r = await fetch(`${base}/api/deals/${deal.id}`, { headers });
      if (r.status === 200) reached.push(`${how} opened ${deal.id}`);
    }
  }
  assert.deepEqual(reached, [], reached.join('; '));
});

// EVERY ROSTER ID, EVERY STRING THAT COULD BE MISTAKEN FOR ONE.
//
// The test above this enumerated three ways to fake an identity and there were five. Each
// was found on its own, after the last one was fixed: the display name bought a role, then
// the display name bought a deal team, then a upn's LOCAL PART bought one — and
// partner@totally-not-the-fund.example has the local part `partner`, which is a roster id on
// Project Sterling, so an address at a domain the firm has never heard of read the record.
//
// Enumerating the ways was the mistake. This enumerates the IDS instead, and tries every
// shape a caller could put one in.
test('no string that merely resembles a roster id opens a confidential deal', async () => {
  const { onDealTeam } = await import('../lib/userPolicy.js');
  const confidential = seededDeals.filter((d) => d.confidential);
  assert.ok(confidential.length, 'no confidential deal in the fixture — this test would be inert');
  const rosterIds = [...new Set(confidential.flatMap((d) => d.team || []))];
  assert.ok(rosterIds.length, 'no team entries to impersonate — this test would be inert');

  const reached = [];
  for (const id of rosterIds) {
    const impostors = [
      { oid: 'u-outsider', upn: `${id}@totally-not-the-fund.example`, name: 'Someone Else' },
      { oid: 'u-outsider', upn: 'outsider@example.test', name: id },
      { oid: 'u-outsider', upn: `${id}` },
      { name: id },
    ];
    for (const who of impostors) {
      for (const deal of confidential) {
        if (onDealTeam(who, deal.team)) reached.push(`${JSON.stringify(who)} matched ${deal.id}`);
        const r = await fetch(`${base}/api/deals/${deal.id}`, {
          headers: { ...seat('partner'), 'x-dr-user': JSON.stringify(who) },
        });
        if (r.status === 200) reached.push(`${JSON.stringify(who)} opened ${deal.id} over HTTP`);
      }
    }
  }
  assert.deepEqual(reached, [], reached.join('; '));

  // And the person whose id it actually is still gets in, or this has been fixed by
  // locking everybody out — which is how the flag came to be a no-op in the first place.
  const real = confidential[0];
  const insider = { oid: (real.team || [])[0], upn: (real.team || [])[0] };
  assert.equal(onDealTeam(insider, real.team), true,
    `${real.id}: the person named on the team is no longer recognised`);
});

// THE SECOND TRANSPORT, WHICH NO TEST HAD EVER DRIVEN.
//
// Everything above this line speaks HTTP. The MCP surface reads the same store through a
// different door, and `confidentialBlock(deal_id) || view(deal_id)` was pasted onto six of
// the eleven tools that take a deal id — get_citation_audit was the one it was not pasted
// onto, so the citation audit for a confidential deal came back in full.
//
// Table-driven off the registered tools, so tool number twelve fails the day it is added
// rather than the day somebody looks.
test('no MCP tool answers about a deal the shared surface may not discuss', async () => {
  const { buildDealMcpServer } = await import('../lib/mcp/dealServer.js');
  const confidential = seededDeals.filter((d) => d.confidential);
  assert.ok(confidential.length, 'no confidential deal in the fixture — this test would be inert');

  const server = buildDealMcpServer({ mode: 'disabled' });
  // The SDK keeps what was registered; reach it however this version exposes it.
  const registered = server._registeredTools || server.registeredTools || {};
  const names = Object.keys(registered);
  assert.ok(names.length > 8, `only ${names.length} tools found — the scan has drifted`);

  const takesDeal = names.filter((n) => {
    const schema = registered[n]?.inputSchema;
    const keys = schema?.shape ? Object.keys(schema.shape) : Object.keys(schema || {});
    return keys.includes('deal_id');
  });
  assert.ok(takesDeal.length > 4, `only ${takesDeal.length} tools take a deal id — the scan has drifted`);

  const leaks = [];
  let invoked = 0;
  for (const name of takesDeal) {
    // `.callback` on this SDK is undefined; the property is `.handler`. Every tool was
    // therefore skipped, `leaks` stayed empty and the assertion passed — thirty-eight tools
    // against three confidential deals in five milliseconds. The two length guards above
    // check ENUMERATION, which is why it looked alive. A test that retires a concern
    // without exercising it is worse than no test, so `invoked` is asserted below.
    const cb = registered[name]?.handler || registered[name]?.callback;
    if (typeof cb !== 'function') continue;
    invoked += 1;
    for (const deal of confidential) {
      let out;
      try { out = await cb({ deal_id: deal.id, step: 'D1', persona: 'analyst' }, {}); }
      catch { continue; } // a schema rejection is a refusal too
      const body = JSON.stringify(out || {}).toLowerCase();
      if (body.includes(String(deal.company || '').toLowerCase())) leaks.push(`${name} named ${deal.id}`);
      for (const figure of [deal.dealSize, deal.ebitda].filter((x) => x != null)) {
        if (body.includes(String(figure))) leaks.push(`${name} quoted ${figure} from ${deal.id}`);
      }
    }
  }
  assert.ok(invoked >= takesDeal.length,
    `only ${invoked} of ${takesDeal.length} tools were actually called — this test is inert`);
  assert.deepEqual(leaks, [], leaks.join('; '));
});

// The signed model link is a capability for ONE workbook, and it was honoured in the
// boundary middleware — so a token for demo-onyx satisfied the guard for the deal record
// itself and all ten of its sub-routes: the returns model, the risk register, the
// citations, the documents. A capability to read a spreadsheet opened the whole deal.
test('a model link buys the two routes it is for and nothing else', async () => {
  const hidden = hiddenFromAnalyst()[0];
  assert.ok(hidden, 'fixture must hide a deal from an analyst');
  // Any token value: what matters is that the OTHER routes do not consult it at all.
  for (const tail of ['', '/case', '/returns', '/risk-register', '/citations', '/documents', '/ic-readiness']) {
    const r = await fetch(`${base}/api/deals/${hidden}${tail}?t=anything`, { headers: seat('analyst') });
    assert.equal(r.status, 404, `${tail || '(record)'} was reachable with a token in the query string (${r.status})`);
  }
});

// A FORGED TOKEN MUST NOT BE BELIEVED, AND AN UNVERIFIABLE ONE IS FORGED.
//
// This is the fault every other test in this file was downstream of. teams-app/server/sso.js
// base64-decoded a JWT payload and returned it — no signature, no issuer, no audience, no
// expiry — so `{"oid":"partner","roles":["admin"]}` between two dots was a signed-in
// administrator. /mcp had verified properly against the tenant's JWKS since the day it was
// written, and its own comment said it guarded only itself: "the rest of the app (the SPA
// and /api/*) stays anonymous by design."
test('a token nobody signed grants nothing', async () => {
  const { verifiedIdentity } = await import('../lib/entraIdentity.js');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forge = (payload) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.${b64('not-a-signature')}`;

  const forgeries = [
    { oid: 'partner', roles: ['DealRoom.Admin'] },
    { oid: 'admin', upn: 'admin', roles: ['DealRoom.Admin'], groups: ['fd59b346-caf3-4fb3-a007-04bb5620c473'] },
    { sub: 'anyone', name: 'Eleanor Shellstrop' },
  ];
  for (const payload of forgeries) {
    const who = await verifiedIdentity(forge(payload));
    assert.equal(who, null, `a token signed by nobody resolved to ${JSON.stringify(who)}`);
  }
  // Garbage, and the empty case, are the same answer.
  for (const junk of ['', 'not-a-token', 'a.b', 'a.b.c']) {
    assert.equal(await verifiedIdentity(junk), null, `"${junk}" resolved to an identity`);
  }
});

// The tab is the other half: it is what turns a browser into a person for the backend.
test('the tab does not accept an identity it has not verified', async () => {
  const src = await readFile(new URL('../../teams-app/server/sso.js', import.meta.url), 'utf8');
  assert.match(src, /jwtVerify\(/, 'the SSO path must verify a signature, not decode a payload');
  assert.match(src, /createRemoteJWKSet\(/, 'verification must use the tenant JWKS');
  assert.match(src, /issuer:/, 'the issuer must be checked');
  assert.match(src, /audience:/, 'the audience must be checked');
  // The exact shape of the bug: reading the payload segment straight off the wire.
  assert.doesNotMatch(src, /Buffer\.from\(ssoToken\.split\('\.'\)\[1\]/,
    'the SSO token payload is being decoded rather than verified');
});

// The walkthrough credential, in both directions.
//
// A demo still has to be shown to somebody who has not been given a directory account, and
// the honest way to do that is a credential the DEPLOYMENT holds rather than a header
// anyone can guess — which is what `x-dr-as: admin` was. It shows the room and never
// changes it.
test('the walkthrough credential opens a seat and cannot write', async () => {
  const KEY = process.env.DEMO_ACCESS_KEY;
  const { describeDemoProfiles } = await import('../lib/userPolicy.js');
  // The walkthrough names somebody on the roster, so it needs both the key and the roster.
  // Without either it is inert BY DESIGN rather than by accident, which is worth saying
  // out loud given how many tests in this file turned out to be inert by accident.
  if (!KEY || !describeDemoProfiles().length) {
    assert.ok(true, 'no walkthrough key or no roster in this run — the path is unreachable here');
    return;
  }
  const demo = (who) => ({ 'x-dr-demo-key': KEY, 'x-dr-demo-as': who, 'content-type': 'application/json' });

  const rows = await (await fetch(`${base}/api/deals`, { headers: demo('member') })).json();
  assert.ok(Array.isArray(rows), 'the walkthrough seat was refused a deal list');

  // A wrong key is nobody, and so is a right key naming a person who does not exist.
  for (const headers of [{ 'x-dr-demo-key': 'not-the-key', 'x-dr-demo-as': 'partner' }, { 'x-dr-demo-key': KEY, 'x-dr-demo-as': 'zaphod' }]) {
    const r = await fetch(`${base}/api/deals`, { headers });
    assert.equal(r.status, 401, `a bad walkthrough credential was answered ${r.status}`);
  }

  if (rows.length) {
    const r = await fetch(`${base}/api/deals/${rows[0].id}/issues`, {
      method: 'POST',
      headers: demo('partner'),
      body: JSON.stringify({ lane: 'commercial', title: 'written by a walkthrough', severity: 'low' }),
    });
    assert.ok(r.status >= 400, `a walkthrough wrote to a deal (${r.status})`);
  }
});

// Awareness is policy, and policy has to be able to reach a deployment that already exists.
//
// hydrate() inserts a seeded deal only when its id is missing, which is right for the
// record and wrong for the rules: four origination deals were marked visible to the firm
// and neither deployment ever showed them, because both already had the ids. The full
// reseed would have fixed it by replacing the whole record — and every diligence finding
// on prod was recorded at runtime with none of it in the fixture, so that would have
// discarded the substance to correct a flag.
test('the fixture governs who may know a deal exists, on an environment that already booted', async () => {
  const { listDeals, getDealRaw } = await import('../lib/store.js');
  const aware = seededDeals.filter((d) => d.pipelineVisible && !d.confidential);
  assert.ok(aware.length > 4, `only ${aware.length} deals are marked visible — this test would be weak`);

  for (const d of aware) {
    const live = getDealRaw(d.id);
    if (!live) continue;
    assert.equal(!!live.pipelineVisible, true, `${d.id} is marked visible in the fixture and is not in the store`);
  }
  for (const d of seededDeals.filter((x) => x.confidential)) {
    const live = getDealRaw(d.id);
    if (!live) continue;
    assert.equal(!!live.confidential, true, `${d.id} is confidential in the fixture and is not in the store`);
  }

  // And a member is shown every one of them, which is the observable half.
  const seen = new Set(listDeals(null, 'member').map((x) => x.id));
  const missing = aware.map((d) => d.id).filter((id) => !seen.has(id));
  assert.deepEqual(missing, [], `marked visible to the firm and not listed to a member: ${missing.join(', ')}`);
});

// THE SWITCHER RENDERED FOURTEEN BLANK ROWS AND THE PERSONAS LOOKED GONE.
//
// Proving you are the APP and proving who you are are different things, and the trim on
// this route conflated them. Once asserted identities stopped counting, the tab's own
// bootstrap call resolved as anonymous, so it got {id, name} with no label — and the demo
// switcher, which renders the label, showed fourteen empty entries.
//
// The app has to be able to draw the sign-in list before anyone has signed in. That is the
// whole reason this route is reachable at all, and it is worth a test, because it broke in
// a way that looked like data loss rather than like a permissions change.
test('the app can always draw a usable sign-in list', async () => {
  const { describeDemoProfiles } = await import('../lib/userPolicy.js');
  if (!describeDemoProfiles().length) { assert.ok(true, 'no roster in this run'); return; }

  const r = await fetch(`${base}/api/demo-profiles`, { headers: { 'x-bot-key': process.env.BOT_BACKEND_KEY } });
  assert.equal(r.status, 200, `the app was refused the sign-in list (${r.status})`);
  const rows = await r.json();
  assert.ok(rows.length, 'the sign-in list is empty');
  for (const p of rows) {
    assert.ok(p.id, 'a profile has no id to sign in as');
    // Whatever the switcher shows, it must have SOMETHING to show.
    assert.ok(p.name || p.label, `${p.id} would render as a blank row`);
  }
});
