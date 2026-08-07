// THE DEMO "VIEW AS" SWITCHER IS A LENS, NOT AN IMPERSONATION PRIMITIVE.
//
// Two controls are pinned here, both found by review rather than by failure:
//
// 1. The tab server accepted `?as=<anyone>` — a query string — and replaced the
//    signed-in identity with it, unchecked. Anyone able to load the tab origin could
//    request `/api/home-desk?as=admin` and receive the administrator's briefing across
//    all 19 deals. Extending the identity forwarder to the home page had RAISED that
//    route's ceiling from deal-team to admin, so the fix for one leak opened a wider
//    one. The override must now be present in a header or body and must name a profile
//    the backend actually publishes — and the backend publishes none when demo mode is
//    off, so this fails closed in production by construction.
//
// 2. "View as ROLE" was permitted whenever the target role's rank was numerically
//    lower. Rank is admin-authored data, so a role defined with a low rank and
//    stage2/write true would have been previewable by everyone and would have GRANTED
//    capability rather than removed it. Narrowing is now enforced by intersecting with
//    the caller's actual role, which no configuration can undo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessFor } from '../lib/userPolicy.js';
import { upsertRole, deleteRole } from '../lib/accessConfig.js';

const tabSrc = readFileSync(new URL('../../teams-app/server/index.js', import.meta.url), 'utf8');

test('the demo override is never read from the query string', () => {
  // A URL-borne identity survives in browser history, referrer headers and access logs,
  // and is trivially linkable — "click this and see the admin view".
  assert.doesNotMatch(tabSrc, /req\.query\.as\b/, 'the demo override must not be readable from the query string');
  assert.doesNotMatch(tabSrc, /req\.query\.viewAsRole\b/, 'view-as must not be readable from the query string');
});

test('every handler that honours the override validates it against the roster', () => {
  // Any remaining raw read of x-dr-as would be an unchecked path back in.
  const rawReads = [...tabSrc.matchAll(/req\.headers\['x-dr-as'\]/g)];
  assert.equal(rawReads.length, 1, 'x-dr-as should be read in exactly one place: the validator');
  const validator = tabSrc.slice(tabSrc.indexOf('async function resolveDemoOverride'), tabSrc.indexOf('// ROUTES THAT MUST KNOW'));
  assert.match(validator, /req\.headers\['x-dr-as'\]/, 'the one raw read must be inside the validator');
  assert.match(validator, /getDemoProfiles\(\)/, 'the validator must check the published roster');
  assert.match(validator, /if \(!Array\.isArray\(roster\) \|\| !roster\.length\) return ''/, 'an empty roster must reject every override');

  // And every handler must go through it.
  const overrides = [...tabSrc.matchAll(/const asOverride = (.+);/g)].map((m) => m[1]);
  assert.ok(overrides.length >= 4, 'expected the four handlers that honour an override');
  for (const expr of overrides) {
    // The override takes the resolved identity now, because the roster only ever answered
    // WHAT may be asserted and was never asked WHO may assert it — `x-dr-as: admin` was the
    // entire request, and it returned twenty-four deals including two marked confidential.
    assert.equal(expr, 'await resolveDemoOverride(req, identity)', `an unvalidated override remains: ${expr}`);
  }
});

// This enumerated five routes that had to be on the forwarder. The other thirty-five were
// nobody's business, and when the orchestrator started refusing an unidentified caller they
// all went dark — the product told people who had signed in to sign in. Enumerating is the
// defect; there is one rule now and this asserts it.
test('no route can reach the orchestrator without the caller attached', () => {
  assert.match(tabSrc, /app\.use\('\/api',\s*forwardWithIdentity\)/, 'the single identity rule is gone');
  assert.ok(
    !/app\.use\('\/api',\s*proxyToBackend\)/.test(tabSrc),
    'the blind catch-all is back — anything registered after it loses the caller silently',
  );
});

