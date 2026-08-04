// AI client — talks to the deployed Azure AI Foundry (Azure OpenAI) model when
// configured, otherwise reports "demo" so callers fall back to seeded output.
// Auth prefers managed identity (DefaultAzureCredential); an API key is optional.

import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { config } from './config.js';

const endpoint = config.ai.endpoint;
const deployment = config.ai.deployment;
const apiVersion = config.ai.apiVersion;
const apiKey = config.ai.apiKey;

// gpt-5 and the o-series are reasoning models: they use max_completion_tokens
// (not max_tokens), only support the default temperature, and spend tokens on
// internal reasoning — so they need a larger completion budget. Detected per
// deployment inside complete() so a per-call override is handled correctly.

// One AzureOpenAI client per deployment (Azure binds the deployment at client
// construction, so a per-deployment cache lets callers target a different model —
// e.g. the higher-capacity news deployment for background report generation).
const clients = {};
let sharedCredential = null;

function clientFor(dep) {
  if (!endpoint) return null;
  if (clients[dep]) return clients[dep];
  try {
    if (apiKey) {
      clients[dep] = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment: dep });
    } else {
      sharedCredential = sharedCredential || new DefaultAzureCredential();
      const azureADTokenProvider = getBearerTokenProvider(sharedCredential, 'https://cognitiveservices.azure.com/.default');
      clients[dep] = new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion, deployment: dep });
    }
  } catch {
    clients[dep] = null;
  }
  return clients[dep];
}

export function getModelInfo() {
  return {
    mode: endpoint ? 'live' : 'demo',
    model: deployment,
    endpoint: endpoint ? endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
    auth: endpoint ? (apiKey ? 'api-key' : 'managed-identity') : null
  };
}

// House-style scrubber applied to EVERY model reply, on the way out.
//
// A prompt instruction is a request; this is the guarantee. The assistant was
// printing "(mcp_dealroom.get_deal; mcp_dealroom.get_ic_readiness)" mid-sentence and
// re-denominating dollar figures into euros -- on the one screen a buyer is actually
// shown in a demo, and after every deterministic surface in the product had been
// brought into line. Deal figures are US dollars; internal plumbing has no business
// on a partner's screen under any circumstances.
export function houseStyle(md) {
  if (!md) return md;
  let s = String(md);
  // Parenthetical tool citations, e.g. "(mcp_dealroom.get_deal; mcp_x.get_y)".
  s = s.replace(/\s*\((?:\s*(?:mcp|workiq)_[\w.]+\s*[;,]?)+\)/gi, '');
  // Any bare internal tool name left in prose.
  s = s.replace(/\b(?:mcp|workiq)_[\w.]+\b/gi, 'the deal record');

  // The Foundry agent's own tools are not prefixed, so none of the rules above touched
  // them. A partner was handed a numbered list of five things to do, every one of which
  // read "the deal record {deal_id: "..."} — run immediately": five different tools
  // collapsed onto one phrase, and an instruction nobody outside the code can carry out.
  // Delete the instruction blocks rather than masking them, and drop the raw keys.
  s = s.replace(/^#{0,6}\s*\**\s*(?:which tools you should call|tools to call|next tool calls?|recommended tool calls?)\b.*$(?:\n(?!#{1,6}\s|\s*$).*)*/gim, '');
  s = s.replace(/^\s*[-*\u2022]?\s*(?:run|call|use)\s+(?:get|list|search|create|record|resolve|propose)_[a-z0-9_]+\b.*$/gim, '');
  s = s.replace(/\b(?:get|list|search|create|record|resolve|propose)_[a-z0-9_]{2,}\b/g, 'the deal record');
  // The substitution above leaves the call's own punctuation behind -- "the deal
  // record(deal)" and "the deal record()" both appeared on screen. Take the empty
  // or single-word argument list with it.
  s = s.replace(/the deal record\s*\(\s*[A-Za-z0-9_ ,."'&\/-]{0,60}\s*\)/gi, 'the deal record');
  s = s.replace(/\s*[({]\s*deal_id\s*[:=]\s*["'\u201c][^"'\u201d)}]*["'\u201d]\s*[)}]/gi, '');
  s = s.replace(/\bdeal_id\b/gi, 'deal');

  // "daysToIC -26" is a field name and a sign convention. Say what the deal pages say.
  s = s.replace(/\bdaysToIC[:\s]*(-?\d+)\b/gi, (_m, n) => (Number(n) < 0 ? `IC was ${Math.abs(Number(n))} days ago` : `IC in ${n} days`));

  // Record keys were reaching the screen as if they were names: the assistant listed
  // "**demo-meridian** — Meridian Logistics (status: owned)". The key is ours, not the
  // reader's, and the "demo-" half of it announces to a prospect that the book in front
  // of them is invented. Take the key and leave the company name standing.
  s = s.replace(/\**\s*demo-[a-z0-9-]+\s*\**\s*(?:\u2014|\u2013|-)\s*/gi, '');
  s = s.replace(/\bdemo-[a-z0-9-]+\b/gi, 'the deal');

  // Field paths dressed up as citations — "(the deal record: count = 6)",
  // "(the deal record: risks/compliance)". A source note is meant to tell a partner
  // where to go and check; a path into our own object graph tells them nothing.
  s = s.replace(/\(\s*\**\s*the deal record\s*:[^)]*\)/gi, '(the deal record)');
  s = s.replace(/\(\s*\**\s*risks?(?:\s*\/\s*compliance)?\s*\**\s*\)/gi, '(the risk register)');
  s = s.replace(/\band\s+\(the risk register\)/gi, 'and the risk register');

  // Not a phrase anybody in the market uses.
  s = s.replace(/\bpress trade\b/gi, 'press ahead');

  // Collapse the blank runs the deletions leave behind.
  s = s.replace(/\n{3,}/g, '\n\n');
  // One reporting currency. The records are dollars; a euro sign here is the model's
  // invention, and an identical numeral under two symbols is worse than a wrong one.
  s = s.replace(/[\u20ac\u00a3](?=\s?[\d.])/g, '$');
  // The profession's spellings.
  s = s.replace(/\bMoIC\b/g, 'MOIC').replace(/\bartifacts?\b/gi, (m) => (m[0] === 'A' ? 'IC papers' : 'IC papers'));
  return s;
}

// Optional `dep` overrides the deployment for this call (defaults to the app model).
export async function complete({ system, user, maxTokens = 700, temperature = 0.4, deployment: dep = deployment }) {
  const c = clientFor(dep);
  if (!c) return null;
  const reasoning = /(^|[-_])(gpt-5|o1|o3|o4)/i.test(dep);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  const params = reasoning
    ? {
        model: dep,
        messages,
        max_completion_tokens: Math.max(maxTokens * 5, 5000),
        reasoning_effort: 'low'
      }
    : { model: dep, messages, temperature, max_tokens: maxTokens };
  const resp = await c.chat.completions.create(params);
  return houseStyle(resp.choices?.[0]?.message?.content?.trim() || null);
}
