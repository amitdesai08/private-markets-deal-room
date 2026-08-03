// ===========================================================================
//  WORK IQ CORPUS — every deal, every persona
// ===========================================================================
// The Work IQ surfaces (threads desk, document desk, commitment detection) are
// only convincing if there is something to read. Hand-authored seed content
// covers four flagship deals (data/workiqSeed.js); everything else rendered an
// empty channel, which made a working capability look broken.
//
// This module closes that gap by COMPOSING a per-deal corpus from the deal
// record itself — its lanes, lane owners, findings, key figures, IC date and
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
import { laneLabel, ownerLabel, icPending, daysUntil } from './cockpit.js';
import { detectCommitments, detectDecisions } from './dealDesk.js';
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

// ---------------------------------------------------------------------------
//  Who is in the room
// ---------------------------------------------------------------------------
// Lane owners are stored as persona ids. `ownerLabel` already resolves those to
// a human name (and humanises unknown slugs like "esg-md" into "ESG MD"), which
// is what belongs on a message.
function speaker(personaId, lane) {
  return {
    id: personaId || null,
    name: ownerLabel(personaId, lane),
    title: (personaId && personaById[personaId]?.title) || null,
  };
}

// The fund-level seats that appear on every deal regardless of lane ownership,
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
// The shape of a deal war room: the lead frames the gate, each lane owner
// reports against its OWN recorded progress, someone makes a commitment with a
// date (so commitment detection has something real to find), and the sponsor
// closes with a decision (so decision detection does too).
//
// Every sentence is built from `deal`, so the channel and the deal record can
// never disagree.

