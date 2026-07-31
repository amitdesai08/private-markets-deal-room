// THE TAB SERVER IS THE TRUST BOUNDARY — IDENTITY CANNOT BE SELF-ASSERTED.
//
// The orchestrator trusts two headers to say who is calling: `x-bot-key` (proof
// the sender is the Teams server) and `x-dr-user` (who that server says the
// signed-in person is). The tab's reverse proxy used to copy EVERY client header
// through, which meant a browser could put its own `x-dr-user: {"upn":"admin"}`
// on a request. That was only ever stopped by the orchestrator's bot-key check —
// and that check is written `if (BOT_BACKEND_KEY && ...)`, so a deployment that
// forgets the key would fail OPEN and hand administrator to anyone who can type
// a header.
//
// This test pins the fix at the boundary rather than relying on the second
// control being configured: whatever the client sends, the proxy must not
// forward it as an identity claim.
//
// WHAT THIS DOES NOT CERTIFY: it exercises proxyToBackend in isolation with a
// stubbed fetch. It says nothing about the /api/deals path in index.js, which
// builds its headers from a validated SSO token instead of forwarding them.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SHARED_BACKEND_URL = 'https://backend.invalid';
const { proxyToBackend } = await import('../../teams-app/server/proxy.js');

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(o) { this.body = o; return this; },
    send(b) { this.body = b; return this; },
  };
}

// Runs one request through the proxy and returns the headers it actually sent
// upstream, with the keys lowercased so the assertions are case-independent.
async function forwardedHeaders(reqHeaders) {
  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init) => {
    sent = init.headers;
    return { status: 200, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  try {
    await proxyToBackend(
      { method: 'POST', originalUrl: '/api/admin/reseed-demo-deals', headers: reqHeaders, body: {} },
      fakeRes(),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  const out = {};
  for (const [k, v] of Object.entries(sent || {})) out[k.toLowerCase()] = v;
  return out;
}

test('a client-supplied identity header is never forwarded to the backend', async () => {
  const sent = await forwardedHeaders({
    'x-dr-user': '{"upn":"admin","name":"Not Really Michael"}',
    'x-bot-key': 'guessed-or-stolen',
    'x-dr-as': 'Michael Realman',
    'content-type': 'application/json',
  });
  for (const h of ['x-dr-user', 'x-bot-key', 'x-dr-as']) {
    assert.equal(sent[h], undefined, `${h} must be stripped at the proxy, got ${sent[h]}`);
  }
});

test('a client-supplied delegated Graph token is never forwarded', async () => {
  const sent = await forwardedHeaders({ 'x-dr-graph-token': 'eyJhb.stolen.token' });
  assert.equal(sent['x-dr-graph-token'], undefined);
});

test('the view-as lens still travels, because it can only narrow access', async () => {
  // accessFor() applies viewAsRole only when its rank is <= the caller's ACTUAL
  // rank, and isAdmin is computed from the actual role, so asserting a higher
  // role here buys nothing. Stripping it would break the demo seat switcher for
  // no security gain.
  const sent = await forwardedHeaders({ 'x-dr-view-as': 'analyst' });
  assert.equal(sent['x-dr-view-as'], 'analyst');
});

test('ordinary headers are still proxied through', async () => {
  const sent = await forwardedHeaders({ 'authorization': 'Bearer sso-token', 'accept': 'application/json' });
  assert.equal(sent['authorization'], 'Bearer sso-token');
  assert.equal(sent['accept'], 'application/json');
});
