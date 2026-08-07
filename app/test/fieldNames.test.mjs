// FIELD NAMES ARE NOT FIGURES.
//
// Asking the specialists for "a figure from the record" in every bullet pushed them into
// quoting the JSON keys back: "dealSize: $820M", "memoProgress: 28", "DiligenceProgress
// 54 / MemoProgress 68". A partner cannot forward that to anybody. The prompt asks for
// words now, and this is the guard that holds when the prompt does not — the previous
// version of this rule handled `daysToIC` alone, one field at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { houseStyle } from '../lib/ai.js';

test('a field name carrying a number is said in words', () => {
  const cases = [
    ['a grocer; dealSize: $820M.', /enterprise value \$820M/],
    ['IC in 12 days; memoProgress: 28.', /the memo is 28%/],
    ['diligenceProgress: 20; readiness: 31.', /diligence is 20%.*readiness is 31/],
    ['DiligenceProgress 54 / MemoProgress 68 - gating risk.', /diligence is 54%.*the memo is 68%/],
  ];
  for (const [input, want] of cases) {
    const out = houseStyle(input);
    assert.match(out, want, `"${input}" became "${out}"`);
    assert.ok(!/[a-z][A-Z]/.test(out.replace(/EBITDA|IRR|MOIC|IC/g, '')), `a field name survived: ${out}`);
  }
});

// The other half: a scrubber that rewrites ordinary prose is worse than the fault it
// fixes. Product names and people are CamelCase-adjacent and must survive untouched.
test('names and ordinary prose are left alone', () => {
  for (const s of [
    'The entry multiple is 8.3x and the base case clears the hurdle.',
    'EBITDA margin of 7.6% leaves little headroom.',
    'PitchBook 360ms latency on the source card.',
    'OneLake 12 files archived.',
    'Priya Raman 3 open items.',
    'Nordic Grocery Group is a $820M buy-and-build.',
  ]) {
    assert.equal(houseStyle(s), s, `the scrubber rewrote ordinary prose: ${houseStyle(s)}`);
  }
});
