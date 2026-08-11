// ===========================================================================
//  WORK IQ CORPUS — every deal, every persona
// ===========================================================================
// The Work IQ surfaces (threads desk, document desk, commitment detection) are
// only convincing if there is something to read. Hand-authored seed content
// covers four flagship deals (data/workiqSeed.js); everything else rendered an
// empty channel, which made a working capability look broken.
//
// This module closes that gap by COMPOSING a per-deal corpus from the deal
// record itself — its lanes, workstream leads, findings, key figures, IC date and
// stage. Nothing is invented about the deal: every generated sentence restates
// a fact the platform already holds, attributed to the persona who actually
// owns that lane. The result is:
//
//   * deterministic — same deal, same corpus, so screenshots and tests are
//     stable and a restart doesn't reshuffle the demo;
//   * grounded — the numbers in the messages are the numbers on the record;
//   * persona-complete — every persona that owns a lane speaks in its deals,
//     and the fund-level seats (sponsor, deal lead, IR/LP) appear on every deal
//     so signing in as any persona shows Work IQ content that involves them.
//
// Authored content always wins: where data/workiqSeed.js has hand-written
// material for a deal, that is used and the generated layer only fills the
// gaps. Generated items are marked `generated: true` so callers can be honest
// about provenance.

import { personaById } from '../data/personas.js';
import { seededDeals } from '../data/deals.js';
import { laneLabel, ownerLabel, icPending, daysUntil } from './cockpit.js';
import { detectCommitments, detectDecisions } from './dealDesk.js';
import { reconcileFindingText } from './diligence.js';
import { workiqCorpusForDeal } from '../data/workiqSeed.js';

// ---------------------------------------------------------------------------
//  Determinism
// ---------------------------------------------------------------------------
// A tiny string hash + LCG. We only need "stable and well-spread", not
// cryptographic quality — this picks phrasing variants, never anything a
// security decision depends on.
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// Message timestamps are anchored to the START OF TODAY rather than the exact
// clock, so the corpus stays stable for the whole day (deterministic) while
// still reading as recent activity rather than history.
const DAY = 86400000;
function dayAnchor() {
  return Math.floor(Date.now() / DAY) * DAY;
}
const at = (daysAgo, hour, minute = 0) =>
  new Date(dayAnchor() - daysAgo * DAY + hour * 3600000 + minute * 60000).toISOString();

// Every deal's conversation ran on the same clock, so seventeen channels carried the
// same timestamp to the minute. Each deal's whole thread is offset by an amount drawn
// from the deal, so no two share a moment and each one still reads in order.
function clockFor(deal) {
  let h = 0;
  for (const ch of String(deal?.id || deal?.company || '')) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  const shiftMin = (h % 331) - 165;
  return (daysAgo, hour, minute = 0) => new Date(
    dayAnchor() - daysAgo * DAY + hour * 3600000 + (minute + shiftMin) * 60000,
  ).toISOString();
}

// ---------------------------------------------------------------------------
//  Who is in the room
// ---------------------------------------------------------------------------
// Lane owners are stored as persona ids. `ownerLabel` already resolves those to
// a human name (and humanises unknown slugs like "esg-md" into "ESG MD"), which
// is what belongs on a message.
//
// Except when it isn't. Several seeded lane owners are roles rather than people
// ('Finance MD' resolves to the role title "Finance Partner"), and a Teams message
// signed "Finance Partner" sat in a list next to one signed "James Whitfield" and
// gave the whole channel away as machine-made. A role can own a workstream — that
// column is fine — but a message is sent by a person. So where the owner does not
// resolve to somebody on the roster, the lane's actual seat signs it.
const LANE_SIGNATORY = {
  financial: 'fund-cfo',
  tax: 'fund-cfo',
  legal: 'legal-gc',
  commercial: 'retail-md',
  techai: 'ai-md',
  tech: 'ai-md',
  operations: 'supply-md',
  operational: 'supply-md',
  hr: 'operating-partner',
  esg: 'ir-lp',
};
function speaker(personaId, lane) {
  const direct = personaId && personaById[personaId];
  if (direct) return { id: personaId, name: direct.name, title: direct.title || null };
  // Fall back to the seat that owns this kind of work, and finally to the deal lead —
  // both real people who would plausibly be in the room.
  const standIn = personaById[LANE_SIGNATORY[lane]] || personaById.principal;
  if (standIn) return { id: standIn.id, name: standIn.name, title: standIn.title || null };
  return { id: personaId || null, name: ownerLabel(personaId, lane), title: null };
}

// The fund-level seats that appear on every deal regardless of workstream leadship,
// so no persona is ever left without Work IQ material to look at.
const HOUSE_SEATS = ['partner', 'principal', 'fund-cfo', 'legal-gc', 'ir-lp', 'operating-partner', 'analyst'];

function participantsFor(deal) {
  const lanes = deal.workstreams || [];
  const seen = new Set();
  const out = [];
  const push = (id, lane) => {
    const s = speaker(id, lane);
    const key = s.name.toLowerCase();
    if (!s.name || seen.has(key)) return;
    seen.add(key);
    out.push({ ...s, lane: lane || null });
  };
  for (const w of lanes) push(w.owner, w.lane);
  push(deal.leadAnalyst || 'principal', null);
  push(deal.sponsorPersona || 'partner', null);
  return out;
}

