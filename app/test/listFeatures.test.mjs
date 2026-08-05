// The features the reviewers said were missing rather than broken.
//
// Each of these was a "the product cannot do this at all" finding, not a defect: every
// query parameter ignored, no way to ask for access to a deal you cannot open, a
// documents screen that lists nothing, and an audit that reported a perfect score and an
// unclean verdict in the same object.
import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDeals } from '../lib/dealQuery.js';
import { hydrate, listDeals } from '../lib/store.js';
import { seededDeals } from '../data/deals.js';
import { validateCitations } from '../lib/citations.js';

await hydrate();
const rows = () => listDeals(null, 'analyst');

test('a lane question is one request, not eleven', () => {
  // "Which of my deals has Legal DD not started?" cost eleven requests and a hand-built
  // table, because ?lane=legal&laneStatus=not_started returned every row unchanged.
  const all = rows();
  const q = queryDeals(all, { lane: 'legal', laneStatus: 'not_started' });
  assert.ok(q.matched > 0, 'fixture must contain a not-started legal lane, or this asserts nothing');
  assert.ok(q.matched < all.length, 'the filter matched everything, so it is not filtering');
  for (const d of q.deals) {
    const lane = (d.workstreams || []).find((w) => w.lane === 'legal');
    assert.equal(lane?.status, 'not_started', `${d.company} came back from a not-started filter`);
  }
});

test('search, stage, committee window, sort and paging all do something', () => {
  const all = rows();
  assert.ok(queryDeals(all, { q: 'dublin' }).matched >= 1, 'free text finds nothing');
  assert.ok(queryDeals(all, { q: 'zzzznotacompany' }).matched === 0, 'free text matches everything');

  const d = queryDeals(all, { stage: 'd' });
  assert.ok(d.matched > 0 && d.deals.every((x) => String(x.stage || '').toLowerCase().startsWith('d')));

  const soon = queryDeals(all, { ic: '14' });
  assert.ok(soon.deals.every((x) => x.daysToIC >= 0 && x.daysToIC <= 14), 'a committee window let through a deal outside it');

  const sorted = queryDeals(all, { sort: 'ic' }).deals.map((x) => x.daysToIC).filter((n) => typeof n === 'number');
  assert.deepEqual(sorted, sorted.slice().sort((a, b) => a - b), 'sort by committee date did not sort');

  const page = queryDeals(all, { limit: 2 });
  assert.equal(page.shown, 2);
  assert.equal(page.matched, all.length, 'paging must report the full match count, not the page size');
});

test('a filter can only ever narrow what the caller may already see', () => {
  // The one way this feature could become a disclosure bug: filtering the whole book and
  // then scoping, rather than scoping and then filtering.
  const analystIds = new Set(rows().map((d) => d.id));
  const hidden = seededDeals.filter((d) => !analystIds.has(d.id));
  assert.ok(hidden.length > 0, 'fixture must hide something from an analyst');
  for (const params of [{ q: '' }, { q: hidden[0].company }, { stage: 'e' }, { sort: '-size' }, { limit: 999 }]) {
    const out = queryDeals(rows(), params).deals.map((d) => d.id);
    for (const h of hidden) assert.ok(!out.includes(h.id), `${h.company} reached the list through a filter`);
  }
});

test('the citation audit does not report a perfect score and an unclean verdict at once', () => {
  // Seen live: {score: 100, clean: false, unsourcedClaims: 0, summary: "IC ask derived
  // from unsourced Revenue & EBITDA"}. Whichever field a badge rendered decided whether
  // the reader trusted the pack.
  let checked = 0;
  for (const deal of seededDeals) {
    let a;
    try { a = validateCitations(deal); } catch { continue; }
    if (!a) continue;
    checked++;
    assert.equal(a.score === 100, a.clean === true,
      `${deal.company}: score ${a.score} with clean=${a.clean} — "${a.summary}"`);
    if (!a.clean) assert.ok(a.summary, `${deal.company}: not clean and says nothing about why`);
  }
  assert.ok(checked > 0, 'no deal produced an audit, so this asserts nothing');
});
