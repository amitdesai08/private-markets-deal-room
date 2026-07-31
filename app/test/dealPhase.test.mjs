// The IC-readiness gate is only a fair question to ask of a deal that has not yet been to
// committee. Asked of anything else it returns a confident falsehood in one of two
// directions:
//
//   before diligence — "not IC-ready, diligence plan outstanding" against a target nobody
//     has asked to take to committee. True, useless, and it buries the deals where the
//     same sentence means something.
//   after committee  — either "not ready to table" about a deal that has been signed, or,
//     if you force the inputs to clear the gate, "ready to table" about the same deal.
//     An earlier revision did the latter by overwriting `compliance` to `passed` on every
//     Execution deal, which cleared the gate by deleting the evidence.
//
// So the phase decides which question is asked. These tests pin that down, and pin down
// that the seed data does not quietly reintroduce the overwrite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeICReadiness, dealPhase } from '../lib/icReadiness.js';
import { seededDeals } from '../data/deals.js';

const byId = (id) => seededDeals.find((d) => d.id === id);

test('phase is derived from the stage, and screened deals are origination whatever their stage says', () => {
  assert.equal(dealPhase({ stage: 'O2' }), 'origination');
  assert.equal(dealPhase({ stage: 'D3' }), 'diligence');
  assert.equal(dealPhase({ stage: 'E1' }), 'post-committee');
  assert.equal(dealPhase({ stage: 'V2' }), 'post-committee');
  assert.equal(dealPhase({ stage: 'D1', status: 'screened' }), 'origination');
  assert.equal(dealPhase({ stage: 'D1', stageId: 'screened' }), 'origination');
});

test('a deal past committee is not re-measured against the readiness gate', () => {
  // Great Lakes is E1. Under the diligence gate it would read "1 required item
  // outstanding: KYC / compliance cleared" — a signed deal reported as not ready to table.
  const gl = byId('demo-greatlakes');
  assert.equal(dealPhase(gl), 'post-committee');
  const v = computeICReadiness(gl).verdict;
  assert.equal(v.state, 'CONDITIONAL', 'what remains live is whether its obligations are closed');
  assert.equal(v.openConditions, 2);
  assert.ok(v.gating.length >= 2, 'the outstanding obligations are named, not counted');
  assert.ok(!v.gating.some((g) => /required item|workstream blocking/.test(g)), 'the diligence gate does not apply to a deal that has already been to committee');
});

test('an uncleared compliance check on a post-committee deal is not reported as clean', () => {
  // The failure this guards: an earlier pass returned a clean READY for every deal past
  // committee, so a signed deal with its EU merger-control filing still running read as
  // "Approved at committee — no conditions outstanding". That switched off the only check
  // on the deals closest to spending money.
  const onyx = byId('demo-onyx');
  assert.equal(dealPhase(onyx), 'post-committee');
  assert.ok((onyx.compliance || []).some((c) => c.status !== 'passed'), 'fixture must carry an uncleared check');
  const v = computeICReadiness(onyx).verdict;
  assert.equal(v.state, 'CONDITIONAL');
  assert.ok(v.gating.some((g) => /Merger control/i.test(g)), 'the uncleared check must be named on the board');
  assert.equal(v.openComplianceChecks, 1);
});

