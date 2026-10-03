import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { config } from './config.js';
import { listIqRoutes, routePromptToIq } from './iqRegistry.js';

const ROUTER_SCOPE = 'https://ai.azure.com/.default';
const ROUTER_TIMEOUT_MS = 8_000;
let tokenProvider;

function outputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      else if (typeof content?.text?.value === 'string') parts.push(content.text.value);
    }
  }
  return parts.join('\n');
}

export function parseHostedIqRoute(data) {
  const parsed = JSON.parse(outputText(data));
  const canonical = listIqRoutes().find((route) => route.id === parsed?.id);
  if (!canonical || typeof parsed.blockedCombination !== 'boolean' || !Array.isArray(parsed.matched)) {
    throw new Error('invalid hosted IQ route');
  }
  return {
    ...canonical,
    matched: parsed.matched.filter((id) => listIqRoutes().some((route) => route.id === id)),
    blockedCombination: parsed.blockedCombination,
    decision: String(parsed.decision || canonical.reason),
    trace: Array.isArray(parsed.trace) ? parsed.trace : [],
    router: 'hosted',
  };
}

export function parseHostedIqRouteStream(body) {
  const events = String(body || '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => JSON.parse(line));
  const completed = events.findLast((event) => event.type === 'response.completed');
  if (completed?.response) return parseHostedIqRoute(completed.response);
  const output = events.findLast((event) => event.type === 'response.output_text.done');
  if (typeof output?.text === 'string') return parseHostedIqRoute({ output_text: output.text });
  throw new Error('hosted IQ route stream did not complete');
}

export async function resolveIqRoute(prompt, {
  endpoint = config.foundry.hostedIqRouterEndpoint,
  fetchImpl = fetch,
  getToken,
} = {}) {
  if (!endpoint) return { ...routePromptToIq(prompt), router: 'local' };
  try {
    tokenProvider ||= getBearerTokenProvider(new DefaultAzureCredential(), ROUTER_SCOPE);
    const token = await (getToken || tokenProvider)();
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: String(prompt || '') }),
      signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`hosted IQ router ${response.status}`);
    const contentType = response.headers?.get?.('content-type') || '';
    return contentType.includes('text/event-stream')
      ? parseHostedIqRouteStream(await response.text())
      : parseHostedIqRoute(await response.json());
  } catch {
    return { ...routePromptToIq(prompt), router: 'local-fallback' };
  }
}