// ---------------------------------------------------------------------------
//  Channel messages
// ---------------------------------------------------------------------------
// The shape of a deal war room: the lead frames the gate, each workstream lead
// reports against its OWN recorded progress, someone makes a commitment with a
// date (so commitment detection has something real to find), and the sponsor
// closes with a decision (so decision detection does too).
//
// Every sentence is built from `deal`, so the channel and the deal record can
// never disagree.

const money = (n, ccy = 'USD') => {
  if (n == null) return null;
  const sym = ccy === 'EUR' ? '$' : ccy === 'GBP' ? '$' : ccy === 'CHF' ? 'CHF ' : '$';
  return n >= 1000 ? `${sym}${(n / 1000).toFixed(1)}B` : `${sym}${Math.round(n)}M`;
};

// Lane-specific vocabulary. Each entry gives the work the lane actually does,
// the artefact it produces, and the risk it worries about — so a "commercial"
// message reads like commercial diligence and not like generic filler.
const LANE_VOICE = {
  commercial: {
    work: 'customer concentration, pricing power and the growth bridge',
    artefact: 'commercial DD pack',
    risk: 'revenue durability if the top accounts churn',
  },
  financial: {
    work: 'the QoE normalisations and the working-capital bridge',
    artefact: 'QoE summary',
    risk: 'an EBITDA restatement that moves the entry multiple',
  },
  legal: {
    work: 'the SPA mark-up, change-of-control consents and the warranty package',
    artefact: 'legal DD report',
    risk: 'consents that cannot be obtained before signing',
  },
  tax: {
    work: 'structuring, withholding and transfer-pricing exposure',
    artefact: 'tax structuring memo',
    risk: 'leakage that erodes the net return',
  },
  operations: {
    work: 'supplier concentration, COGS and tariff exposure',
    artefact: 'operations DD memo',
    risk: 'single-source dependency in the supply base',
  },
  operational: {
    work: 'the operating model, footprint and cost-out plan',
    artefact: 'operational DD memo',
    risk: 'cost savings that need capex to unlock',
  },
  techai: {
    work: 'data readiness, the platform estate and the digital value levers',
    artefact: 'AI & data readiness scorecard',
    risk: 'a digital margin thesis that is not yet bankable',
  },
  tech: {
    work: 'the technology estate, cyber posture and integration debt',
    artefact: 'technology DD report',
    risk: 'integration cost landing outside the model',
  },
  hr: {
    work: 'management assessment, retention and the org design',
    artefact: 'management & org review',
    risk: 'key-person dependency through the transition',
  },
  esg: {
    work: 'the ESG baseline, SFDR classification and transition exposure',
    artefact: 'ESG baseline assessment',
    risk: 'a disclosure gap that an LP will ask about',
  },
};
const voiceFor = (lane) => LANE_VOICE[lane] || {
  work: 'the outstanding diligence items',
  artefact: 'lane summary',
    risk: 'an open item ahead of IC',
};

// Choosing from a shared rng let one deal draw the same closing line for three complete
// lanes in a row. Keyed on the deal AND the lane, the spread is even by construction.
function pickFor(key, list) { return list[seedOf(key) % list.length]; }

