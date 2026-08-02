// One place to see everything that has happened on a deal in Microsoft 365 — the
// email, the channel discussion and the files — merged into a single time-ordered
// feed.
//
// The pieces already existed and were each real, but they were three separate
// surfaces behind three different tabs, and the email was not surfaced anywhere at
// all. That is the opposite of the promise: someone working a deal had to remember
// which of Outlook, Teams and SharePoint held the thing they half-remembered. What
// they actually want is "what has happened on Meridian this week", answered once.
//
// Two rules this module exists to keep:
//
//   1. NOTHING IS INVENTED. Every item restates something that exists — a real Graph
//      result when the caller has a delegated token, or the composed corpus when they
//      do not. `live` says which, per item, so the interface can be honest instead of
//      implying a mailbox was read when it was not.
//
//   2. A LINK IS A PROMISE. `url` is only ever set to a URL Microsoft 365 gave us. A
//      composed item has no URL and gets no "Open" button, because a button that
//      opens nothing is worse than no button. Files carry an `open` descriptor from
//      docOpen.js instead, so a document the platform can build is still one click
//      away and one it cannot is honest about it.

import { resolveDocOpen } from './docOpen.js';

const KIND_RANK = { email: 0, message: 1, file: 2 };

const ts = (v) => {
  const n = new Date(v || 0).getTime();
  return Number.isFinite(n) ? n : 0;
};
const clip = (s, n = 240) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
// A URL is only worth rendering if it is one we can actually navigate to. Graph
// returns absolute https URLs; anything else is not something we were given.
const safeUrl = (u) => {
  const s = String(u || '').trim();
  return /^https:\/\/[^\s]+$/i.test(s) ? s : null;
};

function emailItem(m, { live }) {
  const when = m.received || m.receivedDateTime || null;
  return {
    id: `mail:${m.id || m.webLink || `${m.subject}|${when}`}`,
    kind: 'email',
    title: clip(m.subject || '(no subject)', 140),
    who: m.from || null,
    to: m.to || null,
    when,
    preview: clip(m.preview || m.bodyPreview),
    url: safeUrl(m.webLink),
    live,
  };
}

function messageItem(m, { live }) {
  const when = m.created || m.createdDateTime || null;
  return {
    id: `msg:${m.id || `${m.from}|${when}`}`,
    kind: 'message',
    title: m.from ? `${m.from} in the deal channel` : 'Deal channel',
    who: m.from || null,
    to: m.personaId || null,
    when,
    preview: clip(m.preview || m.text),
    url: safeUrl(m.webUrl),
    live,
  };
}

function fileItem(f, { live }) {
  const when = f.lastModified || f.modified || null;
  return {
    id: `file:${f.id || f.webUrl || f.name}`,
    kind: 'file',
    title: clip(f.name || 'Document', 140),
    who: f.lastModifiedBy || null,
    to: null,
    when,
    preview: clip(f.summary),
    url: safeUrl(f.webUrl),
    open: resolveDocOpen({ name: f.name, webUrl: safeUrl(f.webUrl), summary: f.summary }),
    live,
  };
}

// Merge, de-duplicate and order. A live result and a composed one can describe the
// same document, so the live one wins: it is the real thing and it can be opened.
function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    const key = `${it.kind}|${(it.title || '').toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev || (it.live && !prev.live)) seen.set(key, it);
  }
  return [...seen.values()];
}

/**
 * Build the merged feed for one deal.
 *
 * `live*` are Microsoft Graph responses (or null when the caller had no delegated
 * token, or the call failed); `corpus` is the composed fallback. Both are optional
 * and either may be empty — an empty feed is a legitimate answer and says so.
 *
 * `persona` is the seat the viewer occupies. It marks the items addressed to them,
 * which is what turns a feed into a to-do list: on a deal with forty things on it,
 * the three that name you are the ones you came for.
 */
export function buildRecentActivity(deal, {
  corpus = null,
  liveChannel = null,
  liveFiles = null,
  liveMail = null,
  persona = null,
  limit = 40,
} = {}) {
  const liveMsgs = Array.isArray(liveChannel?.results) ? liveChannel.results : [];
  const liveFileHits = Array.isArray(liveFiles?.results) ? liveFiles.results : [];
  const liveMailHits = Array.isArray(liveMail?.results) ? liveMail.results : [];

  // Live and composed are combined rather than one replacing the other: a real
  // mailbox search can legitimately return nothing for a deal that still has a
  // channel full of discussion, and blanking the whole feed in that case would be
  // wrong. dedupe() stops the same item appearing twice.
  const items = dedupe([
    ...liveMailHits.map((m) => emailItem(m, { live: true })),
    ...liveMsgs.map((m) => messageItem(m, { live: true })),
    ...liveFileHits.map((f) => fileItem(f, { live: true })),
    ...(corpus?.mail || []).map((m) => emailItem(m, { live: false })),
    ...(corpus?.channel?.messages || []).map((m) => messageItem(m, { live: false })),
    ...(corpus?.files || []).map((f) => fileItem(f, { live: false })),
  ])
    .map((it) => ({ ...it, forMe: !!persona && String(it.to || '') === String(persona) }))
    .sort((a, b) => (ts(b.when) - ts(a.when)) || (KIND_RANK[a.kind] - KIND_RANK[b.kind]))
    .slice(0, limit);

  const counts = { email: 0, message: 0, file: 0, forMe: 0, live: 0 };
  for (const it of items) {
    counts[it.kind] += 1;
    if (it.forMe) counts.forMe += 1;
    if (it.live) counts.live += 1;
  }

  return {
    dealId: deal?.id || null,
    company: deal?.company || null,
    items,
    counts,
    // Per source: was this read from Microsoft 365 for this person, or composed?
    // Reported separately because they fail separately — a tenant can have channel
    // access working and mailbox search refused, and saying "live" as one flag would
    // be a claim about the mailbox we did not earn.
    live: {
      channel: liveMsgs.length > 0,
      files: liveFileHits.length > 0,
      mail: liveMailHits.length > 0,
    },
  };
}

/**
 * The query used to find this deal's material in Microsoft 365.
 *
 * Company name, plus the code name when the deal has one, because a live process is
 * as often discussed under "Project Meridian" as under the target's own name. Kept
 * deliberately narrow: a broader query returns a tidier-looking feed made of things
 * that have nothing to do with the deal, which is worse than a short one.
 */
export function searchTermsFor(deal) {
  const terms = [deal?.company, deal?.codeName, deal?.projectName]
    .map((t) => String(t || '').trim())
    .filter((t) => t.length >= 3);
  const unique = [...new Set(terms)];
  if (!unique.length) return null;
  return unique.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
}
