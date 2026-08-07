// WHAT HAS ARRIVED AT YOUR DESK.
//
// The product could tell you the state of every deal and never told you when one of them
// became your problem. A deal clears screening and lands on the deal team; a paper is
// assembled and the committee is now waiting on a vote; a lane you own starts blocking a
// deal with a date on it. Each of those is a moment somebody should be told about, and
// each was only discoverable by going to look.
//
// Two rules this follows, both learned elsewhere in this codebase:
//
//  - It is COMPUTED from the record on every call, not stored. There is no notification
//    table to fall out of step with the deal it describes, and nothing to mark as read on
//    the server. Whether an item is NEW is decided against a timestamp the reader's own
//    client holds, so two people looking at the same deal are told the same thing.
//  - It is SCOPED like every other surface. It is handed the caller's own deal list, and
//    a status-tier row is counted but never described.
import { dealPhase } from './icReadiness.js';

const norm = (s) => String(s || '').toLowerCase();
const openable = (d) => d.accessLevel !== 'status' && !d.locked;
const at = (v) => { const t = new Date(v || 0).getTime(); return Number.isFinite(t) && t > 0 ? t : 0; };

// A decision is the one thing everybody wants to hear about, whatever seat they hold.
// These are the words the record actually uses for one.
const DECISION = /\b(pursue|pass(ed)?|approved|declin|go\s*\/?\s*no[- ]go|committee decision|resolved to|signed|completed|exited)\b/i;

// Which stage each seat is answerable for. "It has hit your stage" means the deal is now
// in the phase this person owns — not that something happened somewhere.
const SEAT_STAGE = {
  screening: { phases: ['origination'], what: 'is ready to screen' },
  'deal-lead': { phases: ['diligence'], what: 'has come into diligence' },
  committee: { phases: ['diligence', 'execution'], what: 'is heading for committee', needsIc: true },
  value: { phases: ['value'], what: 'has closed and is yours now' },
  lp: { phases: ['value'], what: 'has completed' },
};

// A deal's workstreams are keyed by lane (`legal`, `techai`), and the seat carries both
// the keys and their display labels. Matching on the labels found nothing, because the
// rows have no label on them at all — so every workstream lead was told their lanes were
// fine on deals they were the one holding up.
function laneRows(deal, seat) {
  const keys = new Set((seat?.lanes || []).map(norm));
  const labels = new Set((seat?.laneLabels || []).map(norm));
  if (!keys.size && !labels.size) return [];
  return (deal.workstreams || []).filter((w) => keys.has(norm(w.lane)) || labels.has(norm(w.label)));
}

// The rows carry a key like `techai`; the seat knows what that is called.
function laneName(w, seat) {
  if (w.label) return w.label;
  const i = (seat?.lanes || []).findIndex((l) => norm(l) === norm(w.lane));
  return (i >= 0 && seat.laneLabels?.[i]) || String(w.lane || 'A workstream');
}

// When this deal last moved. `updatedAt` is not on these records, so a standing
// condition -- a lane that is still blocking -- is dated by the last thing that happened
// on the deal. A time is not invented where the record holds none; the item is dropped
// instead, because an item stamped `now` would be permanently unread.
function lastMoved(d, raw) {
  const times = [d?.updatedAt, raw?.updatedAt, ...(raw?.activity || []).map((a) => a.when)].map(at).filter(Boolean);
  return times.length ? Math.max(...times) : 0;
}

