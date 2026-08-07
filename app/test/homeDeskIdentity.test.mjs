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

// This asserted that /api/home-desk was on a list of nine prefixes routed to the
// forwarder, with everything else falling through to the blind proxy. The list was the
// defect: once the orchestrator started refusing an unidentified caller instead of
// answering it as the deploy default, the thirty-five routes NOT on the list went dark
// for everyone, and the product told people who had signed in to sign in.
//
// There is no list now. Asserting the stronger property — every /api route resolves
// through the forwarder, and nothing is left for a blind proxy to catch.
test('every /api route resolves through the identity forwarder', () => {
  assert.match(indexSrc, /app\.use\('\/api',\s*forwardWithIdentity\)/);
  assert.ok(
    !/app\.use\('\/api',\s*proxyToBackend\)/.test(indexSrc),
    'the blind catch-all is back: routes registered after it lose the caller silently',
  );
});

// Three proxies each assembled the forwarded credentials by hand and they drifted the
// moment the rules changed: the walkthrough credential reached the deal list and not the
// assistant, so every chat entry point answered "Sign in to continue." while the screen
// beside it worked. One builder decides now, and this asserts that rather than the shape
// of any single proxy.
test('every proxy gets its credentials from one place', () => {
  assert.match(indexSrc, /function backendAuth\(/, 'the shared credential builder is gone');
  const uses = (indexSrc.match(/backendAuth\(\{/g) || []).length;
  assert.ok(uses >= 3, `only ${uses} proxies use the shared builder`);
  const body = indexSrc.slice(indexSrc.indexOf('function backendAuth'), indexSrc.indexOf('async function forwardChat'));
  assert.match(body, /x-bot-key/, 'the builder no longer attaches the app proof');
  assert.match(body, /x-dr-user/, 'the builder no longer forwards the resolved identity');
  assert.match(body, /x-dr-demo-key/, 'the builder no longer carries the walkthrough credential');
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
