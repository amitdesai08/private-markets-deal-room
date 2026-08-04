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

  // Our workstream status keys, written at a partner as though they were English. One
  // answer used `closed_at_ic` seven times, including "by definition in our records
  // model". She worked out what it meant and said she would not read it aloud -- which
  // is the right instinct and also the end of the demo. The keys are ours; say the
  // thing they mean.
  s = s.replace(/`?\bclosed_at_ic\b`?/gi, 'closed at IC');
  s = s.replace(/`?\bin_progress\b`?/gi, 'in progress');
  s = s.replace(/`?\bnot_started\b`?/gi, 'not started');
  s = s.replace(/\bby definition in our records model\b/gi, 'on the record');

  // Field paths dressed as citations, one per line, in a side-by-side comparison a
  // partner said she could not forward to anyone: "(summary.dealSize, currency)",
  // "(summary.daysToIC / projectedICDate)", "(workstreams.legal = not started)",
  // "(memo.progress 68%)". Dotted lowercase object paths are ours; strip the wrapper
  // and keep whatever plain-English value was inside it.
  s = s.replace(/\(\s*[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+\s*(?:[=:]\s*([^)]{1,60}))?\s*\)/g, (_m, val) => (val ? `(${String(val).trim()})` : ''));
  s = s.replace(/\(\s*[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+\s*[,/]\s*[A-Za-z0-9_.]+\s*\)/g, '');
  // Bare status keys read out at a partner: "Status: in_diligence".
  const STATUS_WORDS = { in_diligence: 'in diligence', ic_ready: 'IC ready', on_hold: 'on hold', due_diligence: 'due diligence', value_creation: 'value creation' };
  s = s.replace(/`?\b(in_diligence|ic_ready|on_hold|due_diligence|value_creation)\b`?/gi, (m) => STATUS_WORDS[m.toLowerCase().replace(/`/g, '')] || m);
  // We do not run sprints; nobody in a fund says it.
  s = s.replace(/\bDD sprints?\b/g, (m) => (m.endsWith('s') ? 'focused diligence' : 'focused diligence'));
  s = s.replace(/\b(?:diligence|workstream) sprints?\b/gi, 'focused diligence');
  // "(the deal record; the deal record.workstreams.legal)" -- the citation label with a
  // field path glued to the end of it. The earlier rule only catches paths that begin
  // the bracket, so this one survived and went straight to a partner.
  s = s.replace(/\b(the deal record)((?:\.[A-Za-z0-9_]+)+)/g, '$1');
  // A placeholder the model left in: "forces a >$X equity re-fill". An unresolved X in
  // a sentence about money is worse than no sentence -- say we do not have the number.
  s = s.replace(/([<>]?\s*[$\u20ac\u00a3]\s*)X\b/g, 'an undisclosed');
  // Our internal stage keys, printed as bare lower-case tags beside every step.
  const STAGE_WORDS = { origination: 'Origination', diligence: 'Diligence', execution: 'Execution', value: 'Value creation' };
  s = s.replace(/(^|[\s(])`(origination|diligence|execution|value)`/g, (_m, pre, w) => `${pre}${STAGE_WORDS[w] || w}`);
  // Report-writer's scaffolding that reads as a category, not a sentence. The model
  // rewrites the parenthetical the moment you name one variant of it, so catch any
  // parenthetical the writer has attached to its own heading.
  s = s.replace(/\bSo what\s*\([^)\n]{0,40}\)\s*:/gi, 'So what:');
  s = s.replace(/\bSo what\s*\([^)\n]{0,40}\)/gi, 'So what');
  s = s.replace(/\bBottom line\s*\([^)\n]{0,40}\)\s*:/gi, 'Bottom line:');
  // "Where the money and risk are concentrated (Lumen only)" -- a heading that admits,
  // in brackets, that it answered a narrower question than the one asked.
  s = s.replace(/\s*\((?:[A-Z][A-Za-z]*\s+)?only\)/g, '');
  // Our internal step codes, printed as though they were vocabulary: "Current step is
  // D3", "finalize the D3 IC memo", "convert Proceed → Hold/Pass".
  s = s.replace(/\b(?:current step is\s*)?\b([ODEV])(\d)\b(?=[\s.,;:)]|$)/g, (m) => m.replace(/[ODEV]\d/, 'this stage'));
  s = s.replace(/\bNOT[-\s\u2011]READY\b/gi, 'not ready for committee');
  s = s.replace(/\bIC[-\s\u2011]READY\b/gi, 'ready for committee');
  // The bare enum on its own, as in "do not present until the deal record returns
  // READY". Only when it stands alone in capitals, so ordinary prose is untouched.
  s = s.replace(/(?<=\breturns |\bis |\bshows |=\s?)READY\b/g, 'ready for committee');
  // Raw field names in a sentence: "readiness 65, daysToIC = 9".
  s = s.replace(/\bdaysToIC\s*=?\s*(\d+)/g, 'IC is $1 days away');
  s = s.replace(/\bin_diligence\b/g, 'in diligence');
  s = s.replace(/\bIC IC\b/g, 'IC');
  // "swing the base-case toward >10x" -- a spreadsheet operator dropped into a
  // sentence. A partner reads these aloud; ">" has no sound.
  s = s.replace(/(?<![\n>])>\s*(?=[\d$])/g, 'more than ');
  s = s.replace(/(?<![\n<])<\s*(?=[\d$])/g, 'less than ');
  // The same source cited twice inside one bracket, which happened three times in a
  // single answer and makes the citation look broken.
  s = s.replace(/\[([^\]\n]+)\]/g, (m, inner) => {
    const parts = inner.split(/\s*;\s*/).map((p) => p.trim()).filter(Boolean);
    const seen = []; for (const p of parts) if (!seen.includes(p)) seen.push(p);
    return seen.length === parts.length ? m : `[${seen.join('; ')}]`;
  });
  // Internal record names, step codes and field names leaking into an answer:
  // "we're scoped to a single deal (lumen-analytics)", "finalize the D3 IC memo",
  // "stage O2-O4, disposition, fit score", "I'll cite the dealroom workstreams".
  s = s.replace(/\b(deal|record|id|company)\s*\(\s*[a-z0-9]+(?:-[a-z0-9]+)+\s*\)/gi, '$1');
  s = s.replace(/\bstages?\s+[ODEV]\d(?:\s*[-\u2013]\s*[ODEV]\d)?\b/gi, 'stage');
  s = s.replace(/\bthe\s+[ODEV]\d\s+/g, 'the ');
  s = s.replace(/\bdisposition\b/gi, 'decision');
  s = s.replace(/\bfit score\b/gi, 'fit');
  s = s.replace(/\bdealroom\b/gi, 'deal');
  // "authorize me to run the deal record" reads as though the assistant wants a
  // password. It wants permission to look something up, and it should just ask.
  s = s.replace(/\bauthori[sz]e me to\b/gi, 'say the word and I will');
  // Capitals used for emphasis mid-sentence: "do NOT go to IC in nine days". A partner
  // reads these aloud to a committee and will not shout.
  s = s.replace(/(?<=[a-z] )(NOT|MUST|ALL|ONLY|NEVER)(?= [a-z])/g, (m) => m.toLowerCase());

  // Collapse the blank runs the deletions leave behind.
  s = s.replace(/\n{3,}/g, '\n\n');
  // One reporting currency. The records are dollars; a euro sign here is usually the
  // model's invention, and an identical numeral under two symbols is worse than a wrong
  // one. But the seeded diligence documents on European deals are denominated in euros,
  // and this rule was quietly restating "EUR 4.1M of ARR" from a quality-of-earnings
  // report as "$4.1m" in an answer a partner was about to forward. Rewriting the symbol
  // on a figure that was lifted from a document invents a number. Only normalise a bare
  // symbol, never one the model has written as an explicit currency code.
  s = s.replace(/(?<!EUR\s)(?<!GBP\s)[\u20ac\u00a3](?=\s?[\d.])/g, '$');
  // The profession's spellings.
  s = s.replace(/\bMoIC\b/g, 'MOIC').replace(/\bartifacts?\b/gi, (m) => (m[0] === 'A' ? 'IC papers' : 'IC papers'));
  // "four required IC IC papers outstanding". The artifacts substitution above runs
  // last, so it manufactures the very stutter an earlier rule was there to remove.
  // Cleaning up after ourselves has to come after ourselves.
  s = s.replace(/\bIC IC\b/g, 'IC').replace(/\bIC papers papers\b/gi, 'IC papers');
  // "So what / decision rule:" -- the model keeps reinventing the label it was told
  // not to use. Ban the shape, not the string: anything hanging off "So what" or
  // "Bottom line" with a slash is the same tic.
  s = s.replace(/\bSo what\s*\/\s*[^:\n]{0,30}:/gi, 'So what:');
  s = s.replace(/\bBottom line\s*\/\s*[^:\n]{0,30}:/gi, 'Bottom line:');
  // "do not present until the deal record returns ready for committee" -- an
  // instruction to the reader about how to query a database, in an answer to a
  // question about a company.
  s = s.replace(/\bthe deal record returns ready for committee\b/gi, 'it is ready for committee');
  s = s.replace(/\buntil the deal record\b/gi, 'until the deal');
  // "(the deal record; the deal record)". The de-duplication above only covers square
  // brackets, and the model cites in both.
  s = s.replace(/\(([^)\n]{3,120})\)/g, (m, inner) => {
    if (!inner.includes(';')) return m;
    const parts = inner.split(';').map((x) => x.trim()).filter(Boolean);
    const seen = [];
    for (const p of parts) if (!seen.some((q) => q.toLowerCase() === p.toLowerCase())) seen.push(p);
    return seen.length === parts.length ? m : `(${seen.join('; ')})`;
  });
  // "requires permission to include all deals outside the current single-deal scope".
  // Nobody needs permission. The conversation is narrow, not the person -- and asking
  // a partner to authorise her own book is how you teach her the product does not know
  // who she is.
  s = s.replace(/\s*\((?:this |which )?requires? (?:your )?permission[^)\n]{0,90}\)/gi, '');
  s = s.replace(/\brequires? (?:your )?permission to include all deals[^.\n]{0,60}\./gi, 'That is a question about the whole book rather than this deal.');
  s = s.replace(/\bsingle[- ]deal scope\b/gi, 'this one deal');
  s = s.replace(/\bcurrent scope\b/gi, 'this conversation');
  return s;
}

// Optional `dep` overrides the deployment for this call (defaults to the app model).
// Temperature was 0.4, and a partner asked the same question about the same unchanged
// deal twice and was told to push it and then to proceed with it. She was right that
// this is the whole product: an assistant that answers differently on Monday and
// Tuesday cannot be quoted in a committee, and a partner cannot supervise a tool whose
// job is to save them the reading. Recommendations must be reproducible; a little
// variety in the prose is not worth a contradiction in the verdict.
export async function complete({ system, user, maxTokens = 700, temperature = 0.1, deployment: dep = deployment }) {
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
