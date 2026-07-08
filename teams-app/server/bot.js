// Bot Framework adapter for Adaptive Card notifications (Phase 2 seam).
//
// Captures the channel conversation reference on install, then posts proactive
// Adaptive Cards (deal events) into that channel with a deep link back to the
// tab. Card content is sourced from the shared backend — the bot holds no data.
// Everything is lazy + guarded so the app boots without bot credentials.

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
// A deal channel ("Deal - <company>") maps to exactly one deal. The bot works out
// WHICH deal from the channel's team, then relays messages to the shared deal
// agent — which calls Microsoft Foundry with the APP'S MANAGED IDENTITY (SPN), so
// there is NO user sign-in. The bot holds no data; it forwards to /api/deal-agent/chat.
function teamIdsFromActivity(activity) {
  const cd = activity.channelData || {};
  const ids = [cd.team?.aadGroupId, cd.team?.id, cd.channel?.id, activity.conversation?.id];
  return [...new Set(ids.filter(Boolean))];
}

// Resolve the deal that owns this channel's team -> { dealId, company } | null.
async function resolveDeal(activity) {
  const base = config.backend.url;
  if (!base) return null;
  for (const tid of teamIdsFromActivity(activity)) {
    try {
      const r = await fetch(`${base}/api/deals/resolve-team/${encodeURIComponent(tid)}`);
      if (r.ok) { const d = await r.json(); if (d?.dealId) return d; }
    } catch { /* try the next candidate id */ }
  }
  return null;
}

// Ask the deal agent (grounded in the deal, authenticated by the app's managed
// identity — no user sign-in) and return its reply text.
async function askAgent(message, deal) {
  const base = config.backend.url;
  const body = deal?.dealId ? { message, dealId: deal.dealId, scope: 'deal' } : { message, scope: 'portfolio' };
  const r = await fetch(`${base}/api/deal-agent/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return data?.reply || data?.error || 'I don’t have an answer right now.';
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
    await context.sendActivity(deal?.company
      ? `Ask me about **${deal.company}** — e.g. “Summarise the diligence risks” or “What’s the IC readiness?”`
      : 'Ask me about this deal — e.g. “What are the top risks?”');
    return;
  }
  try {
    await context.sendActivities([{ type: 'typing' }]);
    const reply = await askAgent(text, deal);
    await context.sendActivity(reply);
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