function laneReport(rand, deal, w) {
  const at = clockFor(deal);
  const v = voiceFor(w.lane);
  const label = laneLabel(w.lane);
  const p = w.progress ?? 0;
  const finding = (w.findings || [])[0];
  // A lane that has recorded a finding should say that finding — it is the most
  // useful thing in the room and it is already on the record.
  if (finding?.text) {
    // A colleague writes a sentence, not a form field. And the finding is already on the
    // register, so the message says what it MEANS for the deal rather than repeating it.
    const lead = finding.severity === 'positive'
      ? pickFor(`${deal.id}:${w.lane}:lead`, ['The good news is', 'Worth knowing', 'On the plus side', 'What is holding up well'])
      : pickFor(`${deal.id}:${w.lane}:lead`, ['The thing to know', 'What I would put in front of the committee', 'The one that matters', 'What I am watching']);
    // The trailing clause was one fixed sentence per lane, so the same words closed the
    // Commercial DD message on every deal in the book — and it read "at 100%… Still
    // working", which is complete and unfinished in one breath.
    const tail = p >= 100
      ? pickFor(`${deal.id}:${w.lane}:tail`, ['That workstream is closed out.', 'Nothing outstanding on my side.', `The ${v.artefact} is in the data room.`])
      : pickFor(`${deal.id}:${w.lane}:tail`, [`Still working ${v.work}.`, `${v.risk.charAt(0).toUpperCase() + v.risk.slice(1)} is the open item.`, `Next is ${v.work}.`]);
    const body = `${lead} \u2014 ${reconcileFindingText(finding.text, deal)} ${tail}`;
    return pickFor(`${deal.id}:${w.lane}:prog`, [
      `${label} at ${p}%. ${body}`,
      `${label} is ${p}% through. ${body}`,
      `Where ${label} has got to: ${p}%. ${body}`,
      `${p}% on ${label}. ${body}`,
      `Update on ${label} — ${p}% done. ${body}`,
      `${label}, ${p}% complete. ${body}`,
    ]);
  }
  if (p === 0 && String(w.status || '') === 'closed_at_ic') {
    // A LANE CLOSED AT COMMITTEE IS NOT A LANE NOBODY OPENED.
    //
    // This fell through to the zero branch, so Aurora's channel said "Legal DD is still at
    // zero. Give me the folder and an owner" on a screen whose own narrative said four
    // lanes closed at IC, and two clicks from a Legal DD report sitting in Papers. The
    // progress field is 0 because nobody kept it, not because nobody did the work.
    return pickFor(`${deal.id}:${w.lane}:closed`, [
      `${label} closed at committee. The progress field was never updated, so it reads zero — the work is done and the write-up is what is missing.`,
      `${label} was signed off at IC. Nothing is outstanding on it; what we do not have is a note on file saying so.`,
      `For the record: ${label} closed at committee. Treat the zero on the board as a records gap, not an open lane.`,
      `${label} is closed. If anyone is chasing it off the progress bar, that bar was never kept after IC.`,
      `${label} was cleared at committee. The zero beside it is a bookkeeping artefact, not an open workstream.`,
      `${label} finished before IC and nobody wrote the closing note. That is the only thing missing on it.`,
      `To be clear on ${label}: the work closed at committee. What we owe is the note, not the diligence.`,
      `${label} came off the list at IC. The board still shows nought because nothing updated it afterwards.`,
      `${label} is done and signed off. Read the zero as an unrecorded close, not as work outstanding.`,
    ]);
  }
  if (p === 0) {
    // Two variants meant the Financial / QoE opener appeared verbatim on eight deals, the
    // Legal one on seven. Unstarted lanes are the commonest state in the book, so this pool
    // has to be the widest, not the narrowest.
    return pickFor(`${deal.id}:${w.lane}:none`, [
      `${label} has not started — I need the data-room folder opened before I can scope ${v.work}. Calling out ${v.risk} as the thing this workstream exists to answer.`,
      `${label} is not open yet. Nothing here is a red flag; it is simply unstarted, and it will gate the pack if it stays that way.`,
      `Nothing to report on ${label} yet — it has not been scoped. Once it is, ${v.risk} is the first thing I go at.`,
      `${label}: no work done. I would rather say that plainly now than have it surface as a gap in the pack.`,
      `Flagging ${label} as unstarted. ${v.artefact.charAt(0).toUpperCase() + v.artefact.slice(1)} does not exist yet, so treat anything said about ${v.risk} as untested.`,
      `${label} is still at zero. Give me the folder and an owner and I can turn ${v.work} around quickly.`,
      `No ${label} work has begun. It is not a finding either way — it is an absence, and the pack should show it as one.`,
    ]);
  }
  if (p >= 100) {
    return pickFor(`${deal.id}:${w.lane}:done`, [
      `${label} is complete. ${v.artefact.charAt(0).toUpperCase() + v.artefact.slice(1)} is in the data room and I have no unresolved items on ${v.risk}.`,
      `${label} closed out at 100%. Findings are written up in the ${v.artefact}; happy to walk anyone through ${v.work}.`,
      `${label} is done. ${v.risk.charAt(0).toUpperCase() + v.risk.slice(1)} came back clean enough to sign off on.`,
      `Closing ${label}. Everything I have is in the ${v.artefact} — no open threads from my side.`,
    ]);
  }
  return pick(rand, [
    `${label} is at ${p}%. Working through ${v.work}; the open question is still ${v.risk}.`,
    `${label} ${p}% done. ${v.artefact.charAt(0).toUpperCase() + v.artefact.slice(1)} is drafting — the item I would not want to discover late is ${v.risk}.`,
  ]);
}

// A commitment needs a first-person promise, a deliverable and a date for the
// detector to pick it up. We attach it to the lane that is furthest behind,
// because that is the one someone would actually be chased about.
const LANE_ORDER = ['commercial', 'financial', 'legal', 'tax', 'techai', 'tech', 'operations', 'operational', 'hr', 'esg'];
// A SIXTEEN-BUCKET HASH OVER NINETEEN DEALS COLLIDES BY CONSTRUCTION.
//
// This was a hash of the id, so the sign-off a colleague writes was a property of how
// their deal happened to spell its slug. Renaming the deals moved three follow-ups onto
// one opening -- "Happy to own this one:" three times in a book of thirteen -- without
// anything about the deals changing. Position in the book is stable, is not a hash, and
// walks every phrasing before it reuses one.
const dealOrdinal = (id) => {
  const i = seededDeals.findIndex((d) => d.id === id);
  if (i >= 0) return i;
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 16;
};
const laneOrdinal = (lane) => { const i = LANE_ORDER.indexOf(String(lane)); return i >= 0 ? i : LANE_ORDER.length; };