test('the board never claims a committee decision it cannot produce', () => {
  // The phase is read from the deal's STAGE. Nothing on the record is a committee decision
  // — no date, no attendees, no outcome — so no surface may word it as though a minute exists.
  //
  // An earlier version of this test asserted only against `verdict.headline`, which is the
  // one field that had just been fixed. Meanwhile the seed pass was still WRITING a memo
  // section reading "Approved at committee." into every past-committee deal that lacked
  // one — and then grading itself against it, because that section satisfies
  // "Recommendation drafted". A test scoped to precisely the field you fixed is a test
  // written to pass. This one walks the whole record.
  const BANNED = /approved at committee/i;
  const walk = (node, path, dealId) => {
    if (typeof node === 'string') {
      assert.ok(!BANNED.test(node), `${dealId} ${path}: "${node}" asserts a committee decision the system cannot produce`);
      return;
    }
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`, dealId));
    if (node && typeof node === 'object') return Object.entries(node).forEach(([k, v]) => walk(v, `${path}.${k}`, dealId));
  };

  for (const d of seededDeals.filter((x) => dealPhase(x) === 'post-committee')) {
    const v = computeICReadiness(d).verdict;
    assert.match(v.basis, /No committee decision record/i);
    walk(d, 'deal', d.id);
    walk(v, 'verdict', d.id);
  }
});

test('the seed does not write its own evidence into a deal', () => {
  // `seedICState` used to push { key: 'recommendation', status: 'approved',
  // content: 'Approved at committee.', citations: [] } onto any past-committee deal that
  // had no recommendation section — manufacturing the artifact and then counting it.
  for (const d of seededDeals) {
    for (const m of d.memoSections || []) {
      // An unwritten section is fine — that is an honest empty. What is not fine is a
      // section marked APPROVED with nothing behind it.
      if (m.status !== 'approved') continue;
      assert.ok((m.content || '').trim().length > 0, `${d.id} ${m.key}: approved with no content`);
      assert.ok((m.citations || []).length > 0, `${d.id} ${m.key}: an approved section with no citation is an unsourced assertion`);
    }
  }
});

test('nothing cites a document the system cannot produce without saying so', () => {
  // 'IC minutes' was cited on three deals. There are no IC minutes. A citation a partner
  // can click and land on nothing is worse than no citation, because it reads as sourced.
  for (const d of seededDeals) {
    for (const m of d.memoSections || []) {
      for (const c of m.citations || []) {
        if (/^ic minutes$/i.test(String(c).trim())) {
          assert.fail(`${d.id} ${m.key}: cites "IC minutes", which does not exist on the record`);
        }
      }
    }
  }
});

test('a signed or archived deal is never reported as ready to table', () => {
  // `baltic-precision` is stage D5, status `signing`, thesis "IC approved; deal archived".
  // D5 is the diligence stage's ARCHIVE step, reached only after the committee has sat —
  // but the post-committee test was `/^[ev]/`, which does not match D5, so the deal fell
  // through to the diligence gate and read "IC-ready: required artifacts complete, no
  // blocking workstreams". A signed and archived deal presented as ready to be tabled.
  const SIGNED = new Set(['signing', 'signed', 'closing', 'closed', 'completed', 'owned', 'exited', 'archived']);
  for (const d of seededDeals) {
    if (!SIGNED.has(String(d.status || '').toLowerCase()) && !/^d5/i.test(String(d.stage || ''))) continue;
    assert.equal(dealPhase(d), 'post-committee', `${d.id} (${d.stage}/${d.status}) must not be measured against the readiness gate`);
    const v = computeICReadiness(d).verdict;
    assert.ok(!/IC-ready/.test(v.headline), `${d.id}: "${v.headline}"`);
  }
});

test('a verdict never says nothing is outstanding while the same payload names something', () => {
  // `demo-peachtree` shipped `blockingWorkstreams: ['Tech / AI DD']` — reason, no work
  // recorded against it — under the headline "nothing outstanding on the record". One
  // payload contradicting itself, and the contradiction was the sentence, not the data.
  for (const d of seededDeals) {
    const b = computeICReadiness(d);
    if (b.verdict.state !== 'READY') continue;
    assert.equal((b.blockingWorkstreams || []).length, 0,
      `${d.id}: verdict READY while blocking on ${(b.blockingWorkstreams || []).map((x) => x.label).join(', ')}`);
    assert.equal(b.verdict.gating.length, 0, `${d.id}: READY with gating items listed`);
  }
});

test('the seed keeps one lane marked complete with nothing recorded against it', () => {
  // The rule that catches this was fought for twice. If the demo never shows it firing,
  // the next person to read the code deletes it. This asserts the example survives.
  const bare = seededDeals.flatMap((d) => (d.workstreams || [])
    .filter((w) => w.status === 'complete' && !(w.findings || []).length && !(w.contributions || []).length)
    .map((w) => `${d.id}/${w.lane}`));
  assert.ok(bare.length >= 1, 'no lane demonstrates the complete-but-unevidenced case any more');
});

test('the seed does not clear a post-committee gate by overwriting the evidence', () => {
  // The substantive fact the record tracks: an EU merger-control filing does not complete
  // because a committee approved the deal. A previous pass mapped every compliance check
  // to `passed` and every memo section to `approved` on these deals.
  const post = seededDeals.filter((d) => dealPhase(d) === 'post-committee');
  assert.ok(post.length >= 2);
  const stillOpen = post.flatMap((d) => (d.compliance || []).filter((c) => c.status !== 'passed'));
  assert.ok(stillOpen.length > 0, 'at least one post-committee compliance check must still read as in progress');
  const forcedMemo = post.flatMap((d) => (d.memoSections || []).filter((m) => m.key !== 'recommendation' && m.status === 'approved'));
  const originallyOpen = post.flatMap((d) => (d.memoSections || []).filter((m) => m.status === 'in_progress'));
  assert.ok(originallyOpen.length > 0, 'post-committee memo sections keep the status the record gave them');
  assert.ok(forcedMemo.length === 0 || originallyOpen.length > 0);
});

test('every verdict state is reachable across the seeded record', () => {
  const seen = new Set(seededDeals.map((d) => computeICReadiness(d).verdict.state));
  for (const state of ['NOT-READY', 'CONDITIONAL', 'READY']) {
    assert.ok(seen.has(state), `${state} must be reachable — a verdict with one reachable state is a constant`);
  }
});

test('gating discriminates between deals rather than repeating one sentence', () => {
  const inDiligence = seededDeals.filter((d) => dealPhase(d) === 'diligence');
  const notReady = inDiligence.map((d) => computeICReadiness(d).verdict).filter((v) => v.state === 'NOT-READY');
  assert.ok(notReady.length > 2);
  const distinct = new Set(notReady.map((v) => v.gating.join('|')));
  assert.ok(distinct.size > 1, 'if every not-ready deal reads identically the verdict carries no information');
  // And the strings name what is outstanding rather than counting it.
  assert.ok(notReady.every((v) => /outstanding: \w|blocking: \w|unresolved/.test(v.gating.join(' '))), 'gating must name the outstanding items');
});
