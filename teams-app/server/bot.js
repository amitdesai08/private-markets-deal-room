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
      // Remember where to post proactive cards.
      this.onConversationUpdate(async (context, next) => {
        const ref = TurnContext.getConversationReference(context.activity);
        conversationReferences.set(ref.conversation.id, ref);
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
// A deal channel ("Deal - <company>") maps to exactly one deal. When a member
// @mentions the bot (or messages it) in that channel, resolve the deal from the
// channel's team and relay the message to the shared deal agent, replying in the
// same thread. The bot holds no data — it forwards to /api/deal-agent/chat.
function teamIdsFromActivity(activity) {
  const cd = activity.channelData || {};
  const ids = [cd.team?.aadGroupId, cd.team?.id, cd.channel?.id, activity.conversation?.id];
  return [...new Set(ids.filter(Boolean))];
}

async function resolveDealId(activity, base) {
  for (const tid of teamIdsFromActivity(activity)) {
    try {
      const r = await fetch(`${base}/api/deals/resolve-team/${encodeURIComponent(tid)}`);
      if (r.ok) { const d = await r.json(); if (d?.dealId) return d.dealId; }
    } catch { /* try the next candidate id */ }
  }
  return null;
}

async function handleDealMessage(context, TurnContext) {
  let text = '';
  try { text = (TurnContext.removeRecipientMention(context.activity) || context.activity.text || '').trim(); }
  catch { text = (context.activity.text || '').trim(); }
  if (!text) { await context.sendActivity('Ask me about this deal — e.g. “Summarise the diligence risks” or “What’s the IC readiness?”'); return; }
  const base = config.backend.url;
  if (!base) { await context.sendActivity('The deal agent backend is not configured.'); return; }
  const dealId = await resolveDealId(context.activity, base);
  if (!dealId) { await context.sendActivity("I couldn’t match this channel to a deal — open it from the Deal Dashboard tab first."); return; }
  try {
    await context.sendActivities([{ type: 'typing' }]);
    const r = await fetch(`${base}/api/deal-agent/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, dealId, scope: 'deal' }),
    });
    const data = await r.json().catch(() => ({}));
    await context.sendActivity(data?.reply || data?.error || "I don’t have an answer right now.");
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
