// OUR PLUMBING IS NOT A FINDING ABOUT THEIR DEAL.
//
// The orchestrator's specialists are hosted agents. They reach the deal through a SHARED
// tool surface, which is called with the agent's credentials rather than the end user's,
// and which therefore refuses deal detail by design — it cannot resolve need-to-know for
// a person it cannot see. The prompt told them to "use your tools for more detail", so
// they went at it, were refused, and reported the refusal upward.
//
// A partner with full access to her own deal was told: "my calls to the deal record, the
// deal record and the citation audit for Lumen Analytics returned access-denied
// (need-to-know). Ask the deal lead or an administrator to share the LBO/returns model."
// The specialist then invented the provenance it had failed to fetch. There is no
// workbook. If a buyer's compliance officer sees the product tell an IC chair she is
// locked out of her own deal, the access story dies in the room.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutPlumbing } from '../lib/purposeAgent.js';

// These four are verbatim from the deployed orchestrator, captured after the first
// attempt at this fix. The first attempt scrubbed one of the two return paths and used a
// pattern built from the words I had thought of rather than the ones the model used --
// it wrote "blocked by access controls" and quoted the tool's own JSON at the reader.
const CONFESSIONS = [
  'Why (short): I attempted to retrieve the deal returns model and the citation audit to trace the entry multiple but the Deal Room calls were blocked by access controls:',
  '- the deal record returned: {"error":"access-denied","reason":"Deal detail is need-to-know and is resolved per user."}.',
  'Ask the deal lead or an administrator to share the LBO/returns model.',
  'I could not retrieve the citation audit for Lumen Analytics.',
  'Both specialists tried to fetch the LBO/returns model and the citation audit and received access-denied errors.',
  'I can\'t retrieve the provenance inside the Deal Room — my calls returned "access-denied" (need-to-know).',
  'The tool call failed, so I could not retrieve the returns model.',
  'Unable to access the citation audit for this deal.',
  'Permission denied when reading the deal record.',
];

test('no answer reaches the reader carrying our own access errors', () => {
  for (const line of CONFESSIONS) {
    const out = withoutPlumbing(`Recommendation: Hold.\n\n${line}\n\nThe entry multiple is 8.3x.`);
    assert.ok(!/access[-\s]denied/i.test(out), `an access-denied confession survived: ${out}`);
    assert.ok(!/permission denied|could not retrieve|unable to access|tool call failed/i.test(out), `a plumbing error survived: ${out}`);
    // The rest of the answer must be left alone.
    assert.match(out, /Recommendation: Hold/, 'the recommendation was stripped with the confession');
    assert.match(out, /8\.3x/, 'a grounded figure was stripped with the confession');
  }
});

// Stripping must never leave the reader with a blank panel, which is a worse dead end
// than the confession was.
test('an answer that was nothing but a confession still says something true', () => {
  const out = withoutPlumbing('My calls to the deal record returned access-denied (need-to-know).');
  assert.ok(out && out.trim().length > 20, 'the reader is left with nothing');
  assert.ok(!/access[-\s]denied/i.test(out), 'the confession survived');
  assert.ok(!/administrator|locked out|no access/i.test(out), `the replacement still blames the reader's access: ${out}`);
});

// An ordinary answer must pass through untouched — a scrubber that rewrites good prose is
// worse than the fault it fixes.
test('an answer with no plumbing in it is returned unchanged', () => {
  const good = [
    'Recommendation: Hold — not ready for committee.',
    '',
    'Why: the entry multiple of 8.3x rests on a screening-default EBITDA of $29M that no',
    'workstream has produced. Legal DD and ESG are the two lanes still open.',
  ].join('\n');
  assert.equal(withoutPlumbing(good), good.trim());
});

// The word "access" is ordinary English on a product about access control, and the
// scrubber must not eat sentences that are genuinely about the reader's permissions.
test('a legitimate statement about the reader\'s own access survives', () => {
  const legit = 'You have observer access, so this shows where each deal stands, not the diligence behind it.';
  assert.equal(withoutPlumbing(legit), legit);
});
