// Verify Morningstar MCP access: refresh the stored token, open an MCP session,
// and list the tools the server exposes. Run after scripts/morningstar_login.mjs.
//
//   node scripts/morningstar_verify.mjs

import { morningstarConfigured, connect } from '../lib/mcp/morningstar.js';

async function main() {
  if (!morningstarConfigured()) {
    console.error("No stored Morningstar login. Run: node scripts/morningstar_login.mjs");
    process.exit(1);
  }
  console.log('Refreshing access token and initializing MCP session...');
  const session = await connect('morningstar');
  console.log('Session established (session id:', session.sessionId || 'n/a', ')');

  const res = await session.listTools();
  const tools = res?.tools || [];
  console.log(`\nMorningstar MCP exposes ${tools.length} tool(s):`);
  for (const t of tools) {
    console.log(`  • ${t.name} — ${(t.description || '').slice(0, 100)}`);
  }
  console.log('\nAccess verified.');
}

main().catch((e) => { console.error('\nVerify failed:', e.message); process.exit(1); });