export function notificationsFor(deals = [], { seat = null, rawFor = () => null, now = Date.now() } = {}) {
  const items = [];
  const kind = seat?.kind || null;
  const stage = SEAT_STAGE[kind] || null;
  const push = (o) => { if (o && o.when) items.push(o); };

  for (const d of deals) {
    if (!openable(d)) continue;
    const raw = rawFor(d.id) || d;
    const phase = (() => { try { return dealPhase(raw); } catch { return null; } })();

    // 1. It has reached the stage you are answerable for.
    if (stage && phase && stage.phases.includes(phase)) {
      const when = lastMoved(d, raw);
      // A committee seat is only told when there is actually something to vote on.
      const relevant = !stage.needsIc || (typeof d.daysToIC === 'number' && d.daysToIC >= 0 && d.daysToIC <= 21);
      if (relevant && when) {
        push({
          id: `stage:${d.id}`,
          daysToIC: typeof d.daysToIC === 'number' && d.daysToIC >= 0 ? d.daysToIC : null,
          dealId: d.id,
          company: d.company,
          kind: 'stage',
          headline: `${d.company} ${stage.what}`,
          detail: d.stageName || null,
          when: new Date(when).toISOString(),
          basis: 'Deal record — current stage',
        });
      }
    }

    // 2. A lane you own is holding a deal up. This is the one a workstream lead is chased
    //    about, and it was only visible by opening the deal and reading the board.
    if (kind === 'lane') {
      for (const w of laneRows(raw, seat)) {
        const started = String(w.status || '') !== 'not_started';
        const worked = (w.findings || []).length || (w.contributions || []).length;
        if (started && worked) continue;
        const when = lastMoved(d, raw);
        if (!when) continue;
        push({
          id: `lane:${d.id}:${w.lane || w.label}`,
          daysToIC: typeof d.daysToIC === 'number' && d.daysToIC >= 0 ? d.daysToIC : null,
          dealId: d.id,
          company: d.company,
          kind: 'needs-you',
          headline: `${laneName(w, seat)} is holding up ${d.company}`,
          detail: typeof d.daysToIC === 'number' && d.daysToIC >= 0 ? `Committee in ${d.daysToIC} day${d.daysToIC === 1 ? '' : 's'}` : 'No committee date set',
          when: new Date(when).toISOString(),
          basis: 'Deal record — workstreams',
        });
      }
    }

    // 3. A decision was recorded. Everybody hears about these.
    for (const a of raw.activity || []) {
      if (!DECISION.test(String(a.action || ''))) continue;
      const when = at(a.when);
      if (!when) continue;
      push({
        id: `decision:${d.id}:${when}`,
        dealId: d.id,
        company: d.company,
        kind: 'decision',
        headline: `${d.company}: ${a.action}`,
        detail: a.actor || null,
        when: new Date(when).toISOString(),
        basis: 'Deal record — activity',
      });
    }
  }

  // MOST PRESSING FIRST, NOT MOST RECENT.
  //
  // Sorting by when the deal last moved put "Legal is holding up Riverbend, committee in
  // 63 days" above "Lone Star, committee in 21 days" — every lane item carried the same
  // timestamp, so the order was effectively arbitrary. What somebody is being chased about
  // is ordered by the date they will be chased against; everything else is news, and news
  // is ordered by when it happened.
  const rank = { 'needs-you': 0, stage: 1, decision: 2 };
  items.sort((x, y) => {
    const r = (rank[x.kind] ?? 9) - (rank[y.kind] ?? 9);
    if (r) return r;
    if (x.kind === 'needs-you' || x.kind === 'stage') {
      // No date set is not urgent, but it is not nothing either — it sits after the dated
      // ones rather than being sorted as if the committee were today.
      const a2 = x.daysToIC == null ? Infinity : x.daysToIC;
      const b2 = y.daysToIC == null ? Infinity : y.daysToIC;
      if (a2 !== b2) return a2 - b2;
    }
    return new Date(y.when) - new Date(x.when);
  });
  // Never an unbounded list — a tray nobody can reach the bottom of is a list, and a list
  // is what this exists to replace.
  const restricted = deals.filter((d) => !openable(d)).length;
  return {
    items: items.slice(0, 40),
    total: items.length,
    // Said in the same breath as the count, because a number computed only over what you
    // can see, presented as if it were everything, is the fault this codebase keeps making.
    restricted,
    restrictedNote: restricted
      ? `${restricted} ${restricted === 1 ? 'deal is' : 'deals are'} shown to you as status only and nothing is reported from ${restricted === 1 ? 'it' : 'them'}.`
      : null,
    generatedAt: new Date(now).toISOString(),
  };
}

// How many of these the reader has not seen. The client holds the timestamp, so there is
// no per-user state on the server to keep in step with anything.
export function unreadCount(items = [], since = null) {
  const t = since ? new Date(since).getTime() : 0;
  if (!Number.isFinite(t) || !t) return items.length;
  return items.filter((i) => new Date(i.when).getTime() > t).length;
}