// The walkthrough is the one place a caller arrives with no identity and is still answered,
// so it is the one that needs pinning in both directions. It had no test at all.
test('the open walkthrough is off by default, and read-only when it is on', () => {
  assert.match(tabSrc, /const OPEN_SIGN_IN = /,
    'the walkthrough must be a deployment decision, not a request-time one');
  assert.match(tabSrc, /if \(!identity && !OPEN_SIGN_IN\) return '';/,
    'without the opt-in, asserting an identity must not produce one');
  // And with it, the seat may read and never write. That is enforced on the RECORD rather
  // than by flattening the seat: capping every persona to `member` made an administrator, a
  // partner and an analyst all see the same nine deals, which is the one thing a persona
  // showcase exists to disprove. The orchestrator refuses the write; the seat stays real.
  const srv = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(srv, /walkthrough/,
    'the orchestrator no longer recognises a walkthrough credential');
  assert.match(srv, /requestingIdentity\(req\)\?\.walkthrough/,
    'nothing stops a walkthrough credential from writing to a deal');
});

test('view-as cannot grant a capability the caller does not already hold', async () => {
  // The escalation the rank check alone would have allowed: an admin-authored role that
  // ranks below everyone but carries stage2 and write.
  await upsertRole('trap', { label: 'Trap', rank: 1, write: true, stage2: true, personas: ['partner'] });
  try {
    const asAnalyst = accessFor({ name: 'analyst' }, 'trap');
    assert.equal(asAnalyst.canWrite, false, 'view-as must not grant write');
    assert.equal(asAnalyst.canViewStage2, false, 'view-as must not grant stage-2 visibility');
    assert.equal(asAnalyst.advanceWorkflow, false, 'view-as must not grant workflow control');
    assert.deepEqual(asAnalyst.allowedPersonas, [], 'view-as must not grant personas the caller lacks');

    // isAdmin is reported from the ACTUAL role, so previewing never confers it.
    assert.equal(asAnalyst.isAdmin, false);
  } finally {
    await deleteRole('trap');
  }
});

test('view-as still narrows normally, and no-preview is unaffected', () => {
  // An admin via the Entra app-role claim, so this holds without demo profiles enabled.
  const admin = { oid: 'u1', upn: 'u1@contoso.com', name: 'U1', roles: ['DealRoom.Admin'] };
  const real = accessFor(admin);
  assert.equal(real.viewingAs, null);
  assert.equal(real.isAdmin, true);
  assert.equal(real.canWrite, true, 'a caller not previewing keeps their own capabilities');

  const preview = accessFor(admin, 'analyst');
  assert.equal(preview.viewingAs, 'analyst');
  assert.equal(preview.canWrite, false, 'previewing a read-only seat must close the write gate');
  // This used to assert isAdmin stayed TRUE under a preview, so the UI could offer a way
  // back. The way back is `actualRole`, which is on the same object and says so plainly.
  // isAdmin is not a label, it is a grant — dealAccessLevel opens on it — so keeping it
  // true served an administrator previewing a member all twenty-four deals, Onyx included,
  // under a member label. Deliberately stricter than the assertion it replaces.
  assert.equal(preview.isAdmin, false, 'a preview must not carry the administrator grant');
  assert.equal(preview.actualRole, 'admin', 'the real role must still be reported so the UI can offer a way back');
});

