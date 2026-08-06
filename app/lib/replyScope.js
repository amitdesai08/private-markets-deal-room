// A last line of defence over anything an assistant says.
//
// The routes, the tool layer and the shared MCP were all scoped, and an analyst asking
// "name every deal in the fund" was still read seven companies it cannot open, with their
// cheque sizes. Somewhere between a correctly-scoped context and the reply, the model
// obtained names it was never handed. For a disclosure boundary that is not a bug to
// chase in prose and hope; it is a check to enforce.
//
// This does not excuse the root cause. It guarantees the outcome while the root cause is
// found, in the same way the figures guard checks the numbers rather than trusting the
// instruction not to invent them.
import { listDeals, getDealRaw, listAllDealsUnscoped } from './store.js';
import { dealAccessLevel } from './userPolicy.js';

// Every company name on the book that THIS caller may not see.
function hiddenNames(identity, viewAsRole) {
  const visible = new Set(listDeals(identity, viewAsRole).map((d) => d.id));
  const out = [];
  // The whole book, deliberately — this is counting what the caller CANNOT see, so it has
  // to know about all of it. Named, so a reader can tell it apart from a call that forgot.
  for (const s of listAllDealsUnscoped()) {
    if (visible.has(s.id)) continue;
    const raw = getDealRaw(s.id);
    if (dealAccessLevel(identity, raw, viewAsRole) === 'full') continue;
    if (s.company) out.push({ id: s.id, company: String(s.company) });
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Returns { text, redacted } — redacted lists what was removed, for the audit line.
//
// THE BANNER IS A PROPERTY OF THE SEAT, NOT OF THE QUESTION. It used to be appended only
// when something had actually been removed, which made its presence a direct answer to
// "is the name I just asked about real". Measured from a member seat: three real hidden
// companies produced the banner, three fabricated ones never did, zero false positives.
// Repeat that four or five times and you have a reliable existence test against the whole
// book from a seat with no deal access at all — the redaction succeeding IS the leak, which
// is why the test asserting hidden names are absent from the body cannot see it.
export function redactHiddenDeals(text, identity, viewAsRole) {
  if (!text) return { text, redacted: [] };
  let hidden;
  try { hidden = hiddenNames(identity, viewAsRole); } catch { return { text, redacted: [] }; }
  if (!hidden.length) return { text, redacted: [] };

  let s = String(text);
  const hit = hidden.filter((h) => s.includes(h.company));
  const note = '\n\n_This answer covers the deals you are on. There are others in the firm, restricted to their named teams — ask a deal-team member or an administrator if you should be on one._';
  if (!hit.length) return { text: (s.trim() + note), redacted: [] };

  // A whole line naming a hidden deal goes, rather than leaving the sentence around it —
  // "— 640 EUR" with the company removed still discloses that a deal of that size exists.
  const lines = s.split('\n');
  const kept = lines.filter((line) => !hit.some((h) => line.includes(h.company)));
  s = kept.join('\n');
  // Anything left inline (mid-sentence) is replaced rather than deleted.
  for (const h of hit) s = s.replace(new RegExp(escape(h.company), 'g'), 'a deal you are not on');

  return { text: (s.trim() + note), redacted: hit.map((h) => h.id) };
}
