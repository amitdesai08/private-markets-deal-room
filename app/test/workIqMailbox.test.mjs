import assert from 'node:assert/strict';
import test from 'node:test';

test('app-only Work IQ mail search uses the configured shared mailbox', async () => {
  process.env.M365_TENANT_ID = '301fb807-bdbc-4bac-802f-39b67f298b6c';
  process.env.M365_CLIENT_ID = 'test-client';
  process.env.M365_CLIENT_SECRET = 'test-secret';
  process.env.WORKIQ_MAILBOX_USER = 'dealroom-demo@example.com';

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/oauth2/v2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'app-token', expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ value: [{
      subject: 'Helvetia update',
      from: { emailAddress: { address: 'banker@example.com' } },
      receivedDateTime: '2026-09-24T12:00:00Z',
      bodyPreview: 'Updated financing terms',
      webLink: 'https://outlook.office.com/mail/example',
    }] }), { status: 200 });
  };

  try {
    const { dispatchWorkiq } = await import('../lib/mcp/workiq.js');
    const result = await dispatchWorkiq('workiq_search_mail', { query: 'Helvetia' });
    assert.equal(result.asUser, false);
    assert.match(calls[1].url, /\/users\/dealroom-demo%40example\.com\/messages\?/);
  } finally {
    global.fetch = originalFetch;
  }
});