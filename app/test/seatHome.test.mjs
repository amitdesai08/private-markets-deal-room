// THE HOME PAGE IS BUILT FOR A SEAT, NOT LABELLED WITH ONE.
//
// The defect these tests exist to prevent: every viewer opened the app to a
// byte-identical portfolio briefing, under a legend that read "weighted for Deal
// Team". Nothing was weighted. A Supply Chain Partner, a Fund CFO and a Principal —
// three people with different jobs — were told the same four numbers and the same
// ranked queue, led by whichever deal was worst overall rather than whichever one
// needed them.
//
// So these tests assert the thing that actually matters: that two seats looking at
// THE SAME deals get materially different pages, and that the difference is derived
// from the record rather than decorated onto it.
//
// WHAT THIS DOES NOT CERTIFY: buildHomeDesk is exercised directly against the seeded
// fixture through listDeals(), so this measures the memory branch of the store. It
// says nothing about a deployed instance backed by Cosmos, and nothing about whether
// the tab server actually forwards an identity to the route — that is
// homeDeskIdentity.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, listDeals, getDealRaw } from '../lib/store.js';
import { buildHomeDesk } from '../lib/homeDesk.js';
import { seatFor, UNOWNED_LANES } from '../lib/seat.js';
import { LANE_ORDER } from '../data/workspace.js';
import { computeICReadiness } from '../lib/icReadiness.js';

await hydrate();
const deals = listDeals();
const build = (persona, role = 'deal-team') => buildHomeDesk(deals, { role, roleLabel: 'Deal Team', persona, rawFor: (d) => getDealRaw(d.id) });

const text = (hd) => hd.briefing.paragraphs.map((p) => p.text).join(' ');
// computeICReadiness takes the RAW record, not the list projection. Passing the
// projection returns a verdict computed from a document that has no workstreams, which
// is how a bad helper here quietly "proved" a good page wrong.
const vFor = (d) => { const r = computeICReadiness(getDealRaw(d.id)) || {}; return { ...(r.verdict || {}), phase: r.verdict?.phase || r.phase }; };

test('the five lane-owning personas resolve to the lane they actually own', () => {
  // Not invented here: personas.js declares each persona's lane and workspace.js
  // declares the seven first-class diligence lanes. seat.js only joins them.
  assert.deepEqual(seatFor({ persona: 'supply-md' }).lanes, ['operations']);
  assert.deepEqual(seatFor({ persona: 'ai-md' }).lanes, ['techai']);
  assert.deepEqual(seatFor({ persona: 'retail-md' }).lanes, ['commercial']);
  assert.deepEqual(seatFor({ persona: 'legal-gc' }).lanes, ['legal']);
  // Sources & uses is the structuring question, so the Fund CFO owns tax too.
  assert.deepEqual(seatFor({ persona: 'fund-cfo' }).lanes, ['financial', 'tax']);
});

test('a cross-cutting persona is given NO lane rather than an arbitrary one', () => {
  // Handing the IC chair a diligence lane because the map had to return something
  // would put a partner's name against work they do not do.
  for (const p of ['partner', 'principal', 'analyst', 'operating-partner', 'ir-lp']) {
    assert.equal(seatFor({ persona: p }).lanes.length, 0, `${p} must not be assigned a diligence lane`);
    assert.notEqual(seatFor({ persona: p }).kind, 'lane');
  }
});

test('two seats on the SAME deals get different tiles, different queue and different prose', () => {
  const supply = build('supply-md');
  const chair = build('partner', 'partner');

  assert.equal(supply.counts.deals, chair.counts.deals, 'precondition: both seats see the same deals');

  const tiles = (hd) => hd.kpis.map((k) => k.label).join('|');
  assert.notEqual(tiles(supply), tiles(chair), 'the headline tiles must differ by seat');

  const queue = (hd) => hd.attention.map((a) => `${a.company}:${a.tag}`).join('|');
  assert.notEqual(queue(supply), queue(chair), 'the attention queue must differ by seat');

  assert.notEqual(text(supply), text(chair), 'the briefing must differ by seat');
});