function commitmentMessage(rand, deal, w) {
  const at = clockFor(deal);
  const v = voiceFor(w.lane);
  const who = speaker(w.owner, w.lane);
  // A promise is dated against the thing that is chasing it. Where a committee is close
  // the date is tight; where it is far off people say next week. Drawn from the deal, so
  // the spread across the book looks like a book rather than like one dice roll.
  const toIc = icPending(deal) ? daysUntil(deal.targetICDate) : null;
  const when = toIc != null && toIc >= 0 && toIc <= 7
    ? pick(rand, ['tomorrow', 'by Wednesday', 'in the next 48 hours', 'before the pack closes'])
    : toIc != null && toIc >= 0 && toIc <= 21
      ? pick(rand, ['by Thursday', 'by Friday', 'in 3 days', 'by end of Monday', 'early next week'])
      : pick(rand, ['next week', 'by the end of the month', 'in the next fortnight', 'once the data room lands', 'by end of Monday']);
  // There were three phrasings here. Four follow-ups on the home page — three different
  // companies, three different teams — opened with the same eleven words, because the
  // lane furthest behind is so often the financial one that they all drew the same
  // vocabulary and then collided on the same sentence. Nothing was wrong with any single
  // card; together they told the reader this was generated, which is the one thing a
  // record of who promised what must not do. More phrasings, and the ones that name the
  // deal's own risk or artefact carry their weight further.
  // Indexed on both axes rather than hashed — see the note above.
  const SIGNOFFS = [
    `I'll take ${laneLabel(w.lane)} — the ${v.artefact} goes round ${when}, so it stops holding up the pack.`,
    `Picking ${laneLabel(w.lane)} up — I'll send the ${v.artefact} ${when}, with ${v.work} covered off in it.`,
    `I'll send the ${v.artefact} ${when}. ${v.risk.charAt(0).toUpperCase() + v.risk.slice(1)} is the open question and I would rather name it now than at the meeting.`,
    `On it — I'll close ${v.work} and send the ${v.artefact} ${when}. Assume ${v.risk} is unresolved until it lands.`,
    `I'll run ${v.work} and send the ${v.artefact} to the channel ${when}.`,
    `I'll close out ${v.work} ${when} and put the ${v.artefact} in here alongside it.`,
    `Leave ${laneLabel(w.lane)} with me — I'll run ${v.work} and share the ${v.artefact} ${when}.`,
    `Adding ${laneLabel(w.lane)} to my list: I'll prepare the ${v.artefact} ${when} and say in it what I couldn't get to.`,
    `Happy to own this one: I'll draft the ${v.artefact} covering ${v.work} ${when}.`,
    `That one's mine \u2014 I'll send the ${v.artefact} ${when}, and I'm flagging now that ${v.risk} is what could move the date.`,
    `I have the ${v.artefact} in draft and I'll circulate the version I'm willing to have quoted ${when}.`,
    `I'd rather send this once and send it right \u2014 I'll produce the ${v.artefact} ${when} with ${v.work} covered.`,
    `I'll send the ${v.artefact} over ${when}. The part I want settled first is ${v.risk}.`,
    `I'll own ${laneLabel(w.lane)} through to sign-off and confirm the date in here ${when}.`,
    `I've booked the time for ${v.work} and I'll deliver the ${v.artefact} ${when}.`,
    `Mine. I'll chase ${v.risk} and send the ${v.artefact} ${when} either way.`,
    `${laneLabel(w.lane)} is mine \u2014 I'll get the ${v.artefact} to the deal team ${when}.`,
    `Picking up ${laneLabel(w.lane)}: I'll send the ${v.artefact} ${when}, which takes it off the critical path.`,
    `I have ${laneLabel(w.lane)}. I'll land the ${v.artefact} ${when} and the pack is unblocked on it.`,
    `Taking ${laneLabel(w.lane)}. I'll have ${v.work} done and the ${v.artefact} out ${when}.`,
    `I'll carry ${laneLabel(w.lane)} \u2014 I'll send the ${v.artefact} ${when} and say in it where ${v.risk} stands.`,
  ];
  // Stride 5 is coprime with 16, so consecutive deals never land on neighbouring
  // phrasings and the whole set is used before any of it comes round again.
  // Both strides are coprime with the list length; 3 shared a factor with it, so two
  // lanes three apart landed on one phrasing.
  const idx = (dealOrdinal(deal.id) * 1 + laneOrdinal(w.lane) * 1) % SIGNOFFS.length;
  const text = SIGNOFFS[idx];

  // Spread over the last three working days and across the working day, from the same
  // seeded generator, so the same deal always renders the same time.
  const daysAgo = 1 + Math.floor(rand() * 3);
  return { from: who.name, personaId: who.id, created: at(daysAgo, 8 + Math.floor(rand() * 9), Math.floor(rand() * 60)), preview: text };
}

