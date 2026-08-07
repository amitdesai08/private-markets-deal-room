// WHAT ARRIVED AT YOUR DESK — AND ONLY YOUR DESK.
//
// A notification tray is a new way for the product to say something about a deal, which
// makes it a new way to say something about a deal the reader is not on. Every surface in
// here has had to learn that lesson separately; this one is born with it.
//
// It also has to be worth having. A tray that tells the workstream lead the same thing it
// tells the committee is a feed, and a feed is what this exists to replace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationsFor, unreadCount } from '../lib/notifications.js';
import { seatFor } from '../lib/seat.js';

const lane = (key, over = {}) => ({ lane: key, status: 'not_started', progress: 0, findings: [], ...over });
const deal = (over = {}) => ({
  id: 'd1', company: 'Testco', accessLevel: 'full', locked: false, daysToIC: 9,
  stage: 'D2', stageName: 'Diligence & Approval', status: 'in_diligence',
  workstreams: [lane('legal'), lane('financial'), lane('techai')],
  activity: [{ actor: 'Priya Raman', action: 'PURSUE recorded at screening', when: new Date(Date.now() - 2 * 86400000).toISOString() }],
  keyFigures: [], memoSections: [], compliance: [], conditions: [], issues: [], documents: [],
  ...over,
});
const rawOf = (list) => (id) => list.find((d) => d.id === id) || null;
const seatOf = (r) => seatFor({ role: r, persona: r });

test('a deal the caller may only see the status of is never described', () => {
  const list = [
    deal({ id: 'open', company: 'Openco' }),
    deal({ id: 'shut', company: 'Secretco', accessLevel: 'status', locked: true }),
  ];
  for (const role of ['partner', 'analyst', 'legal-gc', 'member', 'operating-partner']) {
    const out = notificationsFor(list, { seat: seatOf(role), rawFor: rawOf(list) });
    for (const i of out.items) {
      assert.ok(!/Secretco/.test(`${i.headline} ${i.detail || ''}`), `${role}: a status-only deal was described — "${i.headline}"`);
      assert.notEqual(i.dealId, 'shut', `${role}: a status-only deal produced a notification`);
    }
    assert.equal(out.restricted, 1);
    assert.ok(out.restrictedNote, `${role}: the reader is not told something is withheld`);
  }
});

// The whole point. A workstream lead and a committee member should not be shown the same
// tray, or neither of them will read it.
test('different seats are told different things', () => {
  const list = [deal()];
  const trays = {};
  for (const role of ['partner', 'analyst', 'legal-gc', 'principal']) {
    trays[role] = notificationsFor(list, { seat: seatOf(role), rawFor: rawOf(list) }).items.map((i) => i.headline).join('|');
  }
  const distinct = new Set(Object.values(trays));
  assert.ok(distinct.size >= 3, `four seats produced only ${distinct.size} distinct trays`);
});

test('a workstream lead is told when a lane they own is the one holding a deal up', () => {
  const list = [deal()];
  const out = notificationsFor(list, { seat: seatOf('legal-gc'), rawFor: rawOf(list) });
  const mine = out.items.filter((i) => i.kind === 'needs-you');
  assert.equal(mine.length, 1, `expected one lane item, got ${mine.length}`);
  assert.match(mine[0].headline, /Testco/);
  assert.match(mine[0].detail || '', /Committee in 9 days/);
});

// The other half: once the work is recorded, stop chasing them. A tray that keeps asking
// for something already delivered is worse than no tray.
test('a lane with work recorded against it stops being reported', () => {
  const worked = [deal({ workstreams: [lane('legal', { status: 'in_progress', findings: [{ text: 'SPA mark-up returned.' }] }), lane('financial')] })];
  const out = notificationsFor(worked, { seat: seatOf('legal-gc'), rawFor: rawOf(worked) });
  assert.equal(out.items.filter((i) => i.kind === 'needs-you').length, 0, 'a completed lane is still being chased');
});

test('a lane belonging to somebody else is not reported to you', () => {
  const list = [deal()];
  const out = notificationsFor(list, { seat: seatOf('ai-md'), rawFor: rawOf(list) });
  for (const i of out.items.filter((x) => x.kind === 'needs-you')) {
    assert.ok(!/legal/i.test(i.headline), `the AI lead was told about Legal — "${i.headline}"`);
  }
});