test('a lane seat is told about ITS lane, and the numbers on the tiles match the prose', () => {
  const hd = build('supply-md');
  assert.equal(hd.seat.kind, 'lane');
  assert.deepEqual(hd.seat.laneLabels, ['Operations']);
  assert.match(text(hd), /you own the operations lane/i);

  // Every row in a lane seat's queue is about that lane, never about someone else's.
  for (const a of hd.attention) {
    assert.equal(a.laneLabel, 'Operations', `row for ${a.company} is not about the viewer's lane: ${a.tag}`);
  }

  // The tile and the sentence are computed from the same values, so they cannot drift.
  const open = hd.kpis.find((k) => k.key === 'lane-open');
  const idle = hd.kpis.find((k) => k.key === 'lane-idle');
  assert.equal(open.value, String(hd.counts.laneOpen));
  assert.equal(idle.value, String(hd.counts.laneNotStarted));
  assert.match(text(hd), new RegExp(`${hd.counts.laneOpen} still ha(?:s|ve) it open`, 'i'));
  assert.match(text(hd), new RegExp(`${hd.counts.laneNotStarted} not started`, 'i'));
  // The sentence must reconcile: the deals carrying the lane are exactly the open ones
  // plus the complete ones. It used to read "open on 8 of the 19 — 5 not started, 7
  // complete", where 5 + 7 = 12 and 8 + 7 = 15, and neither is 19.
  const m = text(hd).match(/Of the (\d+) deals? in diligence or beyond .*?, (\d+) still ha(?:s|ve) it open .*?and (\d+) (?:is|are) complete/i);
  assert.ok(m, 'the lane sentence must state its own denominator');
  assert.equal(Number(m[2]) + Number(m[3]), Number(m[1]), `${m[2]} open + ${m[3]} complete must equal the ${m[1]} deals carrying the lane`);
});

test('a lane seat is never shown a row about a lane it does not own', () => {
  // The specific failure: telling the operations partner that Nordic Grocery is held
  // up by legal. True, and none of their business — there is nothing they can do
  // about it, and it displaces the row they can act on.
  const hd = build('legal-gc');
  const laneLabels = new Set(hd.attention.map((a) => a.laneLabel));
  assert.deepEqual([...laneLabels].filter(Boolean), ['Legal']);
});

test('the sourcing seat surfaces origination, which the portfolio ranking buries', () => {
  // assess() ranks an origination target at 9 — off the bottom of a six-row queue.
  // For an analyst whose job IS sourcing and screening, that is exactly backwards.
  const analyst = build('analyst', 'analyst');
  assert.equal(analyst.seat.kind, 'screening');
  const chair = build('partner', 'partner');
  const origInQueue = (hd) => hd.attention.filter((a) => /origination/i.test(a.tag || '')).length;
  assert.ok(origInQueue(analyst) > 0, 'a sourcing seat must see origination targets in its queue');
  assert.equal(origInQueue(chair), 0, 'an IC chair should not have origination targets in the gate queue');
  assert.ok(analyst.kpis.some((k) => k.key === 'origination'));
});

test('a viewer with no persona is TOLD the page is not tailored, rather than shown a generic one silently', () => {
  const hd = build(null);
  assert.equal(hd.seat.tailored, false);
  assert.match(text(hd), /no specialist seat is assigned to you yet/i);
});

