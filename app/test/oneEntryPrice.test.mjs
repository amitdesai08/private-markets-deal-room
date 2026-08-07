// ONE DEAL, ONE ENTRY PRICE.
//
// A reviewer walking the demo found a single deal quoting five different entry multiples
// across four screens. Each surface had done the arithmetic for itself: the sourcing
// triage divided EV by EBITDA, the paper LBO derived its own and ignored any price the
// record stated, the IC assumptions panel rebuilt the model from key figures that were
// mostly absent and fell through to an 8x default on every deal in the book, and the
// readiness board printed finding text nobody had squared with the deal's own figures.
// A partner cannot take a number to a committee if the product will not say which one it
// is, so this pins the rule rather than any one of the four bugs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededDeals } from '../data/deals.js';
import { canonicalFigures, statedMultipleOf, reconcileFindingText } from '../lib/diligence.js';
import { currentAssumptions, computeICReadiness } from '../lib/icReadiness.js';
import { buildDealCase } from '../lib/dealCase.js';

const priced = seededDeals.filter((d) => canonicalFigures(d));

test('the deals fixture is rich enough for this to be worth testing', () => {
  assert.ok(priced.length >= 10, `only ${priced.length} deals produce figures at all`);
  assert.ok(seededDeals.some((d) => statedMultipleOf(d)), 'no deal records an entry multiple, so the recorded-beats-derived rule is untested');
});

test('where the record states an entry price, every surface quotes that price', () => {
  for (const d of priced) {
    const stated = statedMultipleOf(d);
    if (stated == null) continue;
    const canon = canonicalFigures(d);
    assert.equal(canon.entryMultiple, stated, `${d.company}: the record says ${stated}x and the canonical figures say ${canon.entryMultiple}x`);
    assert.equal(canon.entryMultipleSource, 'recorded', `${d.company}: a stated price was reported as derived`);
  }
});

// The assumptions panel is what a committee is shown as 'what changed since the last
// draft'. A multiple here that disagrees with the deal's own page reads as an assumption
// having moved when nothing moved at all.
test('the IC assumptions panel agrees with the deal it describes', () => {
  const seen = new Set();
  for (const d of priced) {
    const canon = canonicalFigures(d);
    const asm = currentAssumptions(d);
    assert.equal(asm.entryMultiple, canon.entryMultiple, `${d.company}: assumptions say ${asm.entryMultiple}x, the deal says ${canon.entryMultiple}x`);
    if (asm.entryMultiple != null) seen.add(asm.entryMultiple);
  }
  // The bug that made every deal 8.0x would still satisfy the equality above if the
  // canonical value were equally broken, so require the book to be genuinely varied.
  assert.ok(seen.size >= 4, `all ${priced.length} deals report only ${seen.size} distinct entry multiple(s) — the book is priced by a formula, not by its records`);
});

// A finding quoting a multiple must quote the SAME multiple wherever it is displayed.
test('no screen shows finding text carrying a multiple the deal does not hold', () => {
  for (const d of priced) {
    const canon = canonicalFigures(d);
    let board;
    try { board = computeICReadiness(d); } catch { continue; }
    const texts = [
      ...(board.unresolvedRisks || []).map((r) => r.title),
      ...(board.conditions || []).map((c) => c.text),
    ].filter(Boolean);
    for (const text of texts) {
      assert.equal(
        text,
        reconcileFindingText(String(text), d),
        `${d.company}: the readiness board shows unreconciled finding text — "${text}"`,
      );
      const m = /entry multiple[^0-9x]{0,40}?([\d.]+)\s*x/i.exec(text);
      if (m) {
        const quoted = +Number(m[1]).toFixed(1);
        assert.ok(
          Math.abs(quoted - canon.entryMultiple) < 0.05 || /roughly|by |from |to /i.test(text),
          `${d.company}: a finding states the entry multiple is ${quoted}x while the deal holds ${canon.entryMultiple}x — "${text}"`,
        );
      }
    }
  }
});

// And the committee case, which is the document the vote is taken on.
test('the committee case quotes the deal\'s own entry price', () => {
  let checked = 0;
  for (const d of priced) {
    const canon = canonicalFigures(d);
    let c;
    try { c = buildDealCase(d); } catch { continue; }
    // The ask carries the price the committee is being asked to authorise, and the
    // figures table is what a reader checks it against. Both, or the test proves nothing.
    const fig = (c.figures || []).find((f) => /entry multiple/i.test(f.label || ''));
    const figVal = fig ? Number(String(fig.value).replace(/[^0-9.]/g, '')) : null;
    const shown = c?.ask?.entryMultiple ?? null;
    if (figVal) {
      assert.ok(
        Math.abs(figVal - canon.entryMultiple) < 0.05,
        `${d.company}: the case figures table says ${figVal}x, the deal holds ${canon.entryMultiple}x`,
      );
    }
    if (shown == null) continue;
    checked += 1;
    assert.ok(
      Math.abs(shown - canon.entryMultiple) < 0.05,
      `${d.company}: the case quotes ${shown}x, the deal holds ${canon.entryMultiple}x`,
    );
  }
  assert.ok(checked > 0, 'the case never exposed an entry multiple, so this asserted nothing');
});
