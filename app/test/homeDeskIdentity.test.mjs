// THE HOME PAGE MUST BE COMPOSED FOR THE PERSON READING IT.
//
// The defect: /api/home-desk was not in the tab server's identity-resolving path. It
// fell through to the blind proxy, which attaches no bot key, so the orchestrator
// discarded any identity on the request and answered as the default role.
//
// Measured on the live beta instance before the fix, an ANALYST cleared for 4 deals
// received a home briefing describing all 19 — naming companies they cannot open, and
// reporting $8.1B of enterprise value against a deal list beside it that totalled
// $1.8B. The same screen disagreed with itself, and the half that was wrong was the
// half that leaked.
//
// These tests pin both halves of the fix:
//   1. the route is registered against the identity forwarder, not the blind proxy;
//   2. the builder's output is a function of the deals passed in, so a narrower list
//      can never produce a wider claim.
//
// WHAT THIS DOES NOT CERTIFY: it reads the tab server's route table as source text
// rather than booting it, because booting requires Entra config. It proves the route
// is wired to the identity path; it does not prove the network call succeeds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hydrate, listDeals, getDealRaw } from '../lib/store.js';
import { buildHomeDesk } from '../lib/homeDesk.js';

const indexSrc = readFileSync(new URL('../../teams-app/server/index.js', import.meta.url), 'utf8');

test('the home-desk route is wired to the identity forwarder', () => {
  assert.match(indexSrc, /app\.use\('\/api\/home-desk',\s*forwardWithIdentity\)/);
});

test('the identity forwarder is registered BEFORE the catch-all proxy', () => {
  // Express matches in registration order. Registered after the catch-all, the route
  // would still resolve to proxyToBackend and the bug would be intact with a passing
  // "route exists" test above it.
  const seat = indexSrc.indexOf(`app.use('/api/home-desk', forwardWithIdentity)`);
  const catchAll = indexSrc.indexOf(`app.use('/api', proxyToBackend)`);
  assert.ok(seat > 0 && catchAll > 0, 'both registrations must be present');
  assert.ok(seat < catchAll, 'the identity route must be registered before the catch-all proxy');
});

test('the forwarder attaches the bot key, which is what makes the identity trusted', () => {
  const body = indexSrc.slice(indexSrc.indexOf('async function forwardWithIdentity'), indexSrc.indexOf(`app.use('/api/deals'`));
  assert.match(body, /headers\['x-bot-key'\] = config\.backend\.botKey/);
  assert.match(body, /headers\['x-dr-user'\] = JSON\.stringify\(requestingUser\)/);
});

await hydrate();
const all = listDeals();
const rawFor = (d) => getDealRaw(d.id);

test('a narrower deal list can never produce a wider claim', () => {
  const narrow = all.slice(0, 4);
  const hd = buildHomeDesk(narrow, { role: 'analyst', roleLabel: 'Analyst', persona: 'analyst', rawFor });
  const wide = buildHomeDesk(all, { role: 'admin', roleLabel: 'Administrator', persona: null, rawFor });

  assert.equal(hd.counts.deals, 4);
  assert.ok(wide.counts.deals > hd.counts.deals);

  // Nothing in the narrow briefing may name a deal outside the narrow list. This is
  // the exact failure that was live: company names from deals the reader could not open.
  const visible = new Set(narrow.map((d) => d.company));
  const outside = all.filter((d) => !visible.has(d.company)).map((d) => d.company);
  const prose = hd.briefing.paragraphs.map((p) => p.text).join(' ');
  for (const name of outside) {
    assert.ok(!prose.includes(name), `the briefing named ${name}, which is outside the caller's deal list`);
  }
  for (const a of hd.attention) {
    assert.ok(visible.has(a.company), `the queue surfaced ${a.company}, which is outside the caller's deal list`);
  }
});

test('the tiles are counted over the caller\'s own list, not the platform', () => {
  const narrow = all.slice(0, 4);
  const hd = buildHomeDesk(narrow, { role: 'analyst', roleLabel: 'Analyst', persona: 'analyst', rawFor });
  const dealsTile = hd.kpis.find((k) => /deals in view/i.test(k.label));
  assert.equal(dealsTile.value, '4');
});