test('a decision on the record reaches everybody who can see the deal', () => {
  const list = [deal()];
  for (const role of ['partner', 'analyst', 'legal-gc']) {
    const out = notificationsFor(list, { seat: seatOf(role), rawFor: rawOf(list) });
    assert.ok(out.items.some((i) => i.kind === 'decision' && /PURSUE/.test(i.headline)), `${role} was not told about the decision`);
  }
});

// An item with no time cannot be new, and one stamped "now" is permanently new. Neither is
// acceptable, so an undateable item is dropped.
test('every item carries a real time from the record', () => {
  const list = [deal()];
  for (const role of ['partner', 'legal-gc', 'analyst']) {
    for (const i of notificationsFor(list, { seat: seatOf(role), rawFor: rawOf(list) }).items) {
      const t = new Date(i.when).getTime();
      assert.ok(Number.isFinite(t) && t > 0, `${role}: "${i.headline}" has no usable time`);
      assert.ok(t <= Date.now() + 1000, `${role}: "${i.headline}" is dated in the future`);
    }
  }
});

test('a deal with nothing on its record produces nothing rather than a guess', () => {
  const bare = [deal({ activity: [], workstreams: [] })];
  const out = notificationsFor(bare, { seat: seatOf('legal-gc'), rawFor: rawOf(bare) });
  assert.equal(out.items.length, 0);
});

test('unread is counted against the time the reader last looked', () => {
  const items = [
    { when: new Date(Date.now() - 1 * 86400000).toISOString() },
    { when: new Date(Date.now() - 5 * 86400000).toISOString() },
    { when: new Date(Date.now() - 9 * 86400000).toISOString() },
  ];
  assert.equal(unreadCount(items, new Date(Date.now() - 3 * 86400000).toISOString()), 1);
  assert.equal(unreadCount(items, new Date(Date.now() - 7 * 86400000).toISOString()), 2);
  assert.equal(unreadCount(items, null), 3, 'a reader who has never looked has everything unread');
  assert.equal(unreadCount(items, 'not-a-date'), 3, 'an unreadable timestamp must not hide items');
});

test('the tray is bounded', () => {
  const many = Array.from({ length: 60 }, (_, i) => deal({ id: `d${i}`, company: `Co${i}` }));
  const out = notificationsFor(many, { seat: seatOf('legal-gc'), rawFor: rawOf(many) });
  assert.ok(out.items.length <= 40, `${out.items.length} items in the tray`);
  assert.ok(out.total >= out.items.length, 'the true total is not reported');
});

// Sorting by when the deal last moved put "committee in 63 days" above "committee in 21",
// because every lane item carries the same timestamp and the order was therefore
// arbitrary. What somebody is chased about is ordered by the date they are chased against.
test('what you are waiting on is ordered by how soon you are chased for it', () => {
  const list = [
    deal({ id: 'far', company: 'Farco', daysToIC: 60 }),
    deal({ id: 'near', company: 'Nearco', daysToIC: 4 }),
    deal({ id: 'mid', company: 'Midco', daysToIC: 20 }),
    deal({ id: 'none', company: 'Undatedco', daysToIC: null }),
  ];
  const mine = notificationsFor(list, { seat: seatOf('legal-gc'), rawFor: rawOf(list) })
    .items.filter((i) => i.kind === 'needs-you');
  assert.deepEqual(mine.map((i) => i.company), ['Nearco', 'Midco', 'Farco', 'Undatedco']);
});

// And what is waiting on you comes before news about somebody else's deal.
test('what needs you outranks what merely happened', () => {
  const list = [deal()];
  const items = notificationsFor(list, { seat: seatOf('legal-gc'), rawFor: rawOf(list) }).items;
  const firstDecision = items.findIndex((i) => i.kind === 'decision');
  const lastNeedsYou = items.map((i) => i.kind).lastIndexOf('needs-you');
  if (firstDecision >= 0 && lastNeedsYou >= 0) {
    assert.ok(lastNeedsYou < firstDecision, 'a decision was ranked above something waiting on the reader');
  }
});
