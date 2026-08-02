// The demo "view as" switcher has to reach the assistant in the Teams channels, not
// just the tab. Before this, the choice travelled in a per-request header that a channel
// message never carries: you picked "Eleanor Shellstrop, Partner", asked the assistant a
// question in a channel, and got your own answers back — which makes the access model
// look like decoration rather than enforcement.
//
// It is also an impersonation primitive, so the tests below care as much about what it
// REFUSES as about what it does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { setActingAs, getActingAs } from '../lib/accessConfig.js';

// The switcher only exists in the demo, so the module has to be loaded with the demo
// toggle on (it is read once, at import). accessConfig is imported normally, so both
// module instances share the one record.
const prevDemo = process.env.DEMO_PROFILES;
process.env.DEMO_PROFILES = 'true';
const { actingAsFor } = await import('../lib/userPolicy.js?demo=on');
if (prevDemo === undefined) delete process.env.DEMO_PROFILES; else process.env.DEMO_PROFILES = prevDemo;

const ME = { oid: 'real-oid-1', upn: 'amit@contoso.com', name: 'Amit Desai' };

async function clear() {
  for (const k of Object.keys(getActingAs())) await setActingAs(k, null);
}

test('a chosen profile follows the person into the channels', async () => {
  try {
    await setActingAs(ME.upn, 'partner');
    assert.equal(actingAsFor(ME), 'partner', 'the assistant must answer as the profile the presenter picked');
    // Matched on the identity, not on one particular field, because the tab knows the
    // UPN and the bot activity only carries the object id.
    assert.equal(actingAsFor({ upn: 'AMIT@CONTOSO.COM' }), 'partner', 'the match must survive casing');
    await setActingAs(ME.oid, 'fund-cfo');
    assert.equal(actingAsFor({ oid: 'real-oid-1' }), 'fund-cfo', 'an object id alone must resolve');
  } finally { await clear(); }
});

test('clearing the choice returns a person to their own identity', async () => {
  try {
    await setActingAs(ME.upn, 'analyst');
    await setActingAs(ME.upn, null);
    assert.equal(actingAsFor(ME), null, 'switching back must be possible, or the demo is a one-way door');
  } finally { await clear(); }
});

test('a display name can never select who you are answering as', async () => {
  // A display name is supplied by the caller and is not unique; keying impersonation on
  // it would let anyone who can set their own name inherit someone else's access.
  try {
    await setActingAs('amit desai', 'partner');
    assert.equal(actingAsFor({ name: 'Amit Desai' }), null);
    assert.equal(actingAsFor({ name: 'Amit Desai', oid: 'someone-else' }), null);
  } finally { await clear(); }
});

test('a stored value that is not a showcase profile resolves to nobody', async () => {
  // Defence against a hand-edited config document or a profile that has since been
  // removed: the roster is re-checked on every read rather than trusted once on write.
  try {
    await setActingAs(ME.upn, 'superuser');
    assert.equal(actingAsFor(ME), null, 'an unknown id must not be honoured');
  } finally { await clear(); }
});

test('outside the demo there is no impersonation at all', async () => {
  // In a real tenant identity comes from Entra and nothing may override it. The record
  // is ignored rather than merely hidden, so a deploy with a stale config is still safe.
  const prev = process.env.DEMO_PROFILES;
  try {
    await setActingAs(ME.upn, 'partner');
    process.env.DEMO_PROFILES = 'false';
    const { actingAsFor: fresh } = await import(`../lib/userPolicy.js?nodemo=${Date.now()}`);
    assert.equal(fresh(ME), null, 'with the demo off, a recorded choice must not take effect');
  } finally {
    if (prev === undefined) delete process.env.DEMO_PROFILES; else process.env.DEMO_PROFILES = prev;
    await clear();
  }
});

test('an unidentified caller is nobody in particular', async () => {
  try {
    await setActingAs(ME.upn, 'partner');
    assert.equal(actingAsFor({}), null);
    assert.equal(actingAsFor(null), null);
  } finally { await clear(); }
});
