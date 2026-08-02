// Bot Framework adapter for Adaptive Card notifications (Phase 2 seam).
//
// Captures the channel conversation reference on install, then posts proactive
// Adaptive Cards (deal events) into that channel with a deep link back to the
// tab. Card content is sourced from the shared backend — the bot holds no data.
// Everything is lazy + guarded so the app boots without bot credentials.
//
// @author Amit Desai (@amitdesai08)

import { config, isBotConfigured } from './config.js';

const conversationReferences = new Map();
let adapter = null;
let botHandler = null;

export async function initBot() {
  if (!isBotConfigured()) return null;
  if (adapter && botHandler) return { adapter, botHandler };

  const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TeamsActivityHandler, TurnContext } =
    await import('botbuilder');

  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.bot.appId,
    MicrosoftAppPassword: config.bot.appPassword,
    MicrosoftAppType: config.bot.appType,
    MicrosoftAppTenantId: config.bot.tenantId,
  });

  adapter = new CloudAdapter(auth);
  adapter.onTurnError = async (_context, error) => {
    console.error('[bot] turn error:', error);
  };

  class DealRoomBot extends TeamsActivityHandler {
    constructor() {
      super();
      // Remember where to post proactive cards, and greet the channel with its
      // deal context when the app/bot is added.
      this.onConversationUpdate(async (context, next) => {
        const ref = TurnContext.getConversationReference(context.activity);
        conversationReferences.set(ref.conversation.id, ref);
        const added = context.activity.membersAdded || [];
        const botId = context.activity.recipient?.id;
        if (added.some((m) => m && m.id === botId)) {
          try { await sendWelcome(context); } catch { /* non-fatal */ }
        }
        await next();
      });
      this.onMessage(async (context, next) => {
        const ref = TurnContext.getConversationReference(context.activity);
        conversationReferences.set(ref.conversation.id, ref);
        await handleDealMessage(context, TurnContext);
        await next();
      });
    }
  }

  botHandler = new DealRoomBot();
  return { adapter, botHandler };
}

export function getConversationReferences() {
  return conversationReferences;
}

