// What this file is for.
//
// An access review pushed need-to-know onto deals, and the fix went too far in one
// direction: the seat that does the diligence lost its own deals. An analyst named as
// lead on a deal going to committee in nine days opened the product to a masked row, a
// KPI strip reading "Not IC-ready 0", and a home page that told them in plain English
// there was "nothing competing for your attention today".
//
// Nobody's suite failed. Every disclosure test asked "can the wrong person see this?"
// and not one asked "can the right person?". A boundary is only correct if it holds in
// both directions, so both directions are asserted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, listDeals } from '../lib/store.js';
import { buildHomeDesk } from '../lib/homeDesk.js';
import { dealAccessLevel } from '../lib/userPolicy.js';
import { seededDeals } from '../data/deals.js';

await hydrate();

const analystRows = () => listDeals(null, 'analyst');

test('a seat named on a deal team reaches that deal in full', () => {
  const named = seededDeals.filter((d) => (d.team || []).includes('analyst') && !d.confidential);
  assert.ok(named.length > 0, 'the seed must name the analyst on at least one deal, or this asserts nothing');

  const rows = new Map(analystRows().map((r) => [r.id, r]));
  for (const d of named) {
    const row = rows.get(d.id);
    assert.ok(row, `${d.company}: the analyst is on the team and cannot see the deal at all`);
    assert.equal(row.accessLevel, 'full', `${d.company}: named on the team but served a masked row`);
    assert.notEqual(row.locked, true, `${d.company}: named on the team and locked out of it`);
  }
});

test('being on the team does not hand over the deals you are not on', () => {
  // The inverse mistake, and the easier one to make: widening need-to-know until it
  // stops meaning anything. Confidential deals require a person, never a role — a team
  // written as a role slug admits everyone holding it, which is fine for a deal the firm
  // is running normally and not fine for one it has marked confidential.
  const ids = new Set(analystRows().map((r) => r.id));
  for (const d of seededDeals.filter((x) => x.confidential)) {
    assert.ok(!ids.has(d.id), `${d.company} is confidential and must not be listed to a role`);
    assert.equal(dealAccessLevel(null, d, 'analyst'), 'none');
  }
  const partnerCount = listDeals(null, 'partner').length;
  assert.ok(ids.size < partnerCount, 'an analyst must still see fewer deals than a partner');
});

test('the home page does not tell the person doing the work there is nothing to do', () => {
  const rows = analystRows();
  const desk = buildHomeDesk(rows, { role: 'analyst', roleLabel: 'Analyst' });

  assert.ok(desk.attention.length > 0, 'an analyst holding deals in diligence has an empty attention list');

  const said = JSON.stringify(desk);
  assert.ok(
    !/nothing competing for your attention/i.test(said),
    'the home page claims a clear desk to a seat that is carrying live deals',
  );

  // The masking removed the committee date along with the size, so the countdown the
  // whole page is organised around came back null and every IC tile printed a dash.
  const withDate = rows.filter((r) => typeof r.daysToIC === 'number');
  assert.ok(withDate.length > 0, 'not one deal in the analyst list carries a committee date');
});
