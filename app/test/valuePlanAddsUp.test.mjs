// THE PLAN HAS TO BE THIS COMPANY'S, AND IT HAS TO ADD UP.
//
// A reviewer walking the demo stopped on the value-creation card twice. The first time
// because a grocery roll-up, a vertical SaaS business and a marine-services operator were
// all going to be improved by the same four levers in the same order with the same owners
// and the same 100-day plan — nineteen deals, one plan. The second time because the card
// headlined a $24M EBITDA target and then listed levers adding to $106M underneath it.
// Ten of the nineteen published a headline their own table contradicted.
//
// Both are properties of the whole book rather than of any one deal, so they are tested
// that way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededDeals } from '../data/deals.js';
import { buildValueCreationPlan } from '../lib/diligence.js';

const plans = seededDeals.map((d) => ({ deal: d, plan: buildValueCreationPlan(d) })).filter((p) => p.plan);

test('the fixture is large enough for this to mean anything', () => {
  assert.ok(plans.length >= 15, `only ${plans.length} deals produce a value-creation plan`);
});

test('every value-creation plan adds up to its own headline', () => {
  for (const { deal, plan } of plans) {
    const target = plan.ebitdaBridge.delta;
    const levers = plan.levers.reduce((s, l) => s + (l.impact || 0), 0);
    assert.equal(
      levers,
      target,
      `${deal.company}: the card targets ${target} and its levers add to ${levers}`,
    );
    const bridge = plan.ebitdaBridge.components.reduce((s, c) => s + (c.contribution || 0), 0);
    assert.equal(
      bridge,
      target,
      `${deal.company}: the EBITDA bridge components add to ${bridge} against a ${target} target`,
    );
    assert.equal(plan.leversReconcile, true, `${deal.company}: the plan does not claim to reconcile`);
  }
});

// The levers were a fixed list scaled by revenue, so the only thing that changed between
// two unrelated businesses was the size of the numbers. A reader who has seen two deals
// has seen them all, and the plan stops being read.
test('the plan names things specific to the business, not one list scaled up and down', () => {
  const leverSets = new Set(plans.map((p) => p.plan.levers.map((l) => l.name).join(' | ')));
  const dayPlans = new Set(plans.map((p) => JSON.stringify(p.plan.hundredDay)));
  assert.ok(
    leverSets.size >= 8,
    `${plans.length} deals produce only ${leverSets.size} distinct sets of levers`,
  );
  assert.ok(
    dayPlans.size >= 8,
    `${plans.length} deals produce only ${dayPlans.size} distinct 100-day plans`,
  );
});

// A lever that costs nothing and is owned by nobody is decoration.
test('every lever is sized, timed and owned', () => {
  for (const { deal, plan } of plans) {
    for (const l of plan.levers) {
      assert.ok(l.name && l.name.length > 8, `${deal.company}: a lever has no usable name`);
      assert.ok(Number.isFinite(l.impact), `${deal.company}: "${l.name}" carries no figure`);
      assert.ok(l.timeline, `${deal.company}: "${l.name}" has no timeline`);
      assert.ok(l.owner, `${deal.company}: "${l.name}" has no owner`);
      assert.ok(l.impactBasis, `${deal.company}: "${l.name}" does not say where its figure came from`);
    }
  }
});

// Where the model produces no uplift there is nothing to allocate, and the card must say
// that rather than presenting a table of zeroes as a plan.
test('a deal with no modelled uplift says so instead of showing an empty plan', () => {
  const flat = { company: 'Flat Co', sector: 'Industrials', subSector: 'Precision Components', dealSize: 100, keyFigures: [] };
  const plan = buildValueCreationPlan(flat);
  if (plan && plan.ebitdaBridge.delta === 0) {
    assert.match(plan.headline, /no ebitda uplift/i, 'a zero-target plan still headlines a target');
  }
});