// VIEW-AS MUST NARROW ROWS, NOT ONLY FLAGS.
//
// The capability object reported `role: member, canWrite: false, isAdmin: true` all at
// once: every flag was intersected with the real role except that one, and dealAccessLevel
// opens on isAdmin — so an administrator previewing a member was served all twenty-four
// deals, Onyx included, under a member label. No confidentiality boundary was crossed. The
// instrument was broken, and view-as is exactly what an operator uses to audit this model,
// so a preview that overstates access is worse than no preview at all.
//
// The existing tests here read source text; this one asks the policy.
test('previewing a seat shows what that seat would be shown', async () => {
  const { hydrate, listDeals, getDealRaw } = await import('../lib/store.js');
  const { accessFor, dealAccessLevel } = await import('../lib/userPolicy.js');
  await hydrate();

  const admin = { name: 'admin', roles: ['admin'] };
  for (const seat of ['member', 'analyst']) {
    const previewed = listDeals(admin, seat).map((d) => d.id);
    const genuine = new Set(listDeals(null, seat).map((d) => d.id));
    // Subset, not equality. The baseline here is itself a caller wearing `seat`, and what
    // must hold is the direction: a preview may show less than the seat would be shown
    // and must never show more. Equality would make this test a statement about the
    // fixture's own grants rather than about the preview.
    const extra = previewed.filter((id) => !genuine.has(id));
    assert.deepEqual(extra, [],
      `previewing ${seat} showed ${extra.length} deals that ${seat} is not shown: ${extra.join(', ')}`);

    const a = accessFor(admin, seat);
    // Only when the fixture identity genuinely outranks the seat. Without demo profiles
    // configured it resolves to `member`, and a member asking to preview an analyst is
    // correctly refused rather than promoted — asserting equality here would have been an
    // assertion about the environment.
    if (a.viewingAs) assert.equal(a.role, seat, `asked to preview ${seat} and was reported as ${a.role}`);
    assert.equal(a.isAdmin, false, `previewing ${seat} still carried isAdmin`);
    assert.equal(a.canWrite, false, `previewing ${seat} still carried write`);
  }

  // And the preview must agree with itself about a specific deal.
  const RANK = { none: 0, status: 1, full: 2 };
  for (const id of listDeals(null, 'partner').map((d) => d.id)) {
    const deal = getDealRaw(id);
    const under = dealAccessLevel(admin, deal, 'member');
    const real = dealAccessLevel(null, deal, 'member');
    assert.ok(RANK[under] <= RANK[real],
      `${id} reads ${under} to someone previewing a member and ${real} to a member`);
  }
});

// SIGNING IN AND CHOOSING WHO TO BE ARE DIFFERENT ACTS, AND BOTH HAVE TO TRAVEL.
//
// Forwarding the SSO token was right and it silently ended the showcase: the verified token
// is the SIGNED-IN person, so it won every time and switching persona in Teams changed
// nothing on screen. The seat had been riding in x-dr-user, which stopped counting the day
// assertions stopped counting — so the fix for one thing removed the other, and the symptom
// was reported as 'the personas do not switch' rather than as an access change.
test('the tab sends both who you are and who you are looking through', () => {
  const src = readFileSync(new URL('../../teams-app/server/index.js', import.meta.url), 'utf8');
  const bearer = (src.match(/headers\.authorization = `Bearer \$\{ssoToken\}`/g) || []).length;
  const seat = (src.match(/headers\['x-dr-demo-as'\] = asOverride/g) || []).length;
  assert.ok(bearer >= 2, `only ${bearer} proxies forward the verified token`);
  assert.ok(seat >= bearer, `${bearer} proxies forward the token and only ${seat} forward the chosen persona`);
});

// And the orchestrator has to honour it, for a caller that has proved BOTH.
test('a verified person may look through a roster persona, and a browser may not', async () => {
  const { describeDemoProfiles } = await import('../lib/userPolicy.js');
  if (!describeDemoProfiles().length) { assert.ok(true, 'no roster in this run'); return; }
  const srv = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  // Gated on the app's proof, on demo mode, and on a real identity already being present —
  // so it is not something a browser can ask for on its own.
  assert.match(srv, /if \(actAs && provenApp && demoProfilesEnabled && req\.drVerified && !req\.drVerified\.walkthrough\)/,
    'the acting-as seat is no longer gated on a verified identity and the app’s proof');
  assert.match(srv, /req\.drActual = req\.drVerified;/,
    'the real person is no longer kept alongside the persona they are viewing as');
});