const money = (n, ccy = 'USD') => {
  if (n == null) return null;
  const sym = ccy === 'EUR' ? '€' : ccy === 'GBP' ? '£' : ccy === 'CHF' ? 'CHF ' : '$';
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

function laneReport(rand, deal, w) {
  const v = voiceFor(w.lane);
  const label = laneLabel(w.lane);
  const p = w.progress ?? 0;
  const finding = (w.findings || [])[0];
  // A lane that has recorded a finding should say that finding — it is the most
  // useful thing in the room and it is already on the record.
  if (finding?.text) {
    const lead = finding.severity === 'positive' ? 'Supportive read' : 'Flagging';
    return `${label} at ${p}%. ${lead}: ${finding.text}${finding.source ? ` (${finding.source})` : ''} Still working ${v.work}.`;
  }
  if (p === 0) {
    return pick(rand, [
      `${label} has not started — I need the data-room folder opened before I can scope ${v.work}. Calling out ${v.risk} as the thing this lane exists to answer.`,
      `${label} is not open yet. Nothing here is a red flag; it is simply unstarted, and it will gate the pack if it stays that way.`,
    ]);
  }
  if (p >= 100) {
    return pick(rand, [
      `${label} is complete. ${v.artefact.charAt(0).toUpperCase() + v.artefact.slice(1)} is in the data room and I have no unresolved items on ${v.risk}.`,
      `${label} closed out at 100%. Findings are written up in the ${v.artefact}; happy to walk anyone through ${v.work}.`,
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
function commitmentMessage(rand, deal, w) {
  const v = voiceFor(w.lane);
  const who = speaker(w.owner, w.lane);
  const when = pick(rand, ['by Thursday', 'by Friday', 'by end of Monday', 'in 3 days', 'next week']);
  const text = pick(rand, [
    `Taking the action on ${laneLabel(w.lane)} — I'll circulate the ${v.artefact} ${when} so the lane stops gating the pack.`,
    `I'll run ${v.work} and send the ${v.artefact} to the channel ${when}.`,
    `Happy to own this one: I'll draft the ${v.artefact} covering ${v.work} ${when}.`,
  ]);
  return { from: who.name, personaId: who.id, created: at(1, 9, 25), preview: text };
}

function decisionMessage(rand, deal) {
  const sponsor = speaker(deal.sponsorPersona || 'partner', null);
  const pre = icPending(deal);
  const d = pre ? daysUntil(deal.targetICDate) : null;
  const clock = d == null ? '' : d < 0 ? ` The target IC date passed ${Math.abs(d)} days ago, so this is overdue.`
    : ` IC is ${d} days out.`;
  const text = pick(rand, [
    `Agreed — we go to committee on the base case only, with any upside shown as a clearly labelled conditional case.${clock}`,
    `Decided: lane owners confirm their dates in this channel, and we do not move the gate without a written reason.${clock}`,
    `Signed off on the approach below. Nothing goes in the pack that is not sourced to the record.${clock}`,
  ]);
  return { from: sponsor.name, personaId: sponsor.id, created: at(0, 8, 15), preview: text };
}

function generatedChannel(deal) {
  const rand = rng(seedOf(`${deal.id}:channel`));
  const lanes = (deal.workstreams || []).slice(0, 4);
  const lead = speaker(deal.leadAnalyst || 'principal', null);
  const size = money(deal.dealSize, deal.currency);
  const pre = icPending(deal);
  const d = pre ? daysUntil(deal.targetICDate) : null;

  const messages = [];

  // 1) The deal lead frames where the deal actually is.
  const openLines = [
    `${deal.company} — ${deal.stageName || deal.stage}${size ? `, ${size} EV` : ''}. ${
      d == null ? 'No IC date is pending on this one.'
        : d < 0 ? `We are ${Math.abs(d)} days past the target IC date.`
        : `IC is ${d} days out.`
    } Lane owners, please post status here rather than by email so the record stays in one place.`,
    `Kicking off the week on ${deal.company}. Current step is ${deal.currentStep || deal.stage}${
      typeof deal.readiness === 'number' ? ` and diligence progress sits at ${deal.readiness}%` : ''
    }. Post blockers in the channel — I would rather hear them early.`,
  ];
  messages.push({ from: lead.name, personaId: lead.id, created: at(4, 8, 40), preview: pick(rand, openLines) });

  // 2) Each lane owner reports against its own recorded progress.
  lanes.forEach((w, i) => {
    const who = speaker(w.owner, w.lane);
    messages.push({
      from: who.name,
      personaId: who.id,
      lane: w.lane,
      created: at(3 - Math.min(i, 2), 10 + i, 5 + i * 7),
      preview: laneReport(rand, deal, w),
    });
  });

  // 3) A dated commitment on the lane that is furthest behind.
  const behind = [...lanes].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0))[0];
  if (behind) messages.push(commitmentMessage(rand, deal, behind));

  // 4) The IR/LP seat, so the fund-facing persona has something on every deal.
  const ir = speaker('ir-lp', null);
  messages.push({
    from: ir.name,
    personaId: 'ir-lp',
    created: at(1, 15, 10),
    preview: `LP-facing note: two investors have asked how ${deal.company} is classified for reporting. I'll prepare the position-level summary next week — I only need the final ${
      deal.sector ? `${deal.sector.toLowerCase()} ` : ''
    }exposure numbers from the model.`,
  });

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

function generatedFiles(deal) {
  const out = [];
  const co = deal.company;
  const kf = (deal.keyFigures || []).map((k) => `${k.label} ${k.value}`).join('; ');
  out.push({
    deal: deal.id,
    name: `${co} — Information Memorandum.pdf`,
    type: 'driveItem',
    summary: kf ? `Company overview and financial profile. ${kf}.` : 'Company overview, market position and financial profile.',
    lastModified: at(9, 11),
  });
  out.push({
    deal: deal.id,
    name: `${co} — Returns Model.xlsx`,
    type: 'driveItem',
    summary: `Entry case${deal.dealSize ? ` at ${money(deal.dealSize, deal.currency)} EV` : ''}, leverage, base/bull/bear sensitivity and the exit bridge.`,
    lastModified: at(2, 16, 30),
  });
  (deal.workstreams || []).forEach((w, i) => {
    const f = LANE_FILE[w.lane];
    if (!f) return;
    out.push({
      deal: deal.id,
      name: `${co} — ${f[0]}`,
      type: 'driveItem',
      summary: `${f[1]} Workstream ${w.progress ?? 0}% complete${(w.findings || [])[0]?.text ? ` — ${w.findings[0].text}` : ''}`,
      lastModified: at(3 + i, 9 + i, 20),
    });
  });
  if (icPending(deal)) {
    out.push({
      deal: deal.id,
      name: `${co} — IC Memo (Draft).docx`,
      type: 'driveItem',
      summary: `Investment committee memo skeleton — thesis, diligence findings and the recommendation. ${
        typeof deal.readiness === 'number' ? `Readiness ${deal.readiness}%.` : ''
      }`,
      lastModified: at(1, 17, 45),
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
  const rand = rng(seedOf(`${deal.id}:mail`));
  const co = deal.company;
  const slug = String(co).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  const out = [
    {
      deal: deal.id,
      subject: `${co} — data room access and process letter`,
      from: `advisor@${slug}-sellside.example`,
      to: 'principal',
      received: at(6, 9, 5),
      preview: `Refreshed data-room access for the deal team and attached the process letter. Management sessions can be booked from next week; the vendor QoE follows shortly.`,
    },
    {
      deal: deal.id,
      subject: `${co} — indicative financing terms`,
      from: 'coverage@lead-bank.example',
      to: 'fund-cfo',
      received: at(3, 14, 20),
      preview: `Indicative senior terms attached${deal.dealSize ? ` against a ${money(deal.dealSize, deal.currency)} enterprise value` : ''}. Happy to walk the covenant headroom and the hedging options on a call this week.`,
    },
    {
      deal: deal.id,
      subject: `LP query — reporting treatment for ${co}`,
      from: 'ir@northstar-lp.example',
      to: 'ir-lp',
      received: at(1, 8, 30),
      preview: `Ahead of the quarterly letter, could you confirm the classification and the ILPA-aligned template you will use for this position? Two of our investors have asked specifically.`,
    },
  ];
  if ((deal.workstreams || []).some((w) => w.lane === 'legal')) {
    out.push({
      deal: deal.id,
      subject: `${co} — SPA mark-up and consent list`,
      from: 'partner@counsel.example',
      to: 'legal-gc',
      received: at(2, 11, 15),
      preview: pick(rand, [
        'Returning the mark-up with the warranty package and a first cut of the change-of-control consent list. Two consents look time-critical.',
        'Attached the revised SPA with our comments on the indemnity cap and the consent schedule. Suggest we walk it before the next lane call.',
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
