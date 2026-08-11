// Work IQ — durable per-deal COLLABORATION MEMORY.
//
// When a specialist works a deal with the assistant and saves/shares a conclusion, it is
// kept here as a "Work IQ note" tied to the deal. Later conversations — even by a DIFFERENT
// persona (e.g. the Operating Partner running value-tracking after the AI Partner's
// diligence) — are grounded in these notes, so a decision made in one seat resurfaces in
// the next. This is the "context persists into Work IQ and shows up later" behaviour.
//
// DURABILITY: a demo corpus (data/workiqSeed.js) is re-seeded on every boot so Work IQ is
// populated out of the box and survives restarts; user-added notes are persisted to the
// durable `events` collection (Cosmos on the deployed app) and re-hydrated at startup. The
// in-memory Map is the fast read path in front of that store. Reads are still deal-access
// gated by the caller in server.js.

import { WORKIQ_SEED_NOTES } from '../data/workiqSeed.js';
import { upsert, list, removeEvent } from './repo/index.js';

const NOTES = new Map(); // dealId -> Note[]
let SEQ = 1;
const EVENT_TYPE = 'workiq-note';

function pushNote(note) {
  const arr = NOTES.get(note.dealId) || [];
  if (arr.some((x) => x.id === note.id)) return; // idempotent (seed / hydrate dedupe)
  arr.push(note);
  NOTES.set(note.dealId, arr);
}

// Seed the demo corpus at module load so Work IQ is populated on every boot (survives restart).
for (const n of WORKIQ_SEED_NOTES) pushNote({ ...n, seeded: true });

// Re-hydrate user-added notes persisted to the durable `events` collection. Called once at
// startup (after the repo is initialised). No-op on the in-memory store — seed remains.
let hydrated = false;
export async function hydrateWorkiqNotes() {
  if (hydrated) return { hydrated: 0 };
  hydrated = true;
  let n = 0;
  try {
    const docs = await list('events');
    for (const d of docs || []) {
      if (d?.type !== EVENT_TYPE || !d.note?.id) continue;
      pushNote(d.note);
      n += 1;
    }
  } catch { /* memory store / no persistence — seed only */ }
  return { hydrated: n };
}

// Add a shared note. `author` is the human display name (e.g. "Janet"); `personaLabel`
// is their seat (e.g. "AI Partner — Tech & Digital Value"); `sharedWith` is a list of
// persona ids/labels the author is handing this off to.
export function addWorkiqNote({ dealId, author, personaId, personaLabel, role, text, sharedWith = [], channelPost = false, postedToTeams = false, ephemeral = false }) {
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
    // Said in the deal's conversation rather than filed against a workstream, and whether
    // it also reached the Teams channel. A reader has to be able to tell the difference:
    // a message that stayed in the Deal Room was not seen by anyone watching Teams.
    channelPost: !!channelPost,
    postedToTeams: !!postedToTeams,
    ephemeral: !!ephemeral,
    createdAt: new Date().toISOString(),
  };
  pushNote(note);
  // Durable persistence (survives restart on Cosmos/blob; best-effort — never blocks).
  // An ephemeral note is deliberately skipped: a walkthrough is allowed to demonstrate the
  // conversation, not to leave anything behind on the deal.
  if (!note.ephemeral) {
    Promise.resolve()
      .then(() => upsert('events', { id: note.id, companyId: note.dealId, type: EVENT_TYPE, note }))
      .catch(() => {});
  }
  return note;
}

// All notes for a deal, newest first.
export function listWorkiqNotes(dealId) {
  const arr = NOTES.get(String(dealId || '').trim()) || [];
  return arr.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Delete a note (from the in-memory map and the durable store). Returns whether it existed.
export function deleteWorkiqNote(dealId, id) {
  const key = String(dealId || '').trim();
  const arr = NOTES.get(key) || [];
  const idx = arr.findIndex((n) => n.id === id);
  if (idx >= 0) { arr.splice(idx, 1); NOTES.set(key, arr); }
  Promise.resolve().then(() => removeEvent(id, key)).catch(() => {});
  return idx >= 0;
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
