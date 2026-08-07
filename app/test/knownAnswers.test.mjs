// A QUESTION WE HAVE ALREADY ANSWERED SHOULD NOT COST TWENTY-ONE SECONDS.
//
// Measured live: "what is ready for the next IC?" took 21s, made ZERO tool calls, and the
// latency was entirely token generation — the same question asked for in one line came
// back in 6s. Computing IC readiness across the whole book takes 3ms.
//
// These are the questions the product itself prints as suggestion chips, so they are the
// ones most likely to be clicked in front of a room. Two things have to hold: they are
// answered from the record, and the answer obeys the same access rules as every screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFromRecord } from '../lib/knownAnswers.js';

const deal = (over = {}) => ({
  id: 'd1', company: 'Testco', accessLevel: 'full', locked: false, daysToIC: 5,
  workstreams: [], keyFigures: [], memoSections: [], compliance: [], conditions: [], issues: [],
  ...over,
});
const rawOf = (list) => (id) => list.find((d) => d.id === id) || null;

const CHIPS = [
  'How many deals do I have in view?',
  'What is ready for the next IC?',
  'Which of my deals have IC conditions still open, and who owns them?',
  'When is the next investment committee?',
];

test('the questions the product puts on screen are answered from the record', () => {
  const list = [deal(), deal({ id: 'd2', company: 'Secondco', daysToIC: 12 })];
  for (const q of CHIPS) {
    const a = answerFromRecord({ message: q, deals: list, rawFor: rawOf(list) });
    assert.ok(a, `"${q}" falls through to a model that already knows the answer`);
    assert.equal(a.source, 'record');
    assert.ok(a.reply && a.reply.length > 5, `"${q}" produced an empty answer`);
    assert.ok((a.citations || []).length, `"${q}" is answered with no source named`);
  }
});

// The other half. If this quietly answered everything, it would replace the assistant with
// a lookup table and nobody would notice until it got something subtle wrong.
test('a question that needs judgement is left to the assistant', () => {
  const list = [deal()];
  const judgement = [
    'Walk me through the returns on Testco and what could kill it.',
    'Draft the IC memo.',
    'What should I ask management about the QoE?',
    'Is this a good price?',
  ];
  for (const q of judgement) {
    assert.equal(
      answerFromRecord({ message: q, deals: list, rawFor: rawOf(list) }),
      null,
      `"${q}" was answered from a lookup table`,
    );
  }
});

// The whole product spends its effort reducing what a restricted person sees. An answer
// that reads detail off a status-tier row would walk straight through that.
test('a status-only deal is counted but never described', () => {
  const list = [
    deal({ id: 'open', company: 'Openco' }),
    deal({ id: 'shut', company: 'Secretco', accessLevel: 'status', locked: true, daysToIC: 1 }),
  ];
  const count = answerFromRecord({ message: 'How many deals do I have in view?', deals: list, rawFor: rawOf(list) });
  assert.match(count.reply, /2 deals/, 'the restricted deal was dropped from the count');
  assert.match(count.reply, /status only/i, 'the reader is not told something is withheld');

  for (const q of CHIPS) {
    const a = answerFromRecord({ message: q, deals: list, rawFor: rawOf(list) });
    if (!a) continue;
    assert.ok(!/Secretco/.test(a.reply), `"${q}" named a deal the caller may only see the status of`);
  }
});

// "Nothing is ready" and "I could not work out what is ready" are different sentences.
// "Why is X not ready?" is the most-clicked chip on the home page, and the readiness
// board answers it in terms — the gating list IS the answer. It reads as judgement and is
// actually a lookup, which is exactly the kind of question worth catching here.
test('why a named deal is not ready comes from the readiness board', () => {
  const list = [deal({ company: 'Testco' })];
  const a = answerFromRecord({ message: 'Why is Testco not ready?', deals: list, rawFor: rawOf(list) });
  assert.ok(a, 'the readiness board already holds this answer');
  assert.match(a.reply, /Testco/);
  assert.ok((a.citations || []).some((c) => /readiness/i.test(c)), 'the answer names no source');
});

// A company we cannot see, or that does not exist, must not be answered at all — the
// assistant has a careful refusal for that and it must not be pre-empted by a lookup.
test('a deal the caller cannot see is not answered from the record', () => {
  const list = [deal({ company: 'Testco' }), deal({ id: 'shut', company: 'Secretco', accessLevel: 'status', locked: true })];
  assert.equal(answerFromRecord({ message: 'Why is Contoso not ready?', deals: list, rawFor: rawOf(list) }), null);
  assert.equal(answerFromRecord({ message: 'Why is Secretco not ready?', deals: list, rawFor: rawOf(list) }), null);
});

test('an empty book is answered honestly rather than confidently', () => {
  const a = answerFromRecord({ message: 'What is ready for the next IC?', deals: [], rawFor: () => null });
  if (a) assert.match(a.reply, /nothing|no deal/i, `an empty book produced: ${a.reply}`);
  const c = answerFromRecord({ message: 'How many deals do I have in view?', deals: [], rawFor: () => null });
  assert.match(c.reply, /no deals/i);
});

test('a malformed call never produces an answer', () => {
  assert.equal(answerFromRecord({ message: '', deals: [], rawFor: () => null }), null);
  assert.equal(answerFromRecord({ message: 'What is ready for the next IC?', deals: null, rawFor: () => null }), null);
  assert.equal(answerFromRecord({ message: 'What is ready for the next IC?', deals: [], rawFor: null }), null);
});

// The activity trail is a dated log, so "what changed this week" is a query and not a
// judgement. It was costing 37 seconds to have a model read it back.
test('what changed this week is counted off the activity trail', () => {
  const now = Date.now();
  const list = [
    deal({ activity: [{ actor: 'Priya Raman', action: 'Opened Legal DD', when: new Date(now - 2 * 86400000).toISOString() }] }),
    deal({ id: 'd2', company: 'Secondco', activity: [{ actor: 'David Osei', action: 'Filed the QoE', when: new Date(now - 40 * 86400000).toISOString() }] }),
  ];
  const a = answerFromRecord({ message: 'What changed across my deals this week?', deals: list, rawFor: rawOf(list) });
  assert.ok(a, 'the activity trail already holds this answer');
  assert.match(a.reply, /Testco/, 'the deal with recent activity is missing');
  assert.ok(!/Secondco/.test(a.reply), 'a 40-day-old entry was reported as this week');
});

test('a quiet week is reported as quiet, not as an empty list', () => {
  const list = [deal({ activity: [{ actor: 'X', action: 'Y', when: new Date(Date.now() - 40 * 86400000).toISOString() }] })];
  const a = answerFromRecord({ message: 'What changed across my deals this week?', deals: list, rawFor: rawOf(list) });
  assert.ok(a && /nothing has been recorded/i.test(a.reply), `got: ${a && a.reply}`);
});

// The division of labour, stated as a test: arithmetic and lookups are computed; anything
// asking for a view on what the numbers MEAN goes to the assistant.
test('interpretation is never answered from a lookup', () => {
  const list = [deal()];
  for (const q of [
    'Is this a good price?',
    'Should we take Testco to committee?',
    'What would you push back on in the QoE?',
    'How does this compare with the last three deals we did?',
    'What is the strongest argument against this deal?',
  ]) {
    assert.equal(
      answerFromRecord({ message: q, deals: list, rawFor: rawOf(list) }),
      null,
      `"${q}" asks for a view and was answered by a lookup table`,
    );
  }
});
