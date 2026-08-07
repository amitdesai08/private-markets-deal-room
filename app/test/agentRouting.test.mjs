// WHICH QUESTIONS ARE WORTH TWENTY SECONDS.
//
// Measured against the live service — same model, same data, same question difficulty:
//
//   deterministic screens (pure functions over the record)   0.67 - 0.85 s
//   direct model call + local tool loop (chatDealAgent)      3 - 6 s
//   Foundry hosted agent_reference, ONE turn                 21 - 24 s
//
// "How many deals do I have in view?" took 25 seconds and used a single agent — all of it
// the routing turn, twenty-one seconds spent deciding to answer directly. Delegating costs
// three such turns, which is where 42 and 66 second answers came from.
//
// So the question is not how to make the slow path faster; it is which questions have
// earned it. That decision is made locally, in under a millisecond, and this pins it —
// because a router that quietly sent everything one way would look exactly like no router
// at all until someone timed it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsSpecialists } from '../lib/purposeAgent.js';

// The questions the product itself puts on screen as suggestion chips, plus the ones a
// partner actually asks. None of these needs a specialist.
const FAST = [
  'How many deals do I have in view?',
  'What is ready for the next IC?',
  'Which of my deals have IC conditions still open, and who owns them?',
  'Why is Lumen Analytics not ready?',
  'What changed across my deals this week?',
  'Which deals should I prioritise today?',
  'What is the entry multiple on Nordic Grocery?',
  'When is the next investment committee?',
  'Who owns the legal workstream on Atlas?',
  'Show me the deals in my region.',
];

// Depth, in a named discipline. This is the only thing the specialists give that the fast
// path does not.
const SLOW = [
  'For Lumen Analytics, walk me through the returns and what could kill the deal.',
  'Draft the IC memo for Nordic Grocery.',
  'Analyse the LBO sensitivity on Atlas.',
  'Build the 100-day value-creation plan for Helvetia.',
  'Compare the precedent comps for Cascadia and recommend a price.',
  'Produce a red-flag diligence summary for Baltic.',
];

test('an ordinary question is answered on the fast path', () => {
  for (const q of FAST) {
    assert.equal(needsSpecialists(q), false, `"${q}" would cost the reader twenty seconds`);
  }
});

test('a question that genuinely needs several disciplines earns the slow path', () => {
  for (const q of SLOW) {
    assert.equal(needsSpecialists(q), true, `"${q}" would be answered without the depth it asked for`);
  }
});

// A router that says yes to everything, or no to everything, is not a router. Both of
// those fail silently — the first reintroduces the 25-second answer, the second quietly
// removes the specialists from the product.
test('the router actually discriminates', () => {
  const slow = [...FAST, ...SLOW].filter(needsSpecialists).length;
  assert.ok(slow > 0, 'no question reaches the specialists at all');
  assert.ok(slow < FAST.length + SLOW.length, 'every question reaches the specialists');
});

test('an empty or absent message never buys a hosted-agent turn', () => {
  for (const q of ['', '   ', null, undefined]) {
    assert.equal(needsSpecialists(q), false, `"${q}" escalated`);
  }
});
