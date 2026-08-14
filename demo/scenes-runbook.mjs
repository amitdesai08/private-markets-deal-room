// The scenes the runbook needs that the walkthrough never visits.
//
// docs/demos/DEMO-RUNBOOK.md runs a different spine to the walkthrough: it opens on access
// rather than closing on it, and it covers four things the walkthrough skips entirely —
// working the deal together, the specialist agents, the M365 data sources, and where the
// board-ready documents come from.
//
// Captured into their own manifest so the walkthrough deck is unaffected:
//   node demo/capture.mjs --scenes scenes-runbook.mjs --manifest scenes-runbook-raw.json

export { BASE } from './scenes.mjs';

export const ACTS = [
  { n: 40, title: 'Work the deal together' },
  { n: 41, title: 'Talk to the specialists' },
  { n: 42, title: 'Where the data comes from' },
  { n: 43, title: 'Board-ready documents' },
];

export const SCENES = [
  {
    id: 'rb-notifications',
    act: 40,
    title: 'What landed on me',
    seat: 'partner',
    steps: [{ goto: '#/overview' }, { waitText: 'Daily briefing' }, { clickText: '🔔' }, { wait: 2500 }],
    say: `The notification bell counts whatever has reached this seat's own stage: a deal advancing into the phase
      it owns, a workstream it leads that is blocking, a go or no-go recorded. Switching seats changes the list with
      the person, so the General Counsel sees legal lanes and an observer sees none, since nobody is told about work
      that is not theirs. It is the same need-to-know model as the deal list, applied to alerts.`,
  },
  {
    id: 'rb-channel',
    act: 40,
    title: 'The conversation lives in the deal',
    seat: 'partner',
    steps: [{ goto: '#/deals' }, { wait: 2500 }, { openDeal: 'Helvetia' }, { clickText: '# Deal channel' }, { wait: 3000 }],
    say: `The deal channel, opened from the deal header, keeps the conversation inside the deal rather than linking
      out to it: the thread, an AI catch-up of what happened since yesterday, and the decisions and commitments the
      product has detected but will not record on its own. A posted message states where it lives, since one that
      reached the Teams channel is attributed there under a real name, while one that stayed here is tagged Deal Room
      only, so nobody assumes the channel has seen it. It posts as the person signed in, never as the app, and when
      it cannot do that, it says so rather than posting anyway.`,
  },
  {
    id: 'rb-papers',
    act: 43,
    title: 'A finished first draft, not a blank page',
    seat: 'partner',
    steps: [{ clickText: 'Papers' }, { wait: 3000 }, { scrollTop: 0 }],
    say: `Every deal's data room arrives pre-populated with a full committee pack: the memo in Word, the deck in
      PowerPoint, the deal and returns models in Excel, all drafted from the live record and dropped straight into
      the room. A team opens to a finished first draft rather than a blank page, and every document actually opens,
      whether as a preview in place, on the web in Microsoft 365, or in the desktop app. Nothing here is a dead
      link.`,
  },
  {
    id: 'rb-assistant-apply',
    act: 41,
    title: 'It proposes; a person approves',
    seat: 'partner',
    steps: [{ clickText: '💬 Ask the assistant' }, { wait: 3500 }],
    say: `Inside a deal the assistant does more than answer. It proposes concrete next steps grounded in this
      deal's state, such as logging a blocking workstream as an issue or marking one resolved, and it never acts on
      its own. Each proposal appears as a chip that a named person has to apply, and applying it writes the change to
      the live record along with a fully attributed audit entry. That is the governance answer to whether the AI can
      change things: yes, but only when a named person approves, and always on the record.`,
  },
  {
    id: 'rb-audit',
    act: 41,
    title: 'Who did what, when',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { goto: '#/deals' }, { wait: 2500 }, { openDeal: 'Helvetia' },
      { clickText: 'Audit trail' }, { wait: 3000 }],
    say: `The audit trail, beside the deal channel, is where that change lands, recording who did what and when,
      with a badge on every assistant-applied change showing which person approved it. The assistant drafts and
      proposes. The record remembers which human said yes.`,
  },
  {
    id: 'rb-specialists',
    act: 41,
    title: 'One assistant, the whole deal team behind it',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: '💬 Ask the assistant' }, { wait: 3500 }],
    say: `Opened outside a deal, the same assistant answers across the whole portfolio. A returns question brings
      back the Fund CFO's view, and a value-creation question brings back the Operating Partner's, because behind
      that single assistant, the right experts get pulled in automatically: sourcing, screening, diligence,
      modelling, committee memo, value creation, and the reply states who weighed in. The arithmetic stays the
      product's own; the model is used to interpret and explain it, not to do the sums.`,
  },
  {
    id: 'rb-sources',
    act: 42,
    title: 'Files, chats and email — governed',
    seat: 'partner',
    steps: [{ closeOverlay: true }, { clickText: '⚙' }, { wait: 3000 }, { scrollTo: 'Data source' }],
    say: `Connecting files, chats and email under Settings gives the internal agents governed, delegated access to
      a deal's own SharePoint files, its Teams channel and its correspondence, so a diligence question can draw on
      the real documents rather than a summary of them. The external news tool can never reach inside a firm's
      documents, since that boundary is enforced and logged, and a firm can register its own provider too, whether an
      internal API or a subscription it already holds, with an honest reachability test rather than a faked
      connected badge.`,
  },
  {
    id: 'rb-templates',
    act: 43,
    title: 'Your firm\u2019s paper, not a vendor\u2019s',
    // Admin-only, and reachable at last: the capture now presents a real Entra identity, so
    // the roster's administrator seat resolves to the admin role instead of being floored.
    seat: 'admin',
    steps: [{ goto: '#/settings' }, { wait: 3500 }, { clickText: 'Document templates' }, { wait: 2500 },
      { scrollTop: 0 }],
    say: `Document templates, reachable only by an administrator, set the fund name, the accent and ink colours,
      the confidentiality label and the disclaimer, and choose which sections appear: investment merits, financial
      summary, valuation and returns, the value creation plan, findings by workstream. The preview shows the cover
      exactly as the committee will receive it, and every document generated afterward follows suit, so it looks like
      a firm's own paper rather than a vendor's, adopted without re-templating a thing.`,
  },
];
