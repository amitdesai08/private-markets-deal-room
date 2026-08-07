// ANSWERS WE ALREADY HAVE.
//
// Measured against the live service: the assistant takes 21 seconds to say "what is ready
// for the next IC", makes ZERO tool calls doing it, and the latency is entirely token
// generation — the same question answered in one line comes back in 6. Computing IC
// readiness for the whole book, from the record, takes 3 milliseconds.
//
// So the product was paying twenty-one seconds to have a model read out a number it had
// already worked out. These are the questions the product itself puts on screen as
// suggestion chips, which makes them the ones most likely to be clicked; they are answered
// here from the record, with the same scoping every other surface uses, and they cannot be
// got wrong because nothing is being generated.
//
// The rule for adding to this file: only answer where the record gives a complete answer.
// A half-answer with a confident tone is worse than the twenty-one seconds.
import { computeICReadiness } from './icReadiness.js';
import { ownerLabel } from './cockpit.js';

const norm = (s) => String(s || '').toLowerCase().trim();

// Detail may only be read off deals this caller can actually open. A status-tier row is
// counted in the book and never described.
const openable = (d) => d.accessLevel !== 'status' && !d.locked;

function withheldNote(deals) {
  const n = deals.filter((d) => !openable(d)).length;
  return n ? ` ${n} ${n === 1 ? 'deal shows' : 'deals show'} status only at your access level and ${n === 1 ? 'is' : 'are'} not described here.` : '';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function boardsFor(deals, rawFor) {
  const out = [];
  for (const d of deals) {
    if (!openable(d)) continue;
    const raw = rawFor(d.id);
    if (!raw) continue;
    try { out.push({ deal: d, board: computeICReadiness(raw), raw }); } catch { /* skip */ }
  }
  return out;
}

const ANSWERS = [
  // "How many deals do I have in view?"
  {
    match: (m) => /how many deals/.test(m) && /(in |my )?view|do i have|are there/.test(m),
    answer: ({ deals }) => ({
      reply: deals.length
        ? `You have ${plural(deals.length, 'deal', 'deals')} in view.${withheldNote(deals)}`
        : 'You have no deals in view yet.',
      citations: ['Deal list'],
    }),
  },

  // "What is ready for the next IC?"
  {
    match: (m) => /(ready|readiness)/.test(m) && /\bic\b|committee/.test(m) && !/why|not ready/.test(m),
    answer: ({ deals, rawFor }) => {
      const boards = boardsFor(deals, rawFor);
      if (!boards.length) return null;
      const ready = boards.filter((b) => b.board.verdict?.state === 'READY');
      const notReady = boards.filter((b) => b.board.verdict?.state === 'NOT-READY');
      if (!ready.length) {
        const worst = notReady[0];
        return {
          reply: [
            `Nothing is ready for committee. ${plural(notReady.length, 'deal is', 'deals are')} short of the bar.`,
            worst ? `${worst.deal.company} is the nearest: ${worst.board.verdict.headline}` : null,
            withheldNote(deals).trim() || null,
          ].filter(Boolean).join('\n\n'),
          citations: ['IC readiness board'],
        };
      }
      return {
        reply: [
          `${plural(ready.length, 'deal is', 'deals are')} ready for committee: ${ready.map((b) => b.deal.company).join(', ')}.`,
          notReady.length ? `${plural(notReady.length, 'other is', 'others are')} not: ${notReady.slice(0, 4).map((b) => b.deal.company).join(', ')}.` : null,
          withheldNote(deals).trim() || null,
        ].filter(Boolean).join('\n\n'),
        citations: ['IC readiness board'],
      };
    },
  },

  // "Which of my deals have IC conditions still open, and who owns them?"
  {
    match: (m) => /condition/.test(m) && /(open|outstanding|still)/.test(m),
    answer: ({ deals, rawFor }) => {
      const boards = boardsFor(deals, rawFor);
      if (!boards.length) return null;
      const rows = boards
        .map((b) => ({
          company: b.deal.company,
          open: (b.board.conditions || []).filter((c) => c.status !== 'met' && c.status !== 'satisfied'),
        }))
        .filter((r) => r.open.length);
      if (!rows.length) {
        return {
          reply: `No deal you can see carries an open IC condition.${withheldNote(deals)}`,
          citations: ['IC readiness board — post-committee obligations'],
        };
      }
      const lines = rows.map((r) => {
        const owners = [...new Set(r.open.map((c) => (c.owner ? ownerLabel(c.owner, null) || c.owner : null)).filter(Boolean))];
        return `- ${r.company}: ${plural(r.open.length, 'open condition', 'open conditions')}${owners.length ? ` — ${owners.join(', ')}` : ' — no owner recorded'}`;
      });
      return {
        reply: [`${plural(rows.length, 'deal carries', 'deals carry')} conditions that are still open.`, lines.join('\n'), withheldNote(deals).trim() || null]
          .filter(Boolean).join('\n\n'),
        citations: ['IC readiness board — post-committee obligations'],
      };
    },
  },

  // "When is the next investment committee?"
  {
    match: (m) => /(when|next).*(\bic\b|committee)/.test(m) && !/ready|condition/.test(m),
    answer: ({ deals }) => {
      const dated = deals
        .filter((d) => openable(d) && typeof d.daysToIC === 'number' && d.daysToIC >= 0)
        .sort((a, b) => a.daysToIC - b.daysToIC);
      if (!dated.length) {
        return {
          reply: `No deal you can see has a committee date ahead of it.${withheldNote(deals)}`,
          citations: ['Deal record — target IC date'],
        };
      }
      const n = dated[0];
      return {
        reply: `The next IC is in ${plural(n.daysToIC, 'day', 'days')}, for ${n.company}.${dated.length > 1 ? ` Then ${dated[1].company} in ${plural(dated[1].daysToIC, 'day', 'days')}.` : ''}${withheldNote(deals)}`,
        citations: ['Deal record — target IC date'],
      };
    },
  },
];

// Returns a grounded answer, or null when the record does not give a complete one.
export function answerFromRecord({ message, deals, rawFor }) {
  const m = norm(message);
  if (!m || !Array.isArray(deals) || typeof rawFor !== 'function') return null;
  for (const a of ANSWERS) {
    if (!a.match(m)) continue;
    let out = null;
    try { out = a.answer({ deals, rawFor }); } catch { return null; }
    if (out && out.reply) return { ...out, source: 'record', orchestration: 'record' };
  }
  return null;
}
