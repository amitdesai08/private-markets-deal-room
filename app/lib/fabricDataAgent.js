// Microsoft Fabric Data Agent integration — natural-language questions over the
// fund's Fabric lakehouse ("Deal Room" / deal_room_starter). Two honest modes,
// reported by fabricDataAgentInfo():
//   • 'live'     — POST the question to a published Fabric Data Agent endpoint
//                  (FABRIC_DATA_AGENT_URL) with an AAD token; returns its grounded
//                  answer + citations straight from OneLake.
//   • 'grounded' — no live agent bound: answer the question over the local market-
//                  intelligence snapshot (lib/fabric.js — the same lakehouse data,
//                  live/materialized/seed) via the Foundry model, so the NL data-agent
//                  experience works in a fully packaged demo. Clearly labelled.
//
// Never fabricates: with neither a live agent nor a model available it says so.

import { DefaultAzureCredential } from '@azure/identity';
import { getMarketIntel, fabricInfo } from './fabric.js';
import { complete, getModelInfo } from './ai.js';

const AGENT_URL = process.env.FABRIC_DATA_AGENT_URL || '';
const AGENT_SCOPE = process.env.FABRIC_DATA_AGENT_SCOPE || 'https://api.fabric.microsoft.com/.default';

let _cred = null;
const cred = () => (_cred ||= new DefaultAzureCredential());

export function fabricDataAgentConfigured() {
  return true; // always answerable — live when bound, else grounded on the snapshot
}

export function fabricDataAgentInfo() {
  const live = !!AGENT_URL;
  const model = getModelInfo();
  const fi = fabricInfo();
  return {
    configured: true,
    liveConfigured: live,
    mode: live ? 'live' : (model.mode !== 'demo' ? 'grounded' : 'seed-only'),
    url: live ? AGENT_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null,
    workspace: fi.workspace,
    lakehouse: fi.lakehouse,
  };
}

async function askLive(question) {
  const token = await cred().getToken(AGENT_SCOPE);
  const r = await fetch(AGENT_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Fabric Data Agent ${r.status}`);
  const data = await r.json().catch(() => ({}));
  return {
    mode: 'live',
    answer: data.answer || data.output || data.content || String(JSON.stringify(data)).slice(0, 2000),
    citations: data.citations || data.sources || [],
    source: 'fabric-data-agent',
  };
}

async function askGrounded(question) {
  const mi = getMarketIntel();
  if (!mi) return { mode: 'unconfigured', answer: 'No Fabric Data Agent is bound and no market-intelligence snapshot is loaded.', citations: [] };
  const context = String(JSON.stringify({
    companies: mi.companies,
    comparableDeals: mi.comparableDeals,
    benchmarkFindings: mi.benchmarkFindings,
    icPrecedents: mi.icPrecedents,
    companyFinancials: mi.companyFinancials,
  })).slice(0, 12000);
  const answer = await complete({
    system: 'You are a Microsoft Fabric Data Agent answering strictly from the provided Deal Room lakehouse market-intelligence JSON. Be concise. Cite the specific companies, deals or metrics you used. If the data does not contain the answer, say so plainly — never invent numbers.',
    user: `Lakehouse data (JSON):\n${context}\n\nQuestion: ${question}`,
    maxTokens: 500,
  }).catch(() => null);
  if (!answer) {
    return { mode: 'unconfigured', answer: 'No Fabric Data Agent is bound and the Foundry model is unavailable, so natural-language querying is off. Bind a published Fabric Data Agent via FABRIC_DATA_AGENT_URL.', citations: [] };
  }
  return {
    mode: 'grounded',
    answer,
    citations: [{ label: `fabric:${fabricInfo().workspace}/${fabricInfo().lakehouse}`, note: 'grounded on the local market-intelligence snapshot' }],
    source: 'market-intel-snapshot',
  };
}

// Ask the Fabric Data Agent a natural-language question. Prefers the live published
// agent; degrades honestly to the grounded snapshot answer (recording liveError).
export async function askFabricDataAgent(question) {
  const q = String(question || '').trim();
  if (!q) return { mode: 'error', answer: 'Ask a question about the fund\u2019s market-intelligence data.', citations: [] };
  if (AGENT_URL) {
    try {
      return await askLive(q);
    } catch (e) {
      const g = await askGrounded(q);
      g.liveError = String(e?.message || e).slice(0, 120);
      return g;
    }
  }
  return askGrounded(q);
}