// ---- In-channel conversational agent ---------------------------------------
// A deal channel maps to exactly one deal. Because all deal channels now live in ONE
// parent team, the CHANNEL id (19:…@thread.tacv2) is the only reliable discriminator —
// the team/group id is shared by every deal. So we resolve by channel id FIRST and
// never rely on the shared team/group id.
function teamIdsFromActivity(activity) {
  const cd = activity.channelData || {};
  // conversation.id for a channel message is "19:<thread>@thread.tacv2;messageid=…";
  // strip the messageid suffix so it matches the stored channel id.
  const convBase = String(activity.conversation?.id || '').split(';')[0] || '';
  const ids = [cd.channel?.id, convBase, activity.conversation?.id, cd.team?.aadGroupId, cd.team?.id];
  return [...new Set(ids.filter(Boolean))];
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Resolve the deal for this channel -> { dealId, company } | null.
//   1. by channel/thread id (the persisted channel↔deal map), then
//   2. by the channel's DISPLAY NAME matched to a deal company — robust even when
//      the id map is stale/unhydrated, because a deal channel is named after its company.
async function resolveDeal(activity) {
  const base = config.backend.url;
  if (!base) return null;
  const cd = activity.channelData || {};
  const channelName = cd.channel?.name || '';
  const candidates = teamIdsFromActivity(activity);
  console.log(`[bot] resolveDeal convType=${activity.conversation?.conversationType} channelName="${channelName}" candidates=${JSON.stringify(candidates)}`);

  // 1. by id
  for (const tid of candidates) {
    try {
      const r = await fetch(`${base}/api/deals/resolve-team/${encodeURIComponent(tid)}`);
      if (r.ok) { const d = await r.json(); if (d?.dealId) { console.log(`[bot] resolved by id ${tid} -> ${d.company}`); return d; } }
    } catch { /* try the next candidate id */ }
  }

  // 2. by channel display name -> deal company
  if (channelName) {
    try {
      const r = await fetch(`${base}/api/deals`);
      if (r.ok) {
        const deals = await r.json();
        const cn = normName(channelName);
        const hit = (Array.isArray(deals) ? deals : []).find((d) => {
          const co = normName(d.company);
          return co && cn && (co === cn || co.startsWith(cn) || cn.startsWith(co) || co.includes(cn) || cn.includes(co));
        });
        if (hit) { console.log(`[bot] resolved by name "${channelName}" -> ${hit.company}`); return { dealId: hit.id, company: hit.company }; }
      }
    } catch { /* ignore */ }
  }

  console.log(`[bot] resolveDeal FAILED — no deal for channel "${channelName}" / ${candidates[0] || '(none)'}`);
  return null;
}

// Ask the deal agent (grounded in the deal, authenticated by the app's managed
// identity — no user sign-in) and return its reply text. If the message names a
// persona (AI MD, Retail MD, Supply Chain MD, Partner), route to that persona
// agent WITH the resolved deal context so it answers for THIS channel's deal;
// otherwise use the portfolio/deal analyst.
const PERSONA_MATCHERS = [
  { persona: 'ai-md', re: /\bai[\s-]?md\b|\btech(nology)?\b|\bai\s*(risk|readiness|dd|diligence|lever)/i },
  { persona: 'retail-md', re: /\bretail[\s-]?md\b|\bcommercial\b/i },
  { persona: 'supply-md', re: /\bsupply[\s-]?(chain)?[\s-]?md\b|\boperations?\b|\bsupply\s*chain\b/i },
  { persona: 'partner', re: /\bpartner\b|\binvestment committee\b|\bgo\/?no[\s-]?go\b/i },
];
function personaFor(text) {
  for (const m of PERSONA_MATCHERS) if (m.re.test(text)) return m.persona;
  return null;
}

// Persona lenses applied to the deal analyst so an @mention that names a lead
// (AI MD / Retail MD / Supply MD / Partner) answers in that persona's voice.
const PERSONA_FRAMING = {
  'ai-md': 'You are the Tech/AI diligence lead (AI MD). Focus on technology, data and AI risks, tech debt, scalability and AI/digital value-creation levers.',
  'retail-md': 'You are the Commercial diligence lead (Retail MD). Focus on commercial risks — market/demand, pricing, customer concentration — and commercial value-creation levers.',
  'supply-md': 'You are the Operations / Supply Chain lead (Supply MD). Focus on operational and supply-chain risks, cost-out and operational value-creation levers.',
  partner: 'You are the Deal Partner / IC sponsor. Give a crisp go/no-go read and the IC conditions you would require.',
};

// Human-readable persona tag shown atop a reply so the channel can tell WHO is
// answering (the analyst by default, or the specialist MD / partner when addressed).
const PERSONA_LABEL = {
  'ai-md': { emoji: '\u{1F9E0}', name: 'AI MD', subtitle: 'Tech & AI diligence' },
  'retail-md': { emoji: '\u{1F6CD}\uFE0F', name: 'Retail MD', subtitle: 'Commercial diligence' },
  'supply-md': { emoji: '\u{1F69A}', name: 'Supply Chain MD', subtitle: 'Operations & supply chain' },
  partner: { emoji: '\u{1F91D}', name: 'Partner', subtitle: 'IC sponsor' },
  analyst: { emoji: '\u{1F4CA}', name: 'Deal Room Analyst', subtitle: 'Portfolio analyst' },
};

// Shared trust key so the backend can trust the requesting user's identity we pass
// (the Bot-Framework-authenticated activity.from). Without it the backend treats
// the request as unidentified and applies the default (least) role.
const BOT_BACKEND_KEY = process.env.BOT_BACKEND_KEY || '';
async function callBackend(path, payload, user) {
  const base = config.backend.url;
  const headers = { 'content-type': 'application/json' };
  if (BOT_BACKEND_KEY) headers['x-bot-key'] = BOT_BACKEND_KEY;
  const body = { ...payload };
  if (user && (user.oid || user.name)) body.requestingUser = user;
  const r = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

// Who is this person currently acting as in the demo "view as" switcher?
//
// The switcher lives in the tab and used to be a per-request header, which a channel
// message never carries: you could pick "Eleanor Bishop, Partner" and then get your own
// answers from the bot, which makes the whole access model look like decoration. The
// orchestrator records the choice (demo mode only, roster-validated) and both surfaces
// read it from there.
//
// Asked fresh on every message rather than cached: the presenter switches profile
// mid-demo and the very next question has to reflect it. Failure is not fatal — the bot
// answers as the real signed-in person, which is the correct fallback.
async function resolveActingAs(user) {
  if (!user?.oid && !user?.name) return null;
  const base = config.backend.url;
  if (!base || !BOT_BACKEND_KEY) return null;
  try {
    const r = await fetch(`${base}/api/demo/acting-as`, {
      headers: { 'x-bot-key': BOT_BACKEND_KEY, 'x-dr-user': JSON.stringify({ oid: user.oid, name: user.name }) },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.as ? d : null;
  } catch { return null; }
}

// The showcase roster, used to turn a spoken name into a profile.
async function fetchRoster() {
  const base = config.backend.url;
  if (!base || !BOT_BACKEND_KEY) return [];
  try {
    const r = await fetch(`${base}/api/demo-profiles`, { headers: { 'x-bot-key': BOT_BACKEND_KEY } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

async function writeActingAs(user, profileId) {
  const base = config.backend.url;
  if (!base || !BOT_BACKEND_KEY) return null;
  const r = await fetch(`${base}/api/demo/acting-as`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bot-key': BOT_BACKEND_KEY },
    body: JSON.stringify({ requestingUser: { oid: user.oid, upn: user.upn }, as: profileId || '' }),
  });
  return r.ok ? await r.json() : null;
}

// Turn what someone typed ("act as the partner", "Eleanor", "fund-cfo") into one
// profile. Exported so the matching can be exercised without a Teams channel.
//
// Exact id first, then a whole-word match on the name or title, so "partner" picks the
// profile whose id IS 'partner' rather than one of the several whose titles happen to
// contain the word. Anything still ambiguous is reported back rather than guessed at:
// picking one at random is how a demo ends up showing the wrong person's numbers.
export function matchProfile(phrase, roster = []) {
  const q = String(phrase || '').trim().toLowerCase();
  if (!q) return { match: null, options: [] };
  const exact = roster.find((p) => String(p.id).toLowerCase() === q);
  if (exact) return { match: exact, options: [] };
  const word = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
  const hits = roster.filter((p) => word.test(`${p.name || ''} ${p.title || ''} ${p.id || ''}`));
  if (hits.length === 1) return { match: hits[0], options: [] };
  return { match: null, options: hits };
}

// Switch profile, or ask who you are, without leaving the conversation. The tab's
// switcher works too and they share one record — but a demo runs in the channel, and
// alt-tabbing to a dashboard to change who is speaking breaks the story being told.
// Returns true when the message was a command and has been answered.
async function handleActingCommand(context, text, user) {
  const setAs = /^\s*(?:act|speak|answer)\s+as\s+(.+?)\s*$/i.exec(text);
  const asksWho = /^\s*(?:who\s+am\s+i|whoami)\s*\??\s*$/i.test(text);
  if (!setAs && !asksWho) return false;

  const roster = await fetchRoster();
  if (!roster.length) {
    // No roster means the showcase profiles are off — in a real tenant identity comes
    // from Entra and there is nothing to switch to. Say so rather than failing silently.
    await context.sendActivity('I answer as whoever you are signed in as — there are no showcase profiles to switch between here.');
    return true;
  }

  if (asksWho) {
    const cur = await resolveActingAs(user).catch(() => null);
    await context.sendActivity(cur
      ? `You are asking as **${cur.label || cur.as}**. Say “act as myself” to go back to ${user.name || 'your own account'}.`
      : `You are asking as **${user.name || 'yourself'}**. Say “act as …” and a name to see the deals through someone else’s access.`);
    return true;
  }

  const arg = setAs[1];
  if (/^(me|myself|my ?self)$/i.test(arg)) {
    await writeActingAs(user, null);
    await context.sendActivity(`Back to **${user.name || 'your own account'}** — you will see what your own access allows.`);
    return true;
  }

  const { match, options } = matchProfile(arg, roster);
  if (!match) {
    const list = (options.length ? options : roster).map((p) => `• ${p.name} — ${p.title || p.role}`).join('\n');
    await context.sendActivity(options.length
      ? `“${arg}” could be more than one person:\n\n${list}\n\nWhich one?`
      : `I don’t have anyone called “${arg}”. You can ask as:\n\n${list}`);
    return true;
  }
  const saved = await writeActingAs(user, match.id);
  if (!saved) {
    await context.sendActivity(`I couldn’t switch to ${match.name} just now — try again in a moment.`);
    return true;
  }
  await context.sendActivity(`Now asking as **${match.name}** — ${match.title || match.role}. Their access decides what I can show you; say “act as myself” to switch back.`);
  return true;
}

async function askAgent(message, deal, user, defaultPersona = null) {
  // What the message ASKS for wins; otherwise the seat the asker occupies answers. That
  // fallback is what makes switching profile change the reply: without it every question
  // that did not happen to name a lead went to the analyst no matter who was asking.
  const persona = personaFor(message) || defaultPersona;
  // Orchestration: route a persona-intent request to the MATCHING persona agent,
  // which the backend gates by the REQUESTING USER's role (RBAC) before doing any
  // lane-scoped write; everything else goes to the deal analyst. The Deal Room bot
  // stays the single interface; the specialised agents still do the work.
  if (persona) {
    try {
      const { r, data } = await callBackend(`/api/persona-agents/${persona}/chat`, { message, dealId: deal?.dealId }, user);
      if (data?.denied) return { reply: data.reply, persona, denied: true };       // RBAC blocked (e.g. Stage-2 access)
      if (r.ok && data?.reply) {
        console.log(`[bot] persona ${persona} (role ${data.role || '?'}${data.downgraded ? ', downgraded' : ''}${data.readOnly ? ', read-only' : ''})`);
        // If RBAC downgraded the request, the ANALYST actually answered — label it so.
        return { reply: data.reply, persona: data.downgraded ? 'analyst' : persona };
      }
      console.log(`[bot] persona ${persona} unavailable (HTTP ${r.status}) — falling back to analyst`);
    } catch (e) { console.log(`[bot] persona ${persona} call failed — falling back to analyst`); }
    // Resilient fallback: the analyst with the persona's framing (still RBAC-gated).
    const framing = PERSONA_FRAMING[persona] || '';
    const fmsg = framing ? `${framing}\n\nQuestion: ${message}` : message;
    const { data } = await callBackend('/api/deal-agent/chat', deal?.dealId ? { message: fmsg, dealId: deal.dealId, scope: 'deal' } : { message: fmsg, scope: 'portfolio' }, user);
    if (data?.denied) return { reply: data.reply, persona, denied: true };
    return { reply: data?.reply || data?.error || 'I don’t have an answer right now.', persona };
  }
  // No persona intent — the deal analyst answers, RBAC-gated for Stage-2 access.
  const { data } = await callBackend('/api/deal-agent/chat', deal?.dealId ? { message, dealId: deal.dealId, scope: 'deal' } : { message, scope: 'portfolio' }, user);
  if (data?.denied) return { reply: data.reply, persona: 'analyst', denied: true };
  return { reply: data?.reply || data?.error || 'I don’t have an answer right now.', persona: 'analyst' };
}

// Greet the channel with its deal context when the bot is installed.
async function sendWelcome(context) {
  const deal = await resolveDeal(context.activity).catch(() => null);
  if (deal?.company) {
    await context.sendActivity(`👋 I’m the deal agent for **${deal.company}**. Ask me anything about this deal — diligence risks, IC readiness, the thesis, key figures — right here. No sign-in needed; just @mention me.`);
  } else {
    await context.sendActivity('👋 I’m the deal agent — ask me about this deal. No sign-in needed; just @mention me.');
  }
}

async function handleDealMessage(context, TurnContext) {
  let text = '';
  try { text = (TurnContext.removeRecipientMention(context.activity) || context.activity.text || '').trim(); }
  catch { text = (context.activity.text || '').trim(); }
  const base = config.backend.url;
  if (!base) { await context.sendActivity('The deal agent backend is not configured.'); return; }
  const deal = await resolveDeal(context.activity).catch(() => null);
  if (!text) {
    // An empty @mention is someone looking for the handles, so name the one that is
    // least discoverable — you cannot guess that you are allowed to become someone else.
    const canSwitch = (await fetchRoster().catch(() => [])).length > 0;
    const aside = canSwitch ? '\n\nYou can also say “who am I” or “act as …” to ask through someone else’s access.' : '';
    await context.sendActivity((deal?.company
      ? `Ask me about **${deal.company}** — e.g. “Summarise the diligence risks” or “What’s the IC readiness?”`
      : 'Ask me about this deal — e.g. “What are the top risks?”') + aside);
    return;
  }
  // The requesting user's Bot-Framework-authenticated identity drives RBAC server-side.
  const user = { oid: context.activity.from?.aadObjectId, name: context.activity.from?.name };
  // "Act as …" / "who am I" are handled here rather than sent to an agent: they change
  // who is asking, so they must not be answered BY whoever is currently asking.
  try { if (await handleActingCommand(context, text, user)) return; }
  catch { /* fall through and answer the question normally */ }
  // In a demo, answer as whoever they have switched to — same person, same channel, but
  // the seat they picked. Null in production, where there is nothing to switch to.
  const acting = await resolveActingAs(user).catch(() => null);
  const asker = acting ? { name: acting.as } : user;
  try {
    await context.sendActivities([{ type: 'typing' }]);
    const { reply, persona, denied } = await askAgent(text, deal, asker, acting?.personaId || null);
    const label = PERSONA_LABEL[persona] || PERSONA_LABEL.analyst;
    // Subtle persona tag so the channel can see who's answering; denials stay plain.
    // Under a demo switch the tag names the PROFILE, because "who is answering" is the
    // whole point of the switch and a generic role label would hide that it took effect.
    const tag = acting
      ? `**\u{1F464} ${acting.label || acting.as}**`
      : `**${label.emoji} ${label.name}** \u00b7 _${label.subtitle}_`;
    const out = denied ? reply : `${tag}\n\n${reply}`;
    await context.sendActivity(out);
  } catch (err) {
    await context.sendActivity(`The deal agent hit an error — ${String(err?.message || err).slice(0, 140)}`);
  }
}

// Post an Adaptive Card to every channel the bot has been installed in.
export async function sendAdaptiveCardToAll(card) {
  const b = await initBot();
  if (!b) return { sent: 0, reason: 'bot-not-configured' };
  const { CardFactory } = await import('botbuilder');
  let sent = 0;
  for (const ref of conversationReferences.values()) {
    await b.adapter.continueConversationAsync(config.bot.appId, ref, async (context) => {
      await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
    });
    sent++;
  }
  return { sent };
}