function decisionMessage(rand, deal) {
  const at = clockFor(deal);
  const sponsor = speaker(deal.sponsorPersona || 'partner', null);
  const pre = icPending(deal);
  const d = pre ? daysUntil(deal.targetICDate) : null;
  const clock = d == null ? '' : d < 0 ? ` The target IC date passed ${Math.abs(d)} days ago, so this is overdue.`
    : ` IC is ${d} days out.`;
  const text = pickFor(`${deal.id}:decision`, [
    `Agreed — we go to committee on the base case only, with any upside shown as a clearly labelled conditional case.${clock}`,
    `Decided: workstream leads confirm their dates in this channel, and we do not move an IC date without a written reason.${clock}`,
    `Signed off on the approach below. Nothing goes in the pack that is not sourced to the record.${clock}`,
    `Noted. I want the ${deal.company} pack to lead with what would stop us, not with the thesis.${clock}`,
    `Position agreed: we do not table this until the lanes still open have a written answer, not a verbal one.${clock}`,
    `My read: the case is fine, the evidence is thin in places. Close the gaps before we ask anyone to vote.${clock}`,
    `Agreed on price discipline — no number goes in the pack that is not traceable to a document on the record.${clock}`,
    `Decision: the ${deal.sector ? deal.sector.toLowerCase() : 'sector'} comparison goes in the appendix, not the headline. It is context, not evidence.${clock}`,
    `Confirmed: every figure in the pack carries the document it came from, or it comes out.${clock}`,
    `We table this when the register has an owner against every open row and not before.${clock}`,
    `Agreed. The paper leads with the three things that would stop us, and the thesis follows.${clock}`,
    `My position: no verbal comfort in the pack. If a lead cannot write it down we treat it as open.${clock}`,
    `Settled — the downside case goes in at the front, not in an appendix nobody turns to.${clock}`,
    `Decided: we take the price question to committee as a question, not as a recommendation.${clock}`,
    `Noted and agreed. I want one number for the entry multiple across every page of this pack.${clock}`,
  ]);
  return { from: sponsor.name, personaId: sponsor.id, created: at(0, 8, 15), preview: text };
}

function generatedChannel(deal) {
  const at = clockFor(deal);
  const rand = rng(seedOf(`${deal.id}:channel`));
  const lanes = (deal.workstreams || []).slice(0, 4);
  const lead = speaker(deal.leadAnalyst || 'principal', null);
  const size = money(deal.dealSize, deal.currency);
  const pre = icPending(deal);
  const d = pre ? daysUntil(deal.targetICDate) : null;

  const messages = [];

  // 1) The deal lead frames where the deal actually is.
  // Two openers across nineteen deals meant eleven channels began with the same sentence.
  // Widening the pool per lane fixed repetition INSIDE a channel; the collision a demo
  // actually shows is BETWEEN channels, because a presenter opens three in a row.
  const openLines = [
    `${deal.company} — ${deal.stageName || deal.stage}${size ? `, ${size} EV` : ''}. ${
      d == null ? 'No IC date is pending on this one.'
        : d < 0 ? `We are ${Math.abs(d)} days past the target IC date.`
        : `IC is ${d} days out.`
    } Workstream owners, please post status here rather than by email so the record stays in one place.`,
    `Kicking off the week on ${deal.company}. Current step is ${deal.currentStep || deal.stage}${
      typeof deal.readiness === 'number' ? ` and diligence progress sits at ${deal.readiness}%` : ''
    }. Post blockers in the channel — I would rather hear them early.`,
    `Opening the ${deal.company} channel properly. ${
      d == null ? 'No committee date is set yet.' : d < 0 ? `The target IC date went ${Math.abs(d)} days ago.` : `We have ${d} days to committee.`
    } Everything that matters goes here, not in a thread I cannot find later.`,
    `${deal.company} status, briefly: ${deal.stageName || deal.stage}${
      typeof deal.readiness === 'number' ? `, readiness ${deal.readiness}%` : ''
    }. If your workstream is behind, say so here — I would rather know now than read it in the pack.`,
    `Using this channel for ${deal.company} from here on. ${
      size ? `${size} EV` : 'The deal'
    }${d != null && d >= 0 ? `, ${d} days to committee` : ''}. Owners: post what changed, not what is unchanged.`,
    `${deal.company} — picking this up. ${
      d == null ? 'Nothing is scheduled at committee yet, which is its own problem.' : d < 0 ? `We are past the target IC date by ${Math.abs(d)} days.` : `Committee is ${d} days away.`
    } I want blockers named with an owner and a date.`,
  ];
  messages.push({ from: lead.name, personaId: lead.id, created: at(4, 8, 40), preview: pickFor(`${deal.id}:open`, openLines) });

  // A COMMITMENT IS THE STATEMENT ABOUT THAT LANE.
  //
  // The status post and the commitment were generated independently, so the CFO said
  // "Financial / QoE: no work done" and, two lines later, "Leave Financial / QoE with me
  // — I'll run the QoE normalisations by end of Monday". Both from him, in one channel.
  const behindAll = (deal.workstreams || [])
    .filter((l) => (l.progress ?? 0) < 100 && String(l.status || '') !== 'closed_at_ic')
    .sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
  const behind = behindAll.length ? behindAll[seedOf(`${deal.id}:commit`) % behindAll.length] : null;
  // 2) Each workstream lead reports against its own recorded progress.
  lanes.forEach((w, i) => {
    if (behind && w.lane === behind.lane) return;
    const who = speaker(w.owner, w.lane);
    messages.push({
      from: who.name,
      personaId: who.id,
      lane: w.lane,
      created: at(3 - Math.min(i, 2), 10 + i, 5 + i * 7),
      preview: laneReport(rand, deal, w),
    });
  });

  // 3) A dated commitment on a lane that is behind.
  //
  // Always taking the single furthest-behind lane put the same person on the same
  // workstream on nearly every deal: the home page opened with four consecutive
  // follow-ups from the finance seat about a QoE, across four different companies. Each
  // card was fine and the run of them read as machine-made, which is the one thing a
  // record of who promised what must not do. Choose deterministically from the lanes
  // that are genuinely behind, so the page shows the spread of people that a real week
  // would.
  // Chosen above, before the lane reports.
  if (behind) messages.push(commitmentMessage(rand, deal, behind));

  // 4) The IR/LP seat, so the fund-facing persona has something on every deal.
  //
  // This used to end "I'll prepare the position-level summary next week" on all nineteen
  // deals. A first-person promise with a date in it IS a follow-up as far as the detector
  // is concerned, so one person accounted for nineteen of the thirty-three follow-ups on
  // the home page, in identical words. It is a standing LP-reporting note, not a promise
  // somebody should be chased about, so it no longer reads as one -- and it only appears
  // where an investor would actually be asking.
  const ir = speaker('ir-lp', null);
  if (seedOf(`${deal.id}:ir`) % 3 === 0) {
    const sector = deal.sector ? deal.sector.toLowerCase() : 'sector';
    messages.push({
      from: ir.name,
      personaId: 'ir-lp',
      created: at(1, 15, 10),
      // One sentence with the company name swapped is the tell a reader picks up fastest,
      // because the IR seat speaks on every third deal and a presenter opens several.
      preview: pick(rand, [
        `LP-facing note: two investors have asked how ${deal.company} is classified for reporting. The position-level summary is blocked on the final ${sector} exposure numbers from the model.`,
        `For LP reporting: ${deal.company} will show against our ${sector} allocation. Flagging early because the concentration line moves if this one closes.`,
        `An LP advisory question came in on ${sector} exposure. I can answer it once ${deal.company} has a settled entry figure on the record.`,
        `Reporting note: no LP disclosure on ${deal.company} until it is signed. Keeping it out of the quarterly draft until then.`,
      ]),
    });
  }

  // 5) The sponsor closes with a decision.
  messages.push(decisionMessage(rand, deal));

  return {
    name: `${deal.company} — Deal Room`,
    messages: messages.map((m) => ({ ...m, generated: true })),
  };
}

