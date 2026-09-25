// Foundry IQ knowledge retrieval for approved, firm-wide diligence guidance.
//
// This client deliberately does not search deal documents. The first use case asks
// a shared knowledge base for the playbook tests and approval standards that apply
// to a deal's sector/stage, then returns bounded source passages with citation IDs.
// Confidential deal facts remain in the governed Deal Room record.

import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { config } from './config.js';
import { getConnectorConfig } from './connectorSettings.js';

const SEARCH_SCOPE = 'https://search.azure.com/.default';
const MAX_QUERY_CHARS = 2000;
const MAX_ANSWER_CHARS = 8000;
const MAX_REFERENCE_CHARS = 1200;
let defaultTokenProvider;

function clean(value, max = MAX_REFERENCE_CHARS) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function searchEndpoint(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('Foundry IQ search endpoint is not a valid URL.'); }
  if (url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.search.windows.net')) {
    throw new Error('Foundry IQ search endpoint must be an Azure AI Search HTTPS endpoint.');
  }
  return `${url.protocol}//${url.host}`;
}

function settings(override = null) {
  if (override) return { ...override };
  const runtime = getConnectorConfig('foundry-iq');
  return {
    searchEndpoint: runtime.searchEndpoint || config.foundryIq.searchEndpoint,
    knowledgeBase: runtime.knowledgeBase || config.foundryIq.knowledgeBase,
    knowledgeSource: runtime.knowledgeSource || config.foundryIq.knowledgeSource,
    apiVersion: config.foundryIq.apiVersion,
  };
}

export function foundryIqInfo() {
  const current = settings();
  let endpoint = '';
  try { endpoint = searchEndpoint(current.searchEndpoint); } catch { endpoint = ''; }
  return {
    configured: !!(endpoint && current.knowledgeBase),
    endpoint: endpoint ? new URL(endpoint).hostname : null,
    knowledgeBase: current.knowledgeBase || null,
    knowledgeSource: current.knowledgeSource || null,
    apiVersion: current.apiVersion || '2026-04-01',
    useCase: 'IC playbook evidence',
  };
}

export function foundryIqConfigured() {
  return foundryIqInfo().configured;
}

function answerText(data) {
  const parts = [];
  for (const message of data?.response || []) {
    for (const item of message?.content || []) {
      if (typeof item?.text === 'string') parts.push(item.text);
      else if (typeof item === 'string') parts.push(item);
    }
  }
  return clean(parts.join('\n'), MAX_ANSWER_CHARS);
}

function citation(reference) {
  const source = reference?.sourceData && typeof reference.sourceData === 'object'
    ? reference.sourceData
    : {};
  const candidateUrl = reference?.citationUrl || source.docUrl || source.url || source.webUrl || '';
  const url = /^https:\/\//i.test(candidateUrl) ? candidateUrl : null;
  return {
    id: clean(reference?.id || reference?.refId || source.id || reference?.docKey || '', 160) || null,
    type: clean(reference?.type || 'knowledge', 80),
    title: clean(source.title || source.name || reference?.docKey || 'Knowledge base source', 240),
    excerpt: clean(source.content || source.text || source.chunk || source.description || ''),
    url,
  };
}

function tokenProvider() {
  if (!defaultTokenProvider) {
    defaultTokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), SEARCH_SCOPE);
  }
  return defaultTokenProvider;
}

function retrieveBody(search, current) {
  if (String(current.apiVersion || '').toLowerCase().includes('preview')) {
    return {
      messages: [{ role: 'user', content: [{ type: 'text', text: search }] }],
      includeActivity: false,
    };
  }

  const body = {
    intents: [{ type: 'semantic', search }],
    includeActivity: false,
  };
  if (current.knowledgeSource) {
    body.knowledgeSourceParams = [{
      knowledgeSourceName: current.knowledgeSource,
      kind: 'searchIndex',
      includeReferences: true,
    }];
  }
  return body;
}

export async function retrieveFoundryIq(query, options = {}) {
  const current = settings(options.settings || null);
  const endpoint = searchEndpoint(current.searchEndpoint);
  const knowledgeBase = clean(current.knowledgeBase, 200);
  if (!endpoint || !knowledgeBase) {
    return { error: 'foundry-iq-not-configured', answer: '', citations: [], info: foundryIqInfo() };
  }

  const search = clean(query, MAX_QUERY_CHARS);
  if (!search) return { error: 'query-required', answer: '', citations: [] };
  const apiVersion = current.apiVersion || '2026-04-01';
  const body = retrieveBody(search, current);

  const getToken = options.tokenProvider || tokenProvider();
  const accessToken = await getToken();
  const fetchImpl = options.fetchImpl || fetch;
  const url = `${endpoint}/knowledgebases/${encodeURIComponent(knowledgeBase)}/retrieve?api-version=${encodeURIComponent(apiVersion)}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  if (!response.ok) {
    const detail = clean(await response.text().catch(() => ''), 300);
    throw new Error(`Foundry IQ retrieval failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  const citations = (data.references || []).slice(0, options.maxReferences || 8).map(citation);
  return {
    answer: answerText(data),
    citations,
    knowledgeBase,
    query: search,
    mode: 'live',
  };
}

// The supporting use case sends only classification context to the shared playbook
// knowledge base. Company name, deal ID, figures, findings and documents stay local.
const PLAYBOOK_FOCUS = Object.freeze({
  approval: 'Which diligence tests, evidence and approval standards must be satisfied before Investment Committee?',
  commercial: 'Which commercial diligence tests and evidence standards apply?',
  financial: 'Which financial diligence tests and evidence standards apply?',
  legal: 'Which legal and compliance diligence tests and evidence standards apply?',
  technology: 'Which technology, cyber and AI diligence tests and evidence standards apply?',
  operational: 'Which operational diligence tests and evidence standards apply?',
});

export function icPlaybookQuery(deal = {}, focus = 'approval') {
  const summary = deal.summary && typeof deal.summary === 'object' ? deal.summary : deal;
  const sector = clean(summary.sector || 'the target sector', 120);
  const subSector = clean(summary.subSector || '', 120);
  const stage = clean(summary.stageName || summary.stage || 'diligence', 120);
  const focusQuestion = PLAYBOOK_FOCUS[focus] || PLAYBOOK_FOCUS.approval;
  return [
    `Apply the firm's approved diligence and Investment Committee playbook to a ${sector}${subSector ? ` / ${subSector}` : ''} target at the ${stage} stage.`,
    focusQuestion,
    'Return only guidance supported by the knowledge base and identify the source for every requirement. If the playbook does not contain the answer, say so.',
  ].join(' ');
}