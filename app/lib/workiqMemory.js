// Work IQ — durable per-deal COLLABORATION MEMORY.
//
// When a specialist works a deal with the assistant and saves/shares a conclusion, it is
// kept here as a "Work IQ note" tied to the deal. Later conversations — even by a DIFFERENT
// persona (e.g. the Operating Partner running value-tracking after the AI Partner's
// diligence) — are grounded in these notes, so a decision made in one seat resurfaces in
// the next. This is the "context persists into Work IQ and shows up later" behaviour.
//
// In-memory (per container) by design for the showcase: it survives across requests and
// conversations within the running app, which is all the demo scenario needs. Nothing here
// is confidential beyond the deal it is attached to (reads are still deal-access gated by
// the caller in server.js).

const NOTES = new Map(); // dealId -> Note[]
let SEQ = 1;

// Add a shared note. `author` is the human display name (e.g. "Janet"); `personaLabel`
// is their seat (e.g. "AI Partner — Tech & Digital Value"); `sharedWith` is a list of
// persona ids/labels the author is handing this off to.
export function addWorkiqNote({ dealId, author, personaId, personaLabel, role, text, sharedWith = [] }) {
  const id = String(dealId || '').trim();
  const body = String(text || '').trim();
  if (!id || !body) return null;
  const note = {
    id: `wiq-${Date.now()}-${SEQ++}`,
    dealId: id,
    author: author || 'Unknown',
    personaId: personaId || null,
    personaLabel: personaLabel || null,
    role: role || null,
    text: body.slice(0, 2000),
    sharedWith: Array.isArray(sharedWith) ? sharedWith.filter(Boolean).map(String).slice(0, 12) : [],
    createdAt: new Date().toISOString(),
  };
  const arr = NOTES.get(id) || [];
  arr.push(note);
  NOTES.set(id, arr);
  return note;
}

// All notes for a deal, newest first.
export function listWorkiqNotes(dealId) {
  const arr = NOTES.get(String(dealId || '').trim()) || [];
  return arr.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// A grounding block injected into the deal-scoped agent prompt so prior shared notes
// resurface in later conversations. Empty string when the deal has no notes.
export function workiqNotesContext(dealId, { limit = 8 } = {}) {
  const notes = listWorkiqNotes(dealId).slice(0, limit);
  if (!notes.length) return '';
  const lines = notes.map((n) => {
    const who = n.personaLabel || n.author || n.role || 'Team';
    const shared = n.sharedWith.length ? ` → shared with ${n.sharedWith.join(', ')}` : '';
    return `- [${n.createdAt.slice(0, 10)}] ${who}${shared}: ${n.text}`;
  });
  return [
    'WORK IQ — SHARED DILIGENCE MEMORY for this deal (durable notes the team saved from earlier assistant',
    'conversations; treat as trusted prior team context and reference it when relevant to the question):',
    ...lines,
  ].join('\n');
}