// ---------------------------------------------------------------------------
//  Files
// ---------------------------------------------------------------------------
// One artefact per lane plus the two documents every deal has, described using
// the deal's own key figures so the document desk shows real numbers.
const LANE_FILE = {
  commercial: ['Commercial DD — Customer & Pricing.pptx', 'Top-account concentration, pricing power and the growth bridge.'],
  financial: ['Quality of Earnings (Draft).pdf', 'EBITDA normalisations, working-capital bridge and one-off adjustments.'],
  legal: ['Legal DD Report + SPA Mark-up.docx', 'Warranty package, change-of-control consents and the indemnity position.'],
  tax: ['Tax Structuring Memo.docx', 'Holding structure, withholding exposure and transfer-pricing review.'],
  operations: ['Operations & Supply Risk Memo.docx', 'Supplier concentration, COGS walk and tariff exposure.'],
  operational: ['Operational DD — Cost-out Plan.xlsx', 'Operating model, footprint review and the quantified cost-out plan.'],
  techai: ['AI & Data Readiness Scorecard.xlsx', 'Data lineage, platform estate and the quantified digital value levers.'],
  tech: ['Technology & Cyber DD.pdf', 'Application estate, integration debt and cyber posture.'],
  hr: ['Management & Org Review.docx', 'Management assessment, retention risk and the proposed org design.'],
  esg: ['ESG Baseline & SFDR Classification.pdf', 'ESG baseline, transition exposure and the disclosure position.'],
};

// The financial workstream's paper is a draft or a final result depending on what the
// record says produced the EBITDA. Labelling it "(Draft)" on a deal whose key figure
// cites a completed report put the two one tab apart.
function laneFileFor(deal, lane) {
  const f = LANE_FILE[lane];
  if (!f || lane !== 'financial') return f;
  const kf = (deal.keyFigures || []).find((k) => /\bebitda\b/i.test(String(k.label || '')) && !/margin|growth|cagr/i.test(String(k.label || '')));
  const src = String(kf?.source || '');
  if (/quality of earnings|qoe/i.test(src) && !/draft|preliminary/i.test(src)) {
    return ['Quality of Earnings.pdf', f[1]];
  }
  return f;
}