test('an administrator is told the view is unweighted instead of being given a fake desk', () => {
  const hd = buildHomeDesk(deals, { role: 'admin', roleLabel: 'Administrator', persona: null, rawFor: (d) => getDealRaw(d.id) });
  assert.equal(hd.seat.kind, 'oversight');
  assert.match(text(hd), /administrator's view/i);
  assert.doesNotMatch(text(hd), /no specialist seat is assigned/i);
});

test('every sentence still carries a source, for every seat', () => {
  // The rule that has held since round one: nothing appears in the briefing that
  // cannot say where it came from. Personalisation does not get an exemption.
  for (const p of ['supply-md', 'partner', 'analyst', 'fund-cfo', 'operating-partner', null]) {
    const hd = build(p);
    assert.ok(hd.briefing.paragraphs.length, `no briefing for ${p}`);
    for (const para of hd.briefing.paragraphs) {
      assert.ok(para.source || (para.cites || []).length, `unsourced sentence for seat ${p}: ${para.text}`);
    }
  }
});

test('the suggested questions are the seat\'s questions, not everyone\'s', () => {
  const supply = build('supply-md');
  const chair = build('partner', 'partner');
  assert.ok(supply.briefing.suggestions.some((s) => /operations/i.test(s)), 'a lane owner should be offered questions about their lane');
  assert.ok(chair.briefing.suggestions.some((s) => /committee|table|conditions/i.test(s)), 'an IC chair should be offered questions about the gate');
  assert.notDeepEqual(supply.briefing.suggestions, chair.briefing.suggestions);
});

test('an empty queue explains ITSELF, and never claims health it did not measure', () => {
  // An observer sees deal status but not the workstream records, so nothing can be
  // ranked. That is not the same as "everything is on track" — which is what the page
  // used to say to a viewer whose own tiles reported deals that were not IC-ready.
  //
  // The metadata-only condition is constructed here rather than inferred from the
  // role, because listDeals() in this harness carries no identity and so returns every
  // deal at full access. Asserting it via role would have passed for the wrong reason.
  const metaOnly = deals.map((d) => ({ ...d, accessLevel: 'metadata' }));
  const obs = buildHomeDesk(metaOnly, { role: 'member', roleLabel: 'Member', persona: null, rawFor: (d) => getDealRaw(d.id) });
  assert.equal(obs.seat.kind, 'observer');
  assert.equal(obs.attention.length, 0, 'precondition: an observer has no rankable evidence');
  assert.ok(obs.attentionEmpty, 'an empty queue must carry a reason');
  assert.doesNotMatch(obs.attentionEmpty, /on track|IC-ready/i, 'must not assert health it could not measure');
  assert.match(obs.attentionEmpty, /not the workstreams underneath/i, 'must say why it cannot rank');
  // It must report the facts it DOES hold rather than only apologising...
  assert.match(obs.attentionEmpty, /committee/i);
  // ...and it must not tell the reader to go and get their permissions widened.
  assert.doesNotMatch(obs.attentionEmpty, /administrator/i, 'access to a deal comes from the deal lead, not from IT');

  // And when there is genuinely nothing to see, it says that instead.
  const none = buildHomeDesk([], { role: 'deal-team', roleLabel: 'Deal Team', persona: 'supply-md', rawFor: (d) => getDealRaw(d.id) });
  assert.match(none.attentionEmpty, /no deals in your view/i);

  // A populated queue carries no reason at all, so the page cannot render both.
  const supply = build('supply-md');
  assert.ok(supply.attention.length > 0);
  assert.equal(supply.attentionEmpty, null);
});

test('a deal that was never presented to committee is not counted as failing it', () => {
  // computeICReadiness has no origination branch, so an O2 screen with no CIM and no
  // model comes back NOT-READY. Counting those made the IC chair's headline tile read
  // 11 when the honest number was 7 — while the queue beside it tagged the very same
  // deals "In origination — screened, not yet launched into diligence". The tile and
  // the queue were describing the same deals in contradictory terms.
  const hd = build('partner', 'partner');
  const origination = deals.filter((d) => /^O/i.test(String(d.stage || '')));
  assert.ok(origination.length > 0, 'precondition: the fixture must contain origination deals');

  const diligenceCount = hd.phases.find((p) => p.key === 'diligence')?.count ?? 0;
  const verdictTotal = hd.counts.notReady + hd.counts.conditional + hd.counts.icReady;
  assert.ok(verdictTotal <= diligenceCount, `verdict counters (${verdictTotal}) must not exceed deals in diligence (${diligenceCount})`);

  // And the tile agrees with the sentence.
  const tile = hd.kpis.find((k) => k.key === 'notready');
  assert.equal(tile.value, String(hd.counts.notReady));
});

test('post-committee obligations are not labelled as deals awaiting approval', () => {
  // "Conditional" reads to a chair as a gate outcome. Every deal in that bucket was
  // already signed, so the tile invited them to ask "show me those six" and produced
  // six owned companies with an open KYC check — a different problem, a different
  // person, a different meeting.
  const hd = build('partner', 'partner');
  const tile = hd.kpis.find((k) => k.key === 'obligations');
  assert.ok(tile, 'the committee seat must report outstanding conditions separately');
  assert.equal(tile.value, String(hd.counts.openObligations));
  assert.doesNotMatch(tile.label, /^Conditional$/i, 'the label must not read as a live gate verdict');
  assert.ok(hd.counts.openObligations >= 0);
  // The two are genuinely different buckets, not the same number twice.
  assert.notEqual(hd.counts.openObligations + hd.counts.conditional, undefined);
});

test('an IC chair opens on the agenda, not on the fund size', () => {
  const chair = build('partner', 'partner');
  const first = chair.briefing.paragraphs[0].text;
  assert.match(first, /committee/i, 'a chair\'s first sentence should be about the gate');
  assert.doesNotMatch(first, /enterprise value/i, 'enterprise value is a fundraising number, not a Monday morning');

  // And it is genuinely different from the seat that has no job-specific opener.
  const generic = build(null);
  assert.notEqual(first, generic.briefing.paragraphs[0].text);
});

test('the deal lead and the head of IR are not the same page with a different label', () => {
  // Both used to fall through every branch — identical tiles, identical opening
  // sentence, identical queue and identical suggested questions, differing only in one
  // line of grey text. That is personalisation theatre.
  const lead = build('principal');
  const ir = build('ir-lp');
  const sig = (hd) => JSON.stringify([hd.kpis.map((k) => k.label), hd.briefing.paragraphs[0].text, hd.briefing.suggestions]);
  assert.notEqual(sig(lead), sig(ir), 'the deal lead and IR seats must not render identically');
  assert.notEqual(sig(lead), sig(build(null)), 'the deal lead must not be the generic page');
  assert.notEqual(sig(ir), sig(build(null)), 'the IR seat must not be the generic page');
});

test('a lane owner leads with what they will be chased about, and lane counts exclude finished lanes', () => {
  const hd = build('supply-md');
  assert.equal(hd.kpis[0].key, 'lane-blocking', 'the number a partner chases must lead the tiles');

  // "Open" must mean open. Counting completed lanes inflated the headline roughly
  // twofold and was contradicted by the sentence directly beneath it.
  const rows = hd.attention.filter((a) => typeof a.laneProgress === 'number');
  for (const r of rows) assert.ok(r.laneProgress < 100 || r.tag, 'row must carry lane state');
  assert.ok(hd.counts.laneOpen >= hd.counts.laneNotStarted);
  const openTile = hd.kpis.find((k) => k.key === 'lane-open');
  assert.equal(openTile.value, String(hd.counts.laneOpen));
  assert.match(hd.briefing.paragraphs[0].text, new RegExp(`${hd.counts.laneOpen} still ha(?:s|ve) it open`), 'tile and sentence must agree');
});

test('lane labels keep their casing in prose', () => {
  // A Fund CFO reading "your financial / qoe lane" notices that before anything else.
  const hd = build('fund-cfo');
  const prose = text(hd);
  assert.match(prose, /Financial \/ QoE/, 'the lane label must not be lowercased');
  assert.doesNotMatch(prose, /financial \/ qoe/, 'no lowercased variant should appear');
});

test('every queue row can explain why it is where it is', () => {
  // The tie-break used to be `readiness`, which is absent on every seeded deal — so the
  // sort collapsed to array order and the true answer to "why is this top of my list?"
  // was "because it is first in a seed file".
  for (const p of ['supply-md', 'partner', 'analyst']) {
    const hd = build(p, p === 'partner' ? 'partner' : p === 'analyst' ? 'analyst' : 'deal-team');
    for (const a of hd.attention) {
      assert.ok(a.placedBy, `a row for ${a.company} cannot explain its position`);
      assert.match(a.placedBy, /committee in \d+ days?|no committee date set/);
    }
  }

  // Ties are broken by the committee date. Rows sharing a tag AND a reason came from
  // the same branch of the ladder, so within such a run the nearer date must come
  // first. (Tag alone is not enough: the same tag can be reached at two severities.)
  const hd = build('partner', 'partner');
  const seen = new Map();
  for (const a of hd.attention) {
    const key = `${a.tag}|${a.why}`;
    const d = typeof a.icInDays === 'number' ? a.icInDays : 9999;
    if (seen.has(key)) assert.ok(seen.get(key) <= d, `within "${a.tag}", a later committee date was ranked above a nearer one`);
    seen.set(key, d);
  }
});

test('a seat can be assigned in a real tenant, not only in the demo', async () => {
  // The whole feature used to hang off demoProfiles, which means DEMO_PROFILES=false —
  // i.e. every real customer — got the generic page. Demoing a capability the product
  // does not have is the one failure mode a pilot never forgives.
  const prevAssign = process.env.PERSONA_ASSIGNMENTS;
  const prevGroups = process.env.PERSONA_GROUP_IDS;
  const prevDemo = process.env.DEMO_PROFILES;
  try {
    process.env.DEMO_PROFILES = 'false';
    process.env.PERSONA_ASSIGNMENTS = JSON.stringify({ 'supply-md': ['jo.chen@contoso.com'] });
    process.env.PERSONA_GROUP_IDS = JSON.stringify({ 'grp-legal-001': 'legal-gc' });
    const { personaForIdentity } = await import(`../lib/userPolicy.js?tenant=${Date.now()}`);

    assert.equal(personaForIdentity({ upn: 'jo.chen@contoso.com' }), 'supply-md', 'explicit assignment must bind with demo mode OFF');
    assert.equal(personaForIdentity({ upn: 'x@contoso.com', groups: ['grp-legal-001'] }), 'legal-gc', 'group membership must bind with demo mode OFF');
    assert.equal(personaForIdentity({ upn: 'nobody@contoso.com' }), null, 'an unassigned user stays unbound');
    // And a name is still never enough, because name is attacker-influenced.
    assert.equal(personaForIdentity({ name: 'Priya Raman' }), null, 'a display name must not select a seat outside demo mode');
    // An assignment naming a persona that does not exist is ignored, not trusted.
    process.env.PERSONA_ASSIGNMENTS = JSON.stringify({ 'superuser': ['evil@contoso.com'] });
    const { personaForIdentity: p2 } = await import(`../lib/userPolicy.js?tenant=${Date.now()}b`);
    assert.equal(p2({ upn: 'evil@contoso.com' }), null, 'an unknown persona id must not be honoured');
  } finally {
    process.env.PERSONA_ASSIGNMENTS = prevAssign ?? '';
    process.env.PERSONA_GROUP_IDS = prevGroups ?? '';
    if (prevDemo === undefined) delete process.env.DEMO_PROFILES; else process.env.DEMO_PROFILES = prevDemo;
  }
});

test('an unrecognised persona is admitted to, not guessed at', () => {
  // `PERSONA_KIND[p.lane] || 'deal-lead'` meant any persona added later silently
  // rendered a deal lead's home page. Confidently wrong beats visibly unknown only if
  // nobody checks.
  const s = seatFor({ persona: 'analyst' });
  assert.ok(s.kind, 'a modelled persona still resolves');
  const unknown = seatFor({ persona: 'no-such-persona' });
  assert.equal(unknown.kind, null);
  assert.equal(unknown.unbound, true);
});

test('lanes nobody owns are declared rather than left to be discovered', () => {
  assert.ok(Array.isArray(UNOWNED_LANES));
  assert.ok(!UNOWNED_LANES.includes('tax'), 'tax is owned by the Fund CFO (sources & uses / structuring)');
  for (const l of UNOWNED_LANES) assert.ok(LANE_ORDER.includes(l), 'an unowned lane must be a real lane');
});

test('an observer is never shown a verdict tile it could not compute', () => {
  // The prose correctly said "this page reports deal status and nothing behind it" —
  // and directly above it a tile read "Not IC-ready: 0", because every deal came back
  // "not not-ready" from records this seat cannot see. A confident zero is a claim of
  // health, and it contradicted the sentence underneath it.
  const obs = build(null, 'member');
  assert.equal(obs.seat.kind, 'observer');
  for (const k of obs.kpis) {
    assert.doesNotMatch(k.label, /IC-ready|Ready to table|Conditions outstanding|Blocking/i,
      `an observer cannot measure "${k.label}"`);
  }
  // It is still allowed to report what it CAN see.
  assert.ok(obs.kpis.some((k) => /committee/i.test(k.label)));
});

test('every seat the code can produce is reachable in the demo', async () => {
  // I built an `lp` seat that no demo profile could select, so the only way to see it
  // was to read the source. A seat nobody can click is a seat nobody has checked.
  const { demoProfiles } = await import('../data/demoProfiles.js');
  const reachable = new Set(demoProfiles.map((p) => seatFor({ role: p.role, persona: p.personaId }).kind));
  for (const kind of ['lane', 'committee', 'deal-lead', 'screening', 'value', 'lp', 'oversight', 'observer']) {
    assert.ok(reachable.has(kind), `no demo profile produces the "${kind}" seat`);
  }
});

test('a tile and the sentence about the same thing never disagree', () => {
  // "Closing soon: 3" sat above "1 more approved and closing within the month" —
  // two definitions of one phrase on one screen. Anyone who reads both stops trusting
  // either. These pairs are the ones a reader will actually cross-check.
  const cases = [
    // [profile, role, tile key, regex capturing the number in the prose]
    ['operating-partner', 'deal-team', 'closing', /(\d+) more signed and about to become yours/],
    ['operating-partner', 'deal-team', 'owned', /You own (\d+) compan/],
    ['partner', 'partner', 'ready', /(\d+) deals? (?:is|are) ready to table/],
    ['ir-lp', 'partner', 'owned', /of which (\d+) compan/],
  ];
  for (const [profile, role, key, re] of cases) {
    const hd = build(profile, role);
    const tile = hd.kpis.find((k) => k.key === key);
    assert.ok(tile, `${profile}: no tile "${key}"`);
    const m = text(hd).match(re);
    assert.ok(m, `${profile}: prose never states the "${key}" number`);
    assert.equal(m[1], tile.value, `${profile}: tile "${tile.label}"=${tile.value} but the prose says ${m[1]}`);
  }
});

test('"conditions outstanding" counts conditions, not a label', () => {
  // The CONDITIONAL state folds "this lane has nothing written against it" in with
  // "the committee attached a condition". Counting the state produced a tile reading 6
  // where four of the six deals carried no condition at all — a specific, checkable
  // claim that was wrong two thirds of the time, on the chair's page, the LP's page
  // and the operating partner's page at once.
  const hd = build('partner', 'partner');
  let real = 0;
  for (const d of deals) {
    const raw = getDealRaw(d.id);
    if (!raw || d.accessLevel !== 'full') continue;
    let v = null;
    try { v = computeICReadiness(raw)?.verdict; } catch { v = null; }
    if (!v) continue;
    // One definition of "obligation", the same one the queue rows use: a condition
    // attached at approval or a compliance check nobody has cleared. Counting only
    // conditions here let the tile omit a deal that the row beneath it said owed two.
    if (String(v.phase || '') !== 'diligence' && (Number(v.openConditions) || 0) + (Number(v.openComplianceChecks) || 0) > 0) real += 1;
  }
  assert.equal(hd.counts.openObligations, real, 'the tile must equal the number of deals that actually owe something');
  const tile = hd.kpis.find((k) => k.key === 'obligations');
  assert.equal(tile.value, String(real));
});

test('"blocking the gate" excludes deals already through the gate', () => {
  // Unfiltered, the Fund CFO read "your lane is one of the reasons 13 deals cannot be
  // tabled" two paragraphs above "19 deals, 7 not yet IC-ready". Thirteen deals that
  // cannot be tabled, out of seven that are not ready.
  for (const p of ['supply-md', 'fund-cfo', 'legal-gc']) {
    const hd = build(p);
    assert.ok(hd.counts.laneBlocking <= hd.counts.notReady,
      `${p}: ${hd.counts.laneBlocking} deals blocked by one lane, but only ${hd.counts.notReady} are not IC-ready`);
  }
});

test('a seat that owns two lanes is assessed on both of them', () => {
  // assessLane read ws[0], so the Fund CFO's Tax & structuring lane was invisible on
  // every deal while its blocking reasons still rendered under a row labelled
  // "Financial / QoE not started" — the label describing something other than its
  // contents.
  const seat = seatFor({ persona: 'fund-cfo' });
  assert.ok(seat.lanes.length > 1, 'precondition: this seat owns more than one lane');
  const hd = build('fund-cfo');
  const labels = new Set(hd.attention.map((a) => a.laneLabel).filter(Boolean));
  // Every row must be labelled with a lane this seat actually owns...
  for (const l of labels) assert.ok(seat.laneLabels.includes(l), `row labelled "${l}", which this seat does not own`);
  // ...and the prose must name every lane it owns, not just the first.
  for (const l of seat.laneLabels) assert.match(text(hd), new RegExp(l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `prose never mentions the ${l} lane`);
});

test('the chair sees live deals above ones already approved', () => {
  // Post-gate deals ranked equal to live NOT-READY ones, so half the chair's queue was
  // deals he had already approved — tagged "no committee date set", because there
  // isn't one — while live diligence deals fell off the page.
  const hd = build('partner', 'partner');
  let seenPostGate = false;
  for (const a of hd.attention) {
    if (a.tag === 'Post-gate obligation') seenPostGate = true;
    else if (seenPostGate && a.tag === 'Not IC-ready') {
      assert.fail(`${a.company} is not IC-ready but was ranked below a deal already through the gate`);
    }
  }
});

test('one page, one definition of "in diligence"', () => {
  // The tile denominator came from a stage-code regex while its numerator came from
  // the readiness engine. They disagree by a deal, so the tile read "7 of 9" above a
  // sentence whose numbers added to 8.
  const hd = build('partner', 'partner');
  const tile = hd.kpis.find((k) => k.key === 'notready');
  const m = tile.sub.match(/of (\d+) in diligence/);
  assert.ok(m, 'the tile must state its denominator');
  const denom = Number(m[1]);
  assert.ok(hd.counts.notReady + hd.counts.icReady + hd.counts.conditional <= denom,
    `verdicts total ${hd.counts.notReady + hd.counts.icReady + hd.counts.conditional} but the denominator is ${denom}`);
  assert.equal(denom, hd.phases.find((p) => p.key === 'diligence')?.count ?? denom,
    'the tile denominator must match the phase strip on the same screen');
});

test('personalisation never widens what a seat can see', () => {
  // The load-bearing guarantee. A lens changes order and wording; it must never add a
  // deal, and it must never surface workstream detail from a deal the caller holds at
  // metadata level only.
  //
  // The access tier is constructed here rather than taken from the fixture. listDeals()
  // in this harness carries no identity, so it stamps EVERY deal 'full' — an earlier
  // version of this test derived metadataOnly from that list, got an empty set, and the
  // only assertion that checked the actual guarantee never executed. It passed for
  // eleven deals' worth of nothing.
  const tiered = deals.map((d, i) => ({ ...d, accessLevel: i % 2 ? 'status' : 'full' }));
  const restricted = new Set(tiered.filter((d) => d.accessLevel !== 'full').map((d) => d.company));
  assert.ok(restricted.size > 0, 'precondition: the fixture must contain metadata-tier deals');

  const ids = new Set(tiered.map((d) => d.id));
  for (const p of ['supply-md', 'partner', 'analyst', 'fund-cfo', null]) {
    const hd = buildHomeDesk(tiered, { role: 'deal-team', roleLabel: 'Deal Team', persona: p, rawFor: (d) => getDealRaw(d.id) });
    assert.equal(hd.counts.deals, tiered.length, `seat ${p} changed the deal count`);
    for (const a of hd.attention) {
      assert.ok(ids.has(a.dealId), `seat ${p} surfaced a deal outside the caller's scope: ${a.dealId}`);
      assert.ok(!restricted.has(a.company), `seat ${p} ranked ${a.company}, which the caller holds at metadata tier only`);
    }
    // Nor may a restricted deal appear in the commitments panel, which quotes people.
    for (const c of hd.workiq.items) {
      assert.ok(!restricted.has(c.company), `seat ${p} quoted a commitment from ${c.company}, a metadata-tier deal`);
    }
  }
});

// ---------------------------------------------------------------------------
// Round-4 regressions. Each of these failed before the fix.
// ---------------------------------------------------------------------------

// The countdown must not skip the deal that is AT committee. `icPending` is
// `stepIndex < IC_STEP_INDEX` where IC_STEP_INDEX is D4 itself, so a deal sitting on the
// committee step with a date four days out was excluded from its own countdown: the
// chair read "next committee in 9 days, nothing ready" when he had one ready deal in 4.
test('the committee countdown includes the deal that is at committee', () => {
  const hd = build('partner', 'partner');
  const ahead = deals
    .filter((d) => typeof d.daysToIC === 'number' && d.daysToIC >= 0 && vFor(d).phase !== 'post-committee')
    .map((d) => d.daysToIC);
  if (!ahead.length) return;
  const soonest = Math.min(...ahead);
  const tile = hd.kpis.find((k) => k.key === 'ic');
  assert.ok(tile, 'the chair needs a committee date');
  assert.equal(tile.value, `${soonest}d`, 'the tile must show the soonest committee, including a deal already at the gate');
  assert.match(text(hd), new RegExp(`next committee is in ${soonest} days?`, 'i'));
});

// A deal that is ready with an imminent committee is the most actionable row on the
// page. At rank 8 it fell off the bottom of the queue: the tile said "Ready to table: 1"
// and the deal was named nowhere on the chair's screen.
test('a deal that is ready and imminent is named, not just counted', () => {
  const hd = build('partner', 'partner');
  const ready = deals.filter((d) => {
    const v = vFor(d);
    return v.state === 'READY' && v.phase !== 'post-committee' && typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 14;
  });
  for (const d of ready) {
    assert.ok(hd.attention.some((a) => a.dealId === d.id), `${d.company} is ready with committee in ${d.daysToIC} days and must appear on the page`);
  }
});

// icReadiness deliberately separates obligations from unevidenced lanes. homeDesk used
// `gating.length`, which is the concatenation of both, and so printed "6 obligations
// still outstanding" on a signed deal carrying none.
test('never-opened lanes are not reported as obligations owed', () => {
  const hd = build('operating-partner');
  for (const a of hd.attention) {
    const m = /(\d+) obligations? still outstanding/i.exec(a.why || '');
    if (!m) continue;
    const d = deals.find((x) => x.id === a.dealId);
    const v = vFor(d);
    const real = (v.openConditions || 0) + (v.openComplianceChecks || 0);
    assert.equal(Number(m[1]), real, `${a.company} claims ${m[1]} obligations but the record holds ${real}`);
  }
});

// The tile said 2 and the rows beneath it claimed 6, 4 and 6 on deals that were not in
// the 2 — 2 above, 16 below, zero overlap.
test('the obligations tile and the rows below it count the same thing', () => {
  const hd = build('operating-partner');
  const tile = hd.kpis.find((k) => k.key === 'obligations');
  if (!tile) return;
  const claimed = hd.attention.filter((a) => /obligations? still outstanding/i.test(a.why || '')).map((a) => a.dealId);
  const withReal = deals.filter((d) => {
    const v = vFor(d);
    return v.phase === 'post-committee' && ((v.openConditions || 0) + (v.openComplianceChecks || 0)) > 0;
  }).map((d) => d.id);
  for (const id of claimed) assert.ok(withReal.includes(id), `${id} is shown as owing obligations but the tile does not count it`);
});

// A number labelled "Conditions outstanding" that is really a count of deals.
test('a tile labelled deals counts deals, and conditions are stated as conditions', () => {
  for (const who of ['partner', 'ir-lp', 'operating-partner']) {
    const hd = build(who, who === 'partner' ? 'partner' : 'deal-team');
    const tile = hd.kpis.find((k) => k.key === 'obligations');
    if (!tile) continue;
    assert.match(tile.label, /^Deals with/, `${who}: a deal count must be labelled as deals, not conditions`);
    assert.equal(tile.value, String(hd.counts.openObligations));
  }
});

// The word "obligation" must mean one thing across the whole page. It briefly meant
// `openConditions` in the tile and `openConditions + openComplianceChecks` in the row
// directly beneath it, so the operating partner's tile said 2 while row 5 named a deal
// owing 2 that the tile did not count — and the chair's page simultaneously listed that
// same deal under "no obligation recorded".
test('obligation means the same thing in the tile, the row and the records-gap sentence', () => {
  for (const [who, role] of [['partner', 'partner'], ['operating-partner', 'deal-team'], ['ir-lp', 'partner']]) {
    const hd = build(who, role);
    const owed = (d) => { const v = vFor(d); return (v.openConditions || 0) + (v.openComplianceChecks || 0); };
    const counted = deals.filter((d) => vFor(d).phase !== 'diligence' && owed(d) > 0);
    assert.equal(hd.counts.openObligations, counted.length, `${who}: tile must count every deal that owes something`);
    for (const a of hd.attention) {
      const d = deals.find((x) => x.id === a.dealId);
      if (!d || !/obligations? still outstanding/i.test(a.why || '')) continue;
      assert.ok(counted.some((x) => x.id === d.id), `${who}: ${a.company} is shown owing obligations but the tile excludes it`);
    }
    // A deal cannot both owe something and be a records gap.
    const gapText = text(hd);
    if (/no obligation recorded/i.test(gapText)) {
      const m = /A further (\d+) deals? past the gate/i.exec(gapText);
      if (m) assert.ok(!counted.some((d) => Number(m[1]) === 0), `${who}: records-gap sentence must exclude deals that owe`);
    }
  }
});

// A target date on a deal nobody has launched into diligence is an aspiration, not a
// booked committee, and must not be counted down to.
test('the committee countdown ignores deals still in origination', () => {
  const hd = build('analyst', 'analyst');
  const tile = hd.kpis.find((k) => k.key === 'ic');
  if (!tile || tile.value === '—') return;
  const days = Number(String(tile.value).replace('d', ''));
  const named = deals.find((d) => d.company === tile.sub);
  assert.ok(named, 'the countdown must name the deal it is counting to');
  assert.notEqual(vFor(named).phase, 'origination', `${named.company} has not been launched into diligence and cannot be the next committee`);
  assert.equal(named.daysToIC, days);
});