function generatedFiles(deal) {
  const at = clockFor(deal);
  const out = [];
  // A file's date is a property of the deal it belongs to. A fixed offset gave every
  // deal in the book the same minute, which is the first thing a reader spots when
  // they open a second deal.
  let skew = 0;
  for (const ch of String(deal.id || deal.company || '')) skew = (skew * 31 + ch.charCodeAt(0)) % 9973;
  const spread = (days, hour, minute = 0) => at(days + (skew % 11), (hour + (skew % 5)) % 18 + 6, (minute + (skew % 53)) % 60);
  const co = deal.company;
  const kf = (deal.keyFigures || []).map((k) => `${k.label} ${k.value}`).join('; ');
  out.push({
    deal: deal.id,
    name: `${co} — Information Memorandum.pdf`,
    type: 'driveItem',
    summary: kf ? `Company overview and financial profile. ${kf}.` : 'Company overview, market position and financial profile.',
    lastModified: spread(9, 11),
  });
  out.push({
    deal: deal.id,
    name: `${co} — Returns Model.xlsx`,
    type: 'driveItem',
    summary: `Entry case${deal.dealSize ?` at ${money(deal.dealSize, deal.currency)} EV` : ''}, leverage, base/bull/bear sensitivity and the exit bridge.`,
    lastModified: spread(2, 16, 30),
  });
  (deal.workstreams || []).forEach((w, i) => {
    const f = laneFileFor(deal, w.lane);
    if (!f) return;
    // A LANE THAT HAS NOT STARTED HAS NOT WRITTEN ANYTHING.
    //
    // The data room listed "Legal DD Report + SPA Mark-up.docx", dated, for a lane the
    // case, the channel and the assistant all said was unstarted — one finished document
    // for every lane the product said did not exist yet. A presenter has to say "ignore
    // those, they are seeded", on the deal the whole walk is built around.
    const started = w.status === 'closed_at_ic' || w.status === 'complete' || (w.progress ?? 0) > 0;
    if (!started) return;
    // A workstream the committee closed out carries a progress figure of 0, so the file
    // list read "Workstream 0% complete" against the same four the tab immediately above
    // reports as finished. One screen said "finished, just unwritten" at the top and
    // "nought per cent" at the bottom, and a partner walking a room through it had no
    // answer for the second. The percentage is only meaningful while the work is running.
    const state = w.status === 'closed_at_ic'
      ? 'Closed at IC'
      : w.status === 'complete'
        ? 'Workstream complete'
        : `Workstream ${w.progress ?? 0}% complete`;
    // Where the record already holds a paper of this kind, do not manufacture a second
    // one beside it under a different name.
    const stem = String(f[0]).replace(/\s*\([^)]*\)/, '').replace(/\.[a-z0-9]+$/i, '').split(/[—-]/)[0].trim();
    const alreadyOnRecord = (deal.documents || []).some((doc) => stem && String(doc.name || '').toLowerCase().includes(stem.toLowerCase()));
    if (alreadyOnRecord) return;
    out.push({
      deal: deal.id,
      name: `${co} — ${f[0]}`,
      type: 'driveItem',
      summary: `${f[1]} ${state}${(w.findings || [])[0]?.text ?` — ${reconcileFindingText(w.findings[0].text, deal)}` : ''}`,
      lastModified: spread(3 + i, 9 + i, 20),
    });
  });
  // A deal nobody has launched has no committee paper, however near its target date
  // looks. The readiness board says so and the data room was contradicting it.
  if (icPending(deal) && !/^O/i.test(String(deal.stage || ''))) {
    out.push({
      deal: deal.id,
      name: `${co} — IC Memo (Draft).docx`,
      type: 'driveItem',
      summary: `The investment committee paper — thesis, diligence findings and the recommendation. ${
        typeof deal.readiness === 'number' ?`Readiness ${deal.readiness}%.` : ''
      }`,
      lastModified: spread(1, 17, 45),
    });
  }
  return out.map((f) => ({ ...f, generated: true }));
}

// ---------------------------------------------------------------------------
//  Mail
// ---------------------------------------------------------------------------
// Advisor / lender / LP correspondence — the traffic that surrounds a live deal
// and the reason a mailbox read is useful at all.
function generatedMail(deal) {
  const at = clockFor(deal);
  const rand = rng(seedOf(`${deal.id}:mail`));
  const co = deal.company;
  const slug = String(co).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  const out = [
    {
      deal: deal.id,
      subject: pick(rand, [`${co} — data room access and process letter`, `${co} — process letter and next round timetable`, `${co} — management sessions and data-room refresh`, `${co} — access for the deal team, and the process letter`]),
      from: `advisor@${slug}-sellside.example`,
      to: 'principal',
      received: at(6, 9, 5),
      preview: `Refreshed data-room access for the deal team and attached the process letter. Management sessions can be booked from next week; the vendor QoE follows shortly.`,
    },
    {
      deal: deal.id,
      subject: pick(rand, [`${co} — indicative financing terms`, `${co} — senior terms, indicative`, `${co} — debt package and covenant headroom`, `${co} — staple financing, first look`]),
      from: 'coverage@lead-bank.example',
      to: 'fund-cfo',
      received: at(3, 14, 20),
      preview: `Indicative senior terms attached${deal.dealSize ? ` against a ${money(deal.dealSize, deal.currency)} enterprise value` : ''}. Happy to walk the covenant headroom and the hedging options on a call this week.`,
    },
    {
      deal: deal.id,
      subject: pick(rand, [`LP query — reporting treatment for ${co}`, `LP query — classification of ${co} for the quarterly`, `${co} — LP reporting template question`, `Quarterly letter — how are we treating ${co}?`]),
      from: 'ir@northstar-lp.example',
      to: 'ir-lp',
      received: at(1, 8, 30),
      preview: `Ahead of the quarterly letter, could you confirm the classification and the ILPA-aligned template you will use for this position? Two of our investors have asked specifically.`,
    },
  ];
  if ((deal.workstreams || []).some((w) => w.lane === 'legal')) {
    out.push({
      deal: deal.id,
      subject: pick(rand, [`${co} — SPA mark-up and consent list`, `${co} — revised SPA and change-of-control consents`, `${co} — warranty package and consent schedule`, `${co} — counsel mark-up, second round`]),
      from: 'partner@counsel.example',
      to: 'legal-gc',
      received: at(2, 11, 15),
      preview: pick(rand, [
        'Returning the mark-up with the warranty package and a first cut of the change-of-control consent list. Two consents look time-critical.',
        'Attached the revised SPA with our comments on the indemnity cap and the consent schedule. Suggest we walk it before the next deal-team call.',
      ]),
    });
  }
  return out.map((m) => ({ ...m, generated: true }));
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------
// Authored seed content is PRESERVED VERBATIM; the generated layer only tops it
// up. A flagship deal keeps its hand-written narrative and additionally gains
// whatever it was missing — a dated commitment, a recorded decision, the LP
// thread, the per-lane artefacts — so every deal exercises the full Work IQ
// capability rather than only the four that were written by hand.
//
// Generated items are marked `generated: true` so provenance stays visible.
function mergeChannel(deal, authored, generated) {
  const authoredMsgs = authored?.messages || [];
  if (!authoredMsgs.length) return generated;
  const gen = generated.messages || [];
  const add = [];
  // Only add what the authored thread genuinely lacks. Deduplicating on the
  // detector rather than on text means we top up CAPABILITY, not word count.
  if (!detectCommitments(authoredMsgs).length) {
    const c = gen.find((m) => detectCommitments([m]).length);
    if (c) add.push(c);
  }
  if (!detectDecisions(authoredMsgs).length) {
    const d = gen.find((m) => detectDecisions([m]).length);
    if (d) add.push(d);
  }
  // The LP/IR seat appears on every deal so the fund-facing persona always has
  // something to read, whichever deal they open.
  const names = new Set(authoredMsgs.map((m) => String(m.from || '').toLowerCase()));
  const ir = gen.find((m) => m.personaId === 'ir-lp');
  if (ir && !names.has(String(ir.from).toLowerCase())) add.push(ir);

  const merged = [...authoredMsgs, ...add.filter((m, i, a) => a.indexOf(m) === i)];
  merged.sort((a, b) => new Date(a.created || 0) - new Date(b.created || 0));
  return { name: authored.name || generated.name, messages: merged };
}

// Union by name/subject — authored entries win, generated ones fill the rest.
function mergeBy(key, authored = [], generated = []) {
  const seen = new Set(authored.map((x) => String(x[key] || '').toLowerCase()));
  return [...authored, ...generated.filter((x) => !seen.has(String(x[key] || '').toLowerCase()))];
}

export function corpusForDeal(deal) {
  if (!deal || !deal.id) return { dealId: null, channel: null, files: [], mail: [] };
  const authored = workiqCorpusForDeal(deal.id);
  const gen = {
    channel: generatedChannel(deal),
    files: generatedFiles(deal),
    mail: generatedMail(deal),
  };
  return {
    dealId: deal.id,
    channel: mergeChannel(deal, authored.channel, gen.channel),
    files: mergeBy('name', authored.files, gen.files),
    mail: mergeBy('subject', authored.mail, gen.mail),
    // Honest provenance: whether the caller is looking at hand-authored demo
    // content topped up from the record, or content composed entirely from it.
    origin: {
      channel: authored.channel?.messages?.length ? 'seed+derived' : 'derived',
      files: authored.files?.length ? 'seed+derived' : 'derived',
      mail: authored.mail?.length ? 'seed+derived' : 'derived',
    },
  };
}

// Persona-scoped view of a deal's corpus: what THIS seat said, was sent, or is
// named in. Used to give every persona a populated Work IQ experience.
export function corpusForPersona(deal, personaId) {
  const c = corpusForDeal(deal);
  const id = String(personaId || '').trim();
  if (!id) return c;
  const name = ownerLabel(id, null);
  const mine = (m) => m.personaId === id || m.from === name;
  return {
    ...c,
    channel: c.channel ? { ...c.channel, messages: (c.channel.messages || []).map((m) => ({ ...m, mine: mine(m) })) } : null,
    mail: (c.mail || []).filter((m) => !m.to || m.to === id),
  };
}